# Dual-provider OCR and Hindi-to-English translation

## How the current integration worked
The existing Section G button posted the selected image to `/api/vision/query-extract`. `server.js` used `@google-cloud/vision` and `documentTextDetection`, then mapped the recognized text to the Query Date, Bill/Invoice Reference, Amount, Party/Contractor, and Query Details fields.

## New architecture
- `services/ocrService.js` contains the shared `extractTextFromImage(imageBytes, mimeType)` service, Google Cloud Vision provider, Gemini image OCR provider, Devanagari/Hindi detection, and translation.
- `server.js` exposes the authenticated `/api/query/ocr-extract` endpoint. It validates image MIME type and magic bytes before calling the service.
- `public/app.js` calls the shared endpoint and fills the existing fields. It skips any field the user changes while the request is running.
- Existing `/api/vision/query-extract` and `/api/gemini/query-extract` routes are retained for compatibility, but Section G uses the new shared endpoint.

## Configure the provider
In your private `.env`, add/change only this provider value to switch OCR engines:

```env
OCR_PROVIDER=google-vision
```

or:

```env
OCR_PROVIDER=gemini
```

For Gemini OCR, `GEMINI_API_KEY` must be set. For automatic Hindi-to-English translation, `GEMINI_API_KEY` is also needed when using Google Cloud Vision, because Vision performs OCR and Gemini translates Hindi/mixed text. If translation fails after OCR succeeds, the original extracted text is kept and a warning is shown.

Optional model override:

```env
GEMINI_MODEL=gemini-3.8-flash
```

The service attempts the configured model and falls back to `gemini-3.5-flash` for supported temporary/model-availability failures. Gemini calls run on the server; the key is never included in frontend JavaScript.

Google Vision requires the Cloud Vision API enabled, a valid service account/ADC configuration, and billing enabled on the Google Cloud project. Ensure the `GOOGLE_APPLICATION_CREDENTIALS` path points to a valid JSON key file on your machine.

## Install/update
1. Stop the server (`Ctrl+C`).
2. Back up `server.js` and `public/app.js`.
3. Copy `server.js` into the project root, `public/app.js` into `public/`, and `services/ocrService.js` into a new `services/` folder.
4. Merge the `.gitignore` additions if your file has other local rules. Do not overwrite `.env`, `data/db.json`, `credentials/`, or uploaded files.
5. In `.env`, set `OCR_PROVIDER=google-vision` first. Keep the existing `GEMINI_API_KEY` secret there; do not paste it into source code.
6. Restart with `node server.js` and refresh with Ctrl+F5.

## Test cases
- Set `OCR_PROVIDER=google-vision`, upload a clear English image, and confirm the extracted fields populate.
- With Vision selected and a Gemini API key configured, test Hindi text and mixed Hindi-English text; the Query Details field should contain English translation.
- Set `OCR_PROVIDER=gemini`, restart, and repeat the English/Hindi/mixed tests to verify Gemini performs the OCR itself.
- Temporarily remove `GEMINI_API_KEY` while Vision is selected and test Hindi: OCR should still succeed and the original Hindi text should be preserved with a translation warning.
- Test an English-only image: it should not invoke translation.
- Edit Query Details while extraction is processing: the user's edit should be preserved.
- Test invalid file bytes/MIME and no-text images to verify clear errors/status messages.

## Important security note
The uploaded source archive contained a Google Cloud service-account JSON credential. This patch does not include `.env`, the credential JSON, the database, or uploaded documents. If the service-account key in the submitted archive is still active, revoke it in Google Cloud IAM and create a replacement, then update your private `.env`. Keep `credentials/`, `.env`, `data/db.json`, and `upload/` out of Git and shared ZIPs.
