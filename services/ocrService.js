const OCR_PROVIDER = String(process.env.OCR_PROVIDER || 'google-vision').trim().toLowerCase();
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();

function parseQueryFieldsFromText(ocrText) {
  const lines = String(ocrText || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const labeled = (patterns) => {
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        const m = lines[i].match(pattern);
        if (m) {
          const val = (m[1] || '').trim().replace(/^[:\-\s]+/, '');
          if (val) return val;
          if (lines[i + 1]) return lines[i + 1].trim();
        }
      }
    }
    return '';
  };
  let date = labeled([/(?:query\s*date|date\s*of\s*query|dated|date)\s*[:\-]?\s*(\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4})/i]);
  if (date) {
    const m = date.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (m) date = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    else {
      const y = date.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
      if (y) date = `${y[1]}-${y[2].padStart(2,'0')}-${y[3].padStart(2,'0')}`;
      else date = '';
    }
  }
  const ref = labeled([/(?:bill\s*(?:no|number)|invoice\s*(?:no|number)|bill\/invoice\s*(?:ref(?:erence)?|no|number)|voucher\s*(?:no|number))\s*[:#\-]?\s*([A-Z0-9\/-]+)/i]);
  const amountRaw = labeled([/(?:amount|bill\s*amount|payment\s*amount|value)\s*[:₹Rs.\s-]*([0-9][0-9,]*(?:\.\d{1,2})?)/i]);
  const amount = amountRaw.replace(/,/g,'');
  const party = labeled([/(?:party\s*name|contractor\s*name|name\s*of\s*contractor|vendor\s*name|supplier\s*name)\s*[:\-]?\s*(.+)/i]);
  const query = labeled([/(?:query|observation|audit\s*objection|remarks?|reason)\s*[:\-]?\s*(.+)/i]);
  return {
    query_date: date,
    bill_invoice_reference: ref,
    amount: /^\d+(?:\.\d{1,2})?$/.test(amount) ? amount : '',
    party_name: party,
    query_text: query || String(ocrText || '').trim()
  };
}

async function geminiGenerateText({ prompt, imageBytes, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini is required for this OCR provider or Hindi translation. Set GEMINI_API_KEY in the server .env file.');
  const models = [...new Set([GEMINI_MODEL, 'gemini-3.5-flash'].filter(Boolean))];
  let lastError = 'Gemini request failed.';
  for (const model of models) {
    try {
      const parts = [{ text: prompt }];
      if (imageBytes && mimeType) parts.push({ inline_data: { mime_type: mimeType, data: imageBytes.toString('base64') } });
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1 } }),
        signal: AbortSignal.timeout(45000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = payload?.error?.message || `Gemini returned HTTP ${response.status}.`;
        if ([404, 429, 500, 502, 503, 504].includes(response.status) && model !== models[models.length - 1]) continue;
        throw new Error(lastError);
      }
      const output = payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
      if (!output) throw new Error('Gemini returned no readable text.');
      return { text: output, model };
    } catch (error) {
      lastError = error?.message || 'Gemini request failed.';
      if (model !== models[models.length - 1] && /HTTP 404|HTTP 429|HTTP 5\d\d|not found|unavailable|high demand/i.test(lastError)) continue;
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}

async function translateHindiToEnglishIfNeeded(ocrText) {
  const original = String(ocrText || '').trim();
  if (!/[\u0900-\u097F]/u.test(original)) return { text: original, translated: false, warning: '', model: '' };
  try {
    const result = await geminiGenerateText({
      prompt: 'Translate the following OCR transcription into clear, faithful English for a municipal audit query form. It may contain Hindi and English mixed together. Translate Hindi portions into English; keep existing English portions, numbers, dates, names, bill references, abbreviations, and amounts unchanged wherever possible. Preserve numbering and line breaks. Do not summarize, add facts, guess unreadable words, or include commentary. Return only the translated text. If a word is unclear, preserve it as written rather than inventing a translation.\n\nOCR TRANSCRIPTION:\n' + original
    });
    return { text: result.text.trim(), translated: true, warning: '', model: result.model };
  } catch (error) {
    console.error('[OCR translation] ' + (error?.message || error));
    return { text: original, translated: false, warning: 'Hindi-to-English translation failed; the original OCR text was kept. ' + (error?.message || ''), model: '' };
  }
}

async function extractTextFromImage(imageBytes, mimeType) {
  const provider = OCR_PROVIDER;
  if (!['google-vision', 'gemini'].includes(provider)) {
    throw Object.assign(new Error(`Unsupported OCR_PROVIDER "${provider}". Use "google-vision" or "gemini".`), { statusCode: 500 });
  }
  let rawText = '';
  let model = '';
  if (provider === 'google-vision') {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON) {
      throw Object.assign(new Error('Google Cloud Vision credentials are not configured. Check GOOGLE_APPLICATION_CREDENTIALS.'), { statusCode: 503 });
    }
    const vision = require('@google-cloud/vision');
    const client = new vision.ImageAnnotatorClient();
    const [result] = await client.documentTextDetection({ image: { content: imageBytes } });
    rawText = String(result?.fullTextAnnotation?.text || result?.textAnnotations?.[0]?.description || '').trim();
  } else {
    const result = await geminiGenerateText({
      prompt: 'Transcribe all readable text from this image exactly as written. This is a municipal audit query document and may contain Hindi, English, or mixed Hindi-English. Preserve original script, spelling, line breaks, numbering, dates, names, amounts, and reference numbers. Do not translate, summarize, interpret, or invent missing text. Return only the transcription.',
      imageBytes,
      mimeType
    });
    rawText = result.text;
    model = result.model;
  }
  if (!rawText) return { provider, model, rawText: '', text: '', fields: { query_date:'', bill_invoice_reference:'', amount:'', party_name:'', query_text:'' }, translated:false, translationWarning:'', message:'No readable text detected. Try a clearer, well-lit image.' };
  const translation = await translateHindiToEnglishIfNeeded(rawText);
  const finalText = translation.text || rawText;
  const fields = parseQueryFieldsFromText(finalText);
  fields.query_text = finalText;
  return {
    provider,
    model: model || translation.model || '',
    rawText,
    text: finalText,
    fields,
    translated: translation.translated,
    translationWarning: translation.warning || '',
    message: translation.warning || ''
  };
}

module.exports = { extractTextFromImage, parseQueryFieldsFromText, translateHindiToEnglishIfNeeded };
