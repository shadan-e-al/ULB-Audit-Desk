require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT,'data');
const UPLOAD_DIR = path.join(ROOT,'upload');
const DB_FILE = path.join(DATA_DIR,'db.json');
const PORT = Number(process.env.PORT || 8080);
const SESSION_SECRET = process.env.SESSION_SECRET || 'CHANGE_THIS_SESSION_SECRET_FOR_PRODUCTION';
fs.mkdirSync(DATA_DIR,{recursive:true}); fs.mkdirSync(UPLOAD_DIR,{recursive:true});

function id(){return crypto.randomUUID();}
function now(){return new Date().toISOString();}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.pbkdf2Sync(password,salt,120000,64,'sha512').toString('hex');
  return `pbkdf2$120000$${salt}$${hash}`;
}
function verifyPassword(password,stored){
  try{const [,iters,salt,hash]=stored.split('$'); const h=crypto.pbkdf2Sync(password,salt,Number(iters),64,'sha512').toString('hex'); return crypto.timingSafeEqual(Buffer.from(h,'hex'),Buffer.from(hash,'hex'));}catch{return false;}
}
function sign(v){return crypto.createHmac('sha256',SESSION_SECRET).update(v).digest('hex');}
function makeCookie(userId){const exp=Date.now()+8*60*60*1000; const body=`${userId}.${exp}`; return `${body}.${sign(body)}`;}
function readCookie(req){const c=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sid=')); if(!c)return null; const p=decodeURIComponent(c.slice(4)).split('.'); if(p.length!==3)return null; const body=`${p[0]}.${p[1]}`; if(Number(p[1])<Date.now()||sign(body)!==p[2])return null; return p[0];}
function save(db){fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));}
function seed(){
  if(fs.existsSync(DB_FILE))return JSON.parse(fs.readFileSync(DB_FILE,'utf8'));
  const db={users:[],districts:[],ulbs:[],audits:[],form2:[],attendance:[],auditLogs:[],revenue:[],observations:[],checklists:[],checklistRecords:[]};
  const admin={id:id(),mobile:'9999999999',name:'System Administrator',role:'admin',active:true,password_hash:hashPassword('Admin@123'),created_at:now()}; db.users.push(admin);
  const districtDefs=[['Rajnandgaon',9],['Balod',9],['Kawardha',8],['Bemetara',11],['Durg',11]];
  for(const [name,count] of districtDefs){const d={id:id(),name,active:true};db.districts.push(d);for(let i=1;i<=count;i++)db.ulbs.push({id:id(),district_id:d.id,name:`${name} - ULB ${String(i).padStart(2,'0')}`,code:`${name.slice(0,3).toUpperCase()}-${String(i).padStart(2,'0')}`,latitude:null,longitude:null,geofence_radius:200,active:true});}
  save(db); return db;
}
let db=seed(); let changed=false; if(!Array.isArray(db.checklists)){db.checklists=[];changed=true;} if(!Array.isArray(db.checklistRecords)){db.checklistRecords=[];changed=true;} if(!Array.isArray(db.queryDocuments)){db.queryDocuments=[];changed=true;} if(changed)save(db);
function currentUser(req){const uid=readCookie(req); return uid?db.users.find(u=>u.id===uid && u.active):null;}
function log(user,entity,recordId,action,oldValue=null,newValue=null){db.auditLogs.push({id:id(),user_id:user?.id||null,entity,record_id:recordId,action,old_value:oldValue,new_value:newValue,timestamp:now()});save(db);}
function json(res,status,data,headers={}){const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body);}
function text(res,status,body,contentType='text/plain; charset=utf-8',headers={}){res.writeHead(status,{'Content-Type':contentType,...headers});res.end(body);}
function parseBody(req){return new Promise((resolve,reject)=>{let s='';let n=0;req.on('data',c=>{n+=c.length;if(n>15*1024*1024){reject(new Error('Payload too large'));req.destroy();return;}s+=c});req.on('end',()=>{if(!s)return resolve({});try{resolve(JSON.parse(s))}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)});}
function auth(req,res,roles=[]){const u=currentUser(req);if(!u){json(res,401,{error:'Authentication required'});return null;}if(roles.length&&!roles.includes(u.role)){json(res,403,{error:'Forbidden'});return null;}return u;}
function OFFICIAL_TITLE(type){return ({Contractor:'Checklist for Payment of Contractor',Consultancy:'Checklist for Payment of Consultancy',Manpower:'Checklist for Payment of Manpower / Service Provider','Store Purchase':'Checklist for Store Procurement / Purchase Bill','Employee Advance':'Checklist for Employee Advance / Recovery','Misc. Expenses':'Checklist for Miscellaneous Expenses / Contingency'})[type]||'ULB Audit Checklist';}
function monthName(m){return ['','January','February','March','April','May','June','July','August','September','October','November','December'][Number(m)]||m;}
function period(a){return db.audits.find(x=>x.id===a.audit_period_id)?.month||''}
function getAuditRows(q){let rows=db.audits.slice();if(q.ulb)rows=rows.filter(x=>x.ulb_id===q.ulb);if(q.fy)rows=rows.filter(x=>x.financial_year===q.fy);if(q.month)rows=rows.filter(x=>String(x.month)===String(q.month));return rows;}
function csvEscape(v){return `"${String(v??'').replace(/"/g,'""')}"`;}
function tableCsv(headers,rows){return [headers, ...rows].map(r=>r.map(csvEscape).join(',')).join('\n');}
function reportHtml(type,q){
  const rows=getAuditRows(q); const ulb=db.ulbs.find(x=>x.id===q.ulb); const district=db.districts.find(x=>x.id===ulb?.district_id); const month=monthName(q.month); const title=`Annexure ${type}`;
  const head=`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#111}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}th,td{border:1px solid #222;padding:6px;vertical-align:top}th{background:#eee}.sig{margin-top:60px;display:flex;justify-content:space-between}.small{font-size:12px}.right{text-align:right}@media print{button{display:none}body{margin:10mm}}</style></head><body>`;
  const foot=`<div class="sig"><div>Signature of Auditor</div><div>Name of Audit Firm: __________________</div></div><button onclick="window.print()">Print / Save PDF</button></body></html>`;
  if(type==='D1')return head+`<h2>Annexure –D-1</h2><p>To,<br>The Joint Director<br>Urban Administration & Development Department</p><p>Dear Sir,</p><p>We certify that we have conducted Pre-Audit/Internal Audit of ${ulb?.name||''} during the month of ${month}, ${q.year||q.fy||''} and have verified the vouchers, documents and books of accounts placed before us, and we sought and obtained necessary clarifications required for the audit.</p><p>As evidence of verification, we have duly put our seal & signature on the vouchers, etc. Provisional audit remarks were given to the Accounts Officer of the ULB, and all remarks complied with by him during the month have been deleted from the final report enclosed herewith.</p><p>The monthly Report is enclosed for your kind perusal.</p><p>Yours Sincerely,<br>For, __________________<br>Chartered Accountants</p><p>Authorized Representative<br>Encl: Annexure- D2-D7</p>${foot}`;
  if(type==='D2'){
    const audited=rows.filter(x=>x.audit_status==='Audited').length;const no=rows.filter(x=>x.payment_approved==='N');
    const body=rows.map((x,i)=>{const party=x.party||'';return `<tr><td>${i+1}</td><td>${x.checklist_no||''}</td><td>${x.file_received_date||''}</td><td>${x.audit_date||''}</td><td>${esc(x.scheme_fund||'')}<br>${esc(x.nature_work||'')}<br>${esc(party)}</td><td class="right">${money(x.amount)}</td><td class="right">${money(x.proposed_payment)}</td><td class="right">${money(x.payment_passed)}</td><td>${x.payment_approved||''}</td><td>${esc(x.query_text||x.remarks||'')}</td></tr>`}).join('');
    return head+`<h2>Annexure D-2</h2><h3>WORK PROGRESS REPORT PRE/INTERNAL AUDIT REPORT FROM ${q.startDate||''} TO ${q.endDate||''}</h3><p>Name of ULB: ${esc(ulb?.name||'')}</p><p>Name of Audit Firm: __________________</p><p>No. of vouchers on opening date: ${q.opening_vouchers||0}</p><p>No. of vouchers received during the period: ${rows.length}</p><p>No. of vouchers audited during the period: ${audited}</p><p>No. of vouchers pending on closing date: ${Math.max(rows.length-audited,0)}</p><table><tr><th>Checklist No.</th><th>Received Date of files by Internal Auditor</th><th>Date of Audit</th><th>Name of Scheme / Fund / Nature of Work / Contractor</th><th>Proposed for Payment (Net Amt.)</th><th>Passed for Payment (Net Amt.)</th><th>Approved (Y/N)</th><th>Remarks or Queries</th></tr>${rows.map(x=>`<tr><td>${esc(x.checklist_no)}</td><td>${esc(x.file_received_date)}</td><td>${esc(x.audit_date)}</td><td>${esc(x.scheme_fund)}<br>${esc(x.nature_work)}<br>${esc(x.party)}</td><td class="right">${money(x.proposed_payment)}</td><td class="right">${money(x.payment_passed)}</td><td>${esc(x.payment_approved)}</td><td>${esc(x.query_text||x.remarks||'')}</td></tr>`).join('')}</table><p><b>Payment not approved/query items:</b> ${no.length}</p>${foot}`;
  }
  if(type==='D3')return head+`<h2>Certificate of completing the work of Pre- Audit / Internal Audit at ULB</h2><p class="small">(To be submitted by Commissioner/Nodal officer/CMO Every Month on letter head of ULB with Dispatch No. & Date)</p><p>Name of ULB: ${esc(ulb?.name||'')}<br>ULB’s Dispatch No.& Date: __________________<br>Month: ${month}, ${q.fy||''}</p><p>This is to certify that all vouchers of the ULB were audited by M/s __________________, Chartered Accountants. ${rows.filter(x=>x.audit_status!=='Audited').length?'Bills and vouchers are pending by CA. Firm.':'No bills and vouchers are pending by CA. Firm.'} Also certify that all the Pre-Audit, Internal Audit & Statutory Compliance have been completed as per agreement.</p><p>Further, the CA. firm certifies that no cases of misappropriation / fraud / embezzlement / irregularities are noticed at ULB during this month based on the documents / books of accounts produced before us. (In case of misappropriation / fraud / embezzlement / irregularities is noticed then a report to the Commissioner/ CMO would be provided.)</p><div class="sig"><div>CC-Joint Director<br>Cluster</div><div>Commissioner / CMO<br>Name of ULB</div></div>${foot}`;
  if(type==='D4'){
    const rev=db.revenue.filter(x=>x.ulb_id===q.ulb&&x.financial_year===q.fy&&String(x.month)===String(q.month));
    const body=rev.length?rev:[]; return head+`<h2>Annexure –D-4</h2><h3>Reporting on List of Irregularities observed with corrective action proposed</h3><p><b>Major Irregularities</b> —</p><p>As per Government Guidelines News Paper to be published in the prescribed manner. The system stores observations separately; enter only source-supported observations.</p><p><b>Minor Irregularities</b> —</p><table><tr><th>Head</th><th>Target</th><th>Achieved Till Last Month</th><th>Current Month</th><th>Cumulative Total</th><th>Collection Percentage</th></tr>${body.map(x=>`<tr><td>${esc(x.head)}</td><td>${money(x.target_lacs)}</td><td>${money(x.till_last_lacs)}</td><td>${money(x.current_lacs)}</td><td>${money((Number(x.till_last_lacs)||0)+(Number(x.current_lacs)||0))}</td><td>${x.target_lacs?(((Number(x.till_last_lacs)||0)+(Number(x.current_lacs)||0))/(Number(x.target_lacs)||1)*100).toFixed(2)+'%':''}</td></tr>`).join('')}</table>${foot}`;
  }
  if(type==='D5'){
    const deductions=db.deductions?.filter(x=>x.ulb_id===q.ulb&&x.financial_year===q.fy&&String(x.month)===String(q.month))||[]; const comps=db.compliances?.filter(x=>x.ulb_id===q.ulb&&x.financial_year===q.fy&&String(x.month)===String(q.month))||[];
    return head+`<h2>Annexure –D-5</h2><h3>Details of Statutory deduction (${esc(q.startDate||'')} to ${esc(q.endDate||'')})</h3><table><tr><th>Particulars</th><th>Payment Due Date</th><th>Deposit Date</th><th>Amount Deducted</th></tr>${deductions.map(x=>`<tr><td>${esc(x.particular)}</td><td>${esc(x.due_date)}</td><td>${esc(x.deposit_date)}</td><td class="right">${money(x.amount)}</td></tr>`).join('')}</table><h3>Details of Statutory Compliances</h3><table><tr><th>Particular</th><th>Due Date of fillings</th><th>Actual Date Filed</th><th>Any Demand arises after fillings</th></tr>${comps.map(x=>`<tr><td>${esc(x.particular)}</td><td>${esc(x.due_date)}</td><td>${esc(x.filed_date)}</td><td>${esc(x.demand||'-')}</td></tr>`).join('')}</table>${foot}`;
  }
  if(type==='D6'){
    const unpaid=rows.filter(x=>x.payment_approved==='Y'&&x.cheque_issued!=='Y'); const paidUnaudited=rows.filter(x=>x.audit_status!=='Audited'&&x.payment_passed>0); const advances=db.advances?.filter(x=>x.ulb_id===q.ulb&&x.financial_year===q.fy&&String(x.month)===String(q.month))||[]; const fds=db.fixed_deposits?.filter(x=>x.ulb_id===q.ulb&&x.financial_year===q.fy)||[];
    return head+`<h2>Annexure –D-6</h2><h3>List of Bills which are Audited but Not Paid / Delayed Payment By ULB</h3><table><tr><th>S.N.</th><th>Date (on which payment approved by auditor)</th><th>Particular</th><th>Voucher No.</th><th>Checklist No.</th><th>Amount</th></tr>${unpaid.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.audit_date)}</td><td>${esc(x.nature_work||x.scheme_fund)}<br>${esc(x.party)}</td><td>${esc(x.voucher_no)}</td><td>${esc(x.checklist_no)}</td><td>${money(x.amount)}</td></tr>`).join('')}</table><h3>List of Bills which were not Audited but Paid By ULB</h3><table><tr><th>S.N.</th><th>Date</th><th>Particular</th><th>Voucher No.</th><th>Amount</th><th>Remark</th></tr>${paidUnaudited.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.payment_date||x.audit_date)}</td><td>${esc(x.nature_work||x.scheme_fund)}<br>${esc(x.party)}</td><td>${esc(x.voucher_no)}</td><td>${money(x.amount)}</td><td>${esc(x.remarks)}</td></tr>`).join('')}</table><h3>List of Advances paid by ULB</h3><table><tr><th>S.N.</th><th>Date</th><th>Particular / Employee Name</th><th>Voucher No.</th><th>Amount</th><th>Remark</th></tr>${advances.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.date)}</td><td>${esc(x.particular)}</td><td>${esc(x.voucher_no)}</td><td>${money(x.amount)}</td><td>${esc(x.remark)}</td></tr>`).join('')}</table><h3>Details of Fixed Deposits as on ${esc(q.endDate||'')}</h3><table><tr><th>Particular</th><th>Amount</th><th>Date</th><th>Maturity Date</th><th>Rate</th></tr>${fds.map(x=>`<tr><td>${esc(x.particular)}</td><td>${money(x.amount)}</td><td>${esc(x.date)}</td><td>${esc(x.maturity_date)}</td><td>${esc(x.rate)}</td></tr>`).join('')}</table>${foot}`;
  }
  if(type==='D7'){const obs=db.observations.filter(x=>x.ulb_id===q.ulb&&x.financial_year===q.fy&&String(x.month)===String(q.month));return head+`<h2>Annexure D 7</h2><h3>Major Observations / Red Flag Issues / Suggestions</h3><table><tr><th>S NO.</th><th>OBSERVATION</th><th>FLAG TYPE</th><th>SUGGESTIONS, IF ANY</th></tr>${obs.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.observation)}</td><td>${esc(x.flag_type)}</td><td>${esc(x.suggestion)}</td></tr>`).join('')}</table>${foot}`;}
  return head+'<h2>Report not found</h2>'+foot;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(n){return Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function sendReport(req,res,type,q,format){const html=reportHtml(type,q);const filename=`${(q.ulbName||'ULB').replace(/[^a-z0-9]+/gi,'_')}_${q.fy||''}_${monthName(q.month)}_${type}`;if(format==='doc'){text(res,200,html,'application/msword; charset=utf-8',{'Content-Disposition':`attachment; filename="${filename}.doc"`});}else if(format==='csv'){const rows=getAuditRows(q);const csv=tableCsv(['Sr. No.','Checklist No.','File Received Date','Audit Date','Scheme/Fund','Nature of Work','Contractor','Amount','Approved','Proposed Payment','Payment Passed','Cheque Issued','Remarks'],rows.map((x,i)=>[i+1,x.checklist_no,x.file_received_date,x.audit_date,x.scheme_fund,x.nature_work,x.party,x.amount,x.payment_approved,x.proposed_payment,x.payment_passed,x.cheque_issued,x.remarks]));text(res,200,csv,'text/csv; charset=utf-8',{'Content-Disposition':`attachment; filename="${filename}.csv"`});}else text(res,200,html,'text/html; charset=utf-8');}

async function handle(req,res){
  const parsed=url.parse(req.url,true); const p=parsed.pathname; const method=req.method; let body={};
  if(['POST','PUT','PATCH'].includes(method)){try{body=await parseBody(req)}catch(e){return json(res,400,{error:e.message})}}
  if(p==='/api/auth/login'&&method==='POST'){const u=db.users.find(x=>x.mobile===String(body.mobile||''));if(!u||!verifyPassword(String(body.password||''),u.password_hash))return json(res,401,{error:'Invalid mobile number or password'});if(!u.active)return json(res,403,{error:'Account deactivated. Contact Administrator.'});res.setHeader('Set-Cookie',`sid=${encodeURIComponent(makeCookie(u.id))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`);return json(res,200,{user:safeUser(u)})}
  if(p==='/api/auth/logout'&&method==='POST'){res.setHeader('Set-Cookie','sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true})}
  if(p==='/api/me'&&method==='GET'){const u=currentUser(req);return json(res,200,{user:u?safeUser(u):null})}
  const u=auth(req,res); if(!u)return;

  // Save a query image securely to <project-root>/upload with server-side validation and optimization.
  if(p==='/api/query-documents'&&method==='POST'){
    const mimeType=String(body.mimeType||'').toLowerCase();
    const originalName=String(body.originalName||'image').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g,'').slice(0,180);
    const allowedMime={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    if(!Object.prototype.hasOwnProperty.call(allowedMime,mimeType))return json(res,400,{error:'Only JPG, JPEG, PNG and WEBP images are allowed.'});
    const dataUrl=String(body.imageData||'');
    const match=dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
    if(!match||match[1].toLowerCase()!==mimeType)return json(res,400,{error:'Invalid image data or MIME type.'});
    const original=Buffer.from(match[2],'base64');
    if(!original.length)return json(res,400,{error:'The selected image is empty or invalid.'});
    if(original.length>7*1024*1024)return json(res,413,{error:'Image must be 7 MB or smaller.'});
    const ext=path.extname(originalName).toLowerCase();
    const extAllowed={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
    if(extAllowed[ext]!==mimeType)return json(res,400,{error:'The file extension does not match the image type.'});
    // Validate actual bytes, not just the browser-provided MIME type.
    const isJpeg=original.length>=3&&original[0]===0xff&&original[1]===0xd8&&original[2]===0xff;
    const isPng=original.length>=8&&original.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const isWebp=original.length>=12&&original.toString('ascii',0,4)==='RIFF'&&original.toString('ascii',8,12)==='WEBP';
    if(!((mimeType==='image/jpeg'&&isJpeg)||(mimeType==='image/png'&&isPng)||(mimeType==='image/webp'&&isWebp)))return json(res,400,{error:'The uploaded file content is not a valid JPG, PNG or WEBP image.'});
    let finalBytes=original, compressionUsed=false, imageFormat=allowedMime[mimeType];
    try{
      const sharp=require('sharp');
      const pipeline=sharp(original,{failOn:'error',limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true});
      if(mimeType==='image/jpeg')pipeline.jpeg({quality:86,mozjpeg:true});
      else if(mimeType==='image/png')pipeline.png({compressionLevel:9,adaptiveFiltering:true,palette:false});
      else pipeline.webp({quality:86,alphaQuality:100,effort:5});
      const optimized=await pipeline.toBuffer();
      if(optimized.length>0&&optimized.length<original.length){finalBytes=optimized;compressionUsed=true;}
    }catch(err){
      console.warn('[Query image] Compression failed; keeping validated original:',err.message);
      finalBytes=original;
    }
    const safeBase=path.basename(originalName,path.extname(originalName)).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,50)||'query_image';
    const storedExt=ext; // retain original extension and matching image format
    const storedName=`${safeBase}-${crypto.randomUUID()}${storedExt}`;
    const resolvedUploadDir=path.resolve(ROOT,'upload');
    fs.mkdirSync(resolvedUploadDir,{recursive:true});
    const destination=path.resolve(resolvedUploadDir,storedName);
    if(!destination.startsWith(resolvedUploadDir+path.sep))return json(res,400,{error:'Invalid upload filename.'});
    try{fs.writeFileSync(destination,finalBytes,{flag:'wx'});}catch(err){console.error('[Query image save]',err);return json(res,500,{error:'Unable to save the image. Please try again.'});}
    const checklistRecordId=String(body.checklistRecordId||'');
    const checklist=db.checklistRecords.find(x=>x.id===checklistRecordId);
    const fields=body.fields&&typeof body.fields==='object'?body.fields:{};
    const doc={id:id(),checklist_record_id:checklist?checklist.id:null,checklist_no:checklist?.checklist_no||String(body.checklistNumber||''),relative_path:path.posix.join('upload',storedName),stored_name:storedName,original_filename:originalName,original_size_bytes:original.length,final_size_bytes:finalBytes.length,space_saved_bytes:Math.max(0,original.length-finalBytes.length),mime_type:mimeType,image_format:imageFormat,compression_used:compressionUsed,uploaded_at:now(),uploaded_by:u.id,fields:{
      query_date:String(fields.query_date||'').slice(0,30),bill_invoice_reference:String(fields.bill_invoice_reference||'').slice(0,300),amount:String(fields.amount||'').slice(0,50),party_name:String(fields.party_name||'').slice(0,300),query_text:String(fields.query_text||'').slice(0,10000),form2_number:String(fields.form2_number||'').slice(0,100)
    }};
    db.queryDocuments.push(doc);
    if(checklist){
      checklist.query_form=checklist.query_form||{};
      checklist.query_form.document_ids=Array.isArray(checklist.query_form.document_ids)?checklist.query_form.document_ids:[];
      checklist.query_form.document_ids.push(doc.id);
      Object.assign(checklist.query_form,doc.fields);
      checklist.updated_by=u.id;checklist.updated_at=now();
    }
    save(db);log(u,'query_document',doc.id,'UPLOAD',null,{...doc,relative_path:doc.relative_path});
    return json(res,201,{ok:true,document:{id:doc.id,original_filename:doc.original_filename,relative_path:doc.relative_path,original_size_bytes:doc.original_size_bytes,final_size_bytes:doc.final_size_bytes,space_saved_bytes:doc.space_saved_bytes,image_format:doc.image_format,compression_used:doc.compression_used,uploaded_at:doc.uploaded_at,view_url:`/api/query-documents/${doc.id}/file`}});
  }
  // Delete a saved query image and its metadata. Only its uploader or an admin may delete it.
  if(p.startsWith('/api/query-documents/')&&method==='DELETE'&&p.endsWith('/delete')){
    const docId=p.split('/')[3];
    const index=(db.queryDocuments||[]).findIndex(x=>x.id===docId);
    if(index<0)return json(res,404,{error:'Saved image not found.'});
    const doc=db.queryDocuments[index];
    if(doc.uploaded_by!==u.id&&u.role!=='admin')return json(res,403,{error:'You do not have permission to delete this image.'});
    const resolvedUploadDir=path.resolve(ROOT,'upload');
    const file=path.resolve(ROOT,String(doc.relative_path||''));
    if(!file.startsWith(resolvedUploadDir+path.sep))return json(res,400,{error:'Invalid stored file path.'});
    try{if(fs.existsSync(file))fs.unlinkSync(file);}catch(err){console.error('[Query image delete]',err);return json(res,500,{error:'Could not delete the image file. Please try again.'});}
    db.queryDocuments.splice(index,1);
    for(const checklist of (db.checklistRecords||[])){
      if(checklist.query_form&&Array.isArray(checklist.query_form.document_ids)){
        checklist.query_form.document_ids=checklist.query_form.document_ids.filter(id=>id!==doc.id);
      }
    }
    save(db);log(u,'query_document',doc.id,'DELETE',{original_filename:doc.original_filename,checklist_no:doc.checklist_no},null);
    return json(res,200,{ok:true,message:'Saved image deleted.'});
  }

  if(p.startsWith('/api/query-documents/')&&method==='GET'&&p.endsWith('/file')){
    const docId=p.split('/')[3],doc=(db.queryDocuments||[]).find(x=>x.id===docId);
    if(!doc)return json(res,404,{error:'Saved image not found.'});
    const resolvedUploadDir=path.resolve(ROOT,'upload'),file=path.resolve(ROOT,doc.relative_path);
    if(!file.startsWith(resolvedUploadDir+path.sep))return json(res,403,{error:'Invalid stored file path.'});
    let bytes;try{bytes=fs.readFileSync(file)}catch{return json(res,404,{error:'Saved image file is missing.'});}
    const contentType={'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp'}[path.extname(file).slice(1).toLowerCase()]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':contentType,'Content-Length':bytes.length,'Content-Disposition':`inline; filename="${path.basename(doc.stored_name)}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
  }
  if(p==='/api/query-documents'&&method==='GET'){
    const checklistRecordId=String(parsed.query.checklistRecordId||'');
    const checklistNumber=String(parsed.query.checklistNumber||'');
    const rows=(db.queryDocuments||[]).filter(d=>{
      if(checklistRecordId && d.checklist_record_id===checklistRecordId)return true;
      // Legacy uploads may lack a checklist record ID; match those by checklist number only.
      if(checklistNumber && !d.checklist_record_id && String(d.checklist_no||'')===checklistNumber)return true;
      return !checklistRecordId && !checklistNumber;
    }).map(d=>({id:d.id,checklist_no:d.checklist_no,original_filename:d.original_filename,relative_path:d.relative_path,original_size_bytes:d.original_size_bytes,final_size_bytes:d.final_size_bytes,space_saved_bytes:d.space_saved_bytes,image_format:d.image_format,uploaded_at:d.uploaded_at,view_url:`/api/query-documents/${d.id}/file`,fields:d.fields}));
    return json(res,200,rows);
  }

  if(p==='/api/vision/query-extract'&&method==='POST'){
    const mimeType=String(body.mimeType||'');
    const allowed=['image/jpeg','image/png','image/webp'];
    if(!allowed.includes(mimeType))return json(res,400,{error:'Google Cloud Vision image OCR supports JPG, PNG or WEBP here. For PDF/HEIC, convert the page to JPG or PNG first.'});
    const dataUrl=String(body.imageData||'');
    const match=dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
    if(!match||match[1]!==mimeType)return json(res,400,{error:'Invalid image data.'});
    const bytes=Buffer.from(match[2],'base64');
    if(!bytes.length||bytes.length>7*1024*1024)return json(res,413,{error:'Image must be 7 MB or smaller.'});
    try {
      if(!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON) {
        return json(res,503,{error:'Google Cloud Vision credentials are not configured. Set GOOGLE_APPLICATION_CREDENTIALS on the server.'});
      }
      const vision = require('@google-cloud/vision');
      const client = new vision.ImageAnnotatorClient();
      const [result] = await client.documentTextDetection({image:{content:bytes}});
      const ocrText=String(result?.fullTextAnnotation?.text || result?.textAnnotations?.[0]?.description || '').trim();
      if(!ocrText)return json(res,200,{fields:{query_date:'',bill_invoice_reference:'',amount:'',party_name:'',query_text:''},text:'',message:'No text detected. Try a clearer, well-lit image.'});
      const lines=ocrText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      const labeled=(patterns)=>{
        for(let i=0;i<lines.length;i++){
          for(const pattern of patterns){
            const m=lines[i].match(pattern);
            if(m){const val=(m[1]||'').trim().replace(/^[:\-\s]+/,''); if(val)return val; if(lines[i+1])return lines[i+1].trim();}
          }
        }
        return '';
      };
      let date=labeled([/(?:query\s*date|date\s*of\s*query|dated|date)\s*[:\-]?\s*(\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4})/i]);
      if(date){const m=date.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if(m)date=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; else {const y=date.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);if(y)date=`${y[1]}-${y[2].padStart(2,'0')}-${y[3].padStart(2,'0')}`;else date='';}}
      const ref=labeled([/(?:bill\s*(?:no|number)|invoice\s*(?:no|number)|bill\/invoice\s*(?:ref(?:erence)?|no|number)|voucher\s*(?:no|number))\s*[:#\-]?\s*([A-Z0-9\/-]+)/i]);
      const amountRaw=labeled([/(?:amount|bill\s*amount|payment\s*amount|value)\s*[:₹Rs.\s-]*([0-9][0-9,]*(?:\.\d{1,2})?)/i]);
      const amount=amountRaw.replace(/,/g,'');
      const party=labeled([/(?:party\s*name|contractor\s*name|name\s*of\s*contractor|vendor\s*name|supplier\s*name)\s*[:\-]?\s*(.+)/i]);
      const query=labeled([/(?:query|observation|audit\s*objection|remarks?|reason)\s*[:\-]?\s*(.+)/i]);
      const fields={query_date:date,bill_invoice_reference:ref,amount:/^\d+(?:\.\d{1,2})?$/.test(amount)?amount:'',party_name:party,query_text:query || ocrText};
      console.log(`[Google Cloud Vision OCR] success; text length=${ocrText.length}`);
      return json(res,200,{fields,text:ocrText,provider:'Google Cloud Vision'});
    } catch(e) {
      const message=e?.message||'Unknown Vision OCR error';
      console.error('[Google Cloud Vision OCR] '+message);
      if(/default credentials|credential|private key|Could not load/i.test(message))return json(res,503,{error:'Google Cloud Vision authentication failed. Check GOOGLE_APPLICATION_CREDENTIALS and the service-account key.'});
      if(/billing|billing account/i.test(message))return json(res,502,{error:'Google Cloud Vision requires a billing account enabled for this project.'});
      return json(res,502,{error:'Google Cloud Vision OCR failed: '+message});
    }
  }
  if(p==='/api/gemini/query-extract'&&method==='POST'){
    const apiKey=process.env.GEMINI_API_KEY;
    if(!apiKey)return json(res,503,{error:'Gemini is not configured. Set GEMINI_API_KEY in the server environment and restart.'});
    const mimeType=String(body.mimeType||'');
    const allowed=['image/jpeg','image/png','image/webp','image/heic','application/pdf'];
    if(!allowed.includes(mimeType))return json(res,400,{error:'Unsupported file type. Upload JPG, PNG, WEBP, HEIC or PDF.'});
    const dataUrl=String(body.imageData||'');
    const match=dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
    if(!match||match[1]!==mimeType)return json(res,400,{error:'Invalid image data.'});
    const bytes=Buffer.from(match[2],'base64');
    if(!bytes.length||bytes.length>7*1024*1024)return json(res,413,{error:'File must be 7 MB or smaller.'});
    const prompt=`You are extracting information from a query sheet for a municipal audit checklist. Read the supplied document carefully. Return ONLY valid JSON with these keys: query_date (string in YYYY-MM-DD format), bill_invoice_reference (string), amount (string), party_name (string), query_text (string). Extract only what is clearly present. Do not infer or invent missing values. Use an empty string for missing, unclear, or unreadable values. Preserve the meaning and wording of query/objection text. If multiple query details appear, combine them into query_text separated by new lines. Do not include a checklist number as a bill reference unless the document clearly labels it as such.`;
    const models=['gemini-3.8-flash','gemini-3.5-flash-lite'];
    let lastError='';
    for(const model of models){
      try {
        const upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(apiKey),{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:bytes.toString('base64')}}]}],generationConfig:{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{query_date:{type:'STRING'},bill_invoice_reference:{type:'STRING'},amount:{type:'STRING'},party_name:{type:'STRING'},query_text:{type:'STRING'}},required:['query_date','bill_invoice_reference','amount','party_name','query_text']}}})
        });
        const response=await upstream.json().catch(()=>({}));
        if(!upstream.ok){
          const message=response?.error?.message||`Gemini API returned HTTP ${upstream.status}`;
          console.error(`[Gemini OCR] model=${model} HTTP ${upstream.status}: ${message}`);
          lastError=message;
          if((upstream.status===429||upstream.status===500||upstream.status===503)&&model!==models[models.length-1]) continue;
          return json(res,502,{error:message});
        }
        const textOut=response?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim()||'';
        let fields;
        try{fields=JSON.parse(textOut)}catch{
          console.error(`[Gemini OCR] model=${model} returned non-JSON output`);
          return json(res,502,{error:'Gemini returned an unreadable response. Please try a clearer image or enter details manually.'});
        }
        const clean={};
        for(const key of ['query_date','bill_invoice_reference','amount','party_name','query_text'])clean[key]=typeof fields[key]==='string'?fields[key].trim():'';
        if(clean.amount && !/^-?\d+(?:[.,]\d{1,2})?$/.test(clean.amount.replace(/,/g,''))) clean.amount='';
        if(clean.query_date && !/^\d{4}-\d{2}-\d{2}$/.test(clean.query_date)) clean.query_date='';
        console.log(`[Gemini OCR] success using ${model}`);
        return json(res,200,{fields:clean,model});
      } catch(e) {
        lastError=e?.message||'Unknown network error';
        console.error(`[Gemini OCR] model=${model} request failed: ${lastError}`);
        if(model!==models[models.length-1]) continue;
      }
    }
    return json(res,502,{error:'Gemini OCR failed on the primary and fallback models. Last error: '+lastError});
  }
  if(p==='/api/dashboard'&&method==='GET'){const rs=getAuditRows(parsed.query);const qn=rs.filter(x=>x.payment_approved==='N'||x.query_status==='Query').length;const unpaid=rs.filter(x=>x.payment_approved==='Y'&&x.cheque_issued!=='Y').length;const fy=String(parsed.query.fy||'');const month=String(parsed.query.month||'');const periodChecks=db.checklistRecords.filter(x=>(!fy||String(x.financial_year)===fy)&&(!month||String(x.month)===month));const periodAudits=db.audits.filter(x=>(!fy||String(x.financial_year)===fy)&&(!month||String(x.month)===month));const district_progress=db.districts.filter(d=>d.active!==false).map(d=>{const ids=new Set(db.ulbs.filter(x=>x.district_id===d.id&&x.active).map(x=>x.id));const checks=periodChecks.filter(x=>ids.has(x.ulb_id));const audits=periodAudits.filter(x=>ids.has(x.ulb_id));return{district:d.name,ulbs:ids.size,checklists:checks.length,approved:audits.filter(x=>x.payment_approved==='Y').length,queries:audits.filter(x=>x.payment_approved==='N'||x.query_status==='Query').length,passed:audits.reduce((sum,x)=>sum+Number(x.payment_passed||0),0)}});const recent_checklists=db.checklistRecords.slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,8).map(x=>({id:x.id,checklist_no:x.checklist_no,type:x.type,status:x.status,party:x.party,work:x.work,ulb_name:db.ulbs.find(u=>u.id===x.ulb_id)?.name||''}));return json(res,200,{assigned_ulbs:db.ulbs.filter(x=>x.active).length,current_month:monthName(new Date().getMonth()+1),pending_audits:rs.filter(x=>x.audit_status!=='Audited').length,completed_audits:rs.filter(x=>x.audit_status==='Audited').length,pending_form2:qn,payment_not_approved:qn,cheques_issued:rs.filter(x=>x.cheque_issued==='Y').length,bills_not_paid:unpaid,edited_after_save:db.auditLogs.filter(x=>x.action==='EDIT').length,checklist_count:periodChecks.length,draft_count:periodChecks.filter(x=>x.status!=='Final').length,passed_total:periodAudits.reduce((sum,x)=>sum+Number(x.payment_passed||0),0),district_progress,recent_checklists})}
  if(p==='/api/districts'&&method==='GET')return json(res,200,db.districts);
  if(p==='/api/ulbs'&&method==='GET'){let a=db.ulbs;if(parsed.query.district)a=a.filter(x=>x.district_id===parsed.query.district);return json(res,200,a)}
  if(p==='/api/users'&&method==='GET'){if(u.role!=='admin')return json(res,403,{error:'Forbidden'});return json(res,200,db.users.map(safeUser))}
  if(p==='/api/users'&&method==='POST'){if(u.role!=='admin')return json(res,403,{error:'Forbidden'});if(!body.mobile||!body.name||!body.password)return json(res,400,{error:'Name, mobile and temporary password are required'});if(db.users.some(x=>x.mobile===String(body.mobile)))return json(res,409,{error:'Mobile already exists'});const nu={id:id(),mobile:String(body.mobile),name:String(body.name),role:body.role||'user',active:true,password_hash:hashPassword(String(body.password)),district_id:body.district_id||null,created_at:now()};db.users.push(nu);save(db);log(u,'users',nu.id,'CREATE',null,safeUser(nu));return json(res,201,safeUser(nu))}
  if(p.startsWith('/api/users/')&&method==='PATCH'){if(u.role!=='admin')return json(res,403,{error:'Forbidden'});const idd=p.split('/').pop();const target=db.users.find(x=>x.id===idd);if(!target)return json(res,404,{error:'User not found'});const old=safeUser(target);if(body.action==='toggle'){if(target.id===u.id)return json(res,400,{error:'You cannot deactivate your own primary admin account.'});target.active=!target.active;}if(body.action==='reset'){if(!body.password)return json(res,400,{error:'New password required'});target.password_hash=hashPassword(String(body.password));}save(db);log(u,'users',target.id,body.action==='toggle'?'STATUS_CHANGE':'PASSWORD_RESET',old,safeUser(target));return json(res,200,safeUser(target))}
  if(p.startsWith('/api/users/')&&method==='DELETE'){if(u.role!=='admin')return json(res,403,{error:'Forbidden'});const idd=p.split('/').pop();if(idd===u.id)return json(res,400,{error:'You cannot delete your own primary admin account.'});const i=db.users.findIndex(x=>x.id===idd);if(i<0)return json(res,404,{error:'User not found'});const old=db.users[i];db.users.splice(i,1);save(db);log(u,'users',idd,'DELETE',safeUser(old),null);return json(res,200,{ok:true})}
  if(p==='/api/ulbs'&&method==='POST'){if(u.role!=='admin')return json(res,403,{error:'Forbidden'});if(!body.name||!body.district_id)return json(res,400,{error:'ULB name and district required'});const x={id:id(),district_id:body.district_id,name:body.name,code:body.code||'',latitude:body.latitude||null,longitude:body.longitude||null,geofence_radius:Number(body.geofence_radius||200),active:true};db.ulbs.push(x);save(db);log(u,'ulbs',x.id,'CREATE',null,x);return json(res,201,x)}
  if(p.startsWith('/api/ulbs/')&&method==='PATCH'){if(u.role!=='admin')return json(res,403,{error:'Forbidden'});const x=db.ulbs.find(x=>x.id===p.split('/').pop());if(!x)return json(res,404,{error:'ULB not found'});const old={...x};Object.assign(x,{name:body.name??x.name,code:body.code??x.code,district_id:body.district_id??x.district_id,latitude:body.latitude??x.latitude,longitude:body.longitude??x.longitude,geofence_radius:Number(body.geofence_radius??x.geofence_radius),active:body.active??x.active});save(db);log(u,'ulbs',x.id,'EDIT',old,x);return json(res,200,x)}
  if(p==='/api/audits'&&method==='GET')return json(res,200,getAuditRows(parsed.query));
  if(p==='/api/audits'&&method==='POST'){const required=['ulb_id','financial_year','month','voucher_no','file_received_date','audit_date','scheme_fund','nature_work','party','amount'];for(const k of required)if(body[k]===undefined||body[k]==='')return json(res,400,{error:`Missing field: ${k}`});if(getAuditRows({ulb:body.ulb_id,fy:body.financial_year,month:body.month}).some(x=>x.voucher_no===String(body.voucher_no)))return json(res,409,{error:'Duplicate voucher number for this ULB/month'});const x={id:id(),ulb_id:body.ulb_id,financial_year:body.financial_year,month:Number(body.month),checklist_no:body.checklist_no||'',file_received_date:body.file_received_date,audit_date:body.audit_date,voucher_no:String(body.voucher_no),voucher_date:body.voucher_date||'',scheme_fund:body.scheme_fund,nature_work:body.nature_work,party:body.party,amount:Number(body.amount),payment_approved:body.payment_approved||'N',proposed_payment:Number(body.proposed_payment||body.amount||0),payment_passed:Number(body.payment_passed||0),cheque_issued:body.payment_approved==='Y'?(body.cheque_issued||'N'):'N',cheque_no:body.cheque_no||'',cheque_date:body.cheque_date||'',payment_date:body.payment_date||'',payment_mode:body.payment_mode||'',payment_reference:body.payment_reference||'',backoffice_update_date:body.backoffice_update_date||'',audit_status:body.audit_status||'Pending',query_status:body.payment_approved==='N'?'Pending':'',form2_number:body.form2_number||'',query_text:body.query_text||'',remarks:body.remarks||'',created_by:u.id,updated_by:u.id,created_at:now(),updated_at:now()};db.audits.push(x);save(db);log(u,'audit_register',x.id,'CREATE',null,x);return json(res,201,x)}
  if(p.startsWith('/api/audits/')&&method==='PATCH'){const x=db.audits.find(x=>x.id===p.split('/').pop());if(!x)return json(res,404,{error:'Audit row not found'});const old={...x};const next={...x,...body,updated_by:u.id,updated_at:now()};if(next.payment_approved==='N'){next.cheque_issued='N';next.query_status='Pending';}else
 if(next.payment_approved==='Y'){next.query_status='';}if(next.cheque_issued==='Y'&&next.cheque_date&&next.backoffice_update_date&&next.cheque_date===next.backoffice_update_date)next.same_date_warning=true;else next.same_date_warning=false;Object.assign(x,next);save(db);log(u,'audit_register',x.id,'EDIT',old,x);return json(res,200,x)}

 if(p.startsWith('/api/audits/')&&method==='DELETE'){
   const idd=p.split('/').pop();

   const i=db.audits.findIndex(x=>x.id===idd);

   if(i<0){
     return json(res,404,{error:'Audit row not found'});
   }

   const old=db.audits[i];

   db.audits.splice(i,1);

   save(db);

   log(u,'audit_register',idd,'DELETE',old,null);

   return json(res,200,{ok:true});
 }

  if(p==='/api/checklist-records'&&method==='GET'){
    let rows=db.checklistRecords.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    if(parsed.query.district_id){const ids=new Set(db.ulbs.filter(x=>x.district_id===parsed.query.district_id).map(x=>x.id));rows=rows.filter(x=>ids.has(x.ulb_id));}
    if(parsed.query.ulb_id)rows=rows.filter(x=>x.ulb_id===parsed.query.ulb_id);
    if(parsed.query.type)rows=rows.filter(x=>x.type===parsed.query.type);
    if(parsed.query.status)rows=rows.filter(x=>x.status===parsed.query.status);
    if(parsed.query.q){const q=String(parsed.query.q).toLowerCase();rows=rows.filter(x=>[x.checklist_no,x.type,x.party,x.work,x.voucher_no,x.scheme_fund,x.nature_work].some(v=>String(v||'').toLowerCase().includes(q)));}
    return json(res,200,rows);
  }
  if(p==='/api/checklist-records'&&method==='POST'){
    const ulb=db.ulbs.find(x=>x.id===body.ulb_id&&x.active); if(!ulb)return json(res,400,{error:'Valid ULB is required'});
    const types=['Contractor','Consultancy','Manpower','Store Purchase','Employee Advance','Misc. Expenses'];
    if(!types.includes(String(body.type||'')))return json(res,400,{error:'Valid checklist type is required'});
    const x={id:id(),checklist_no:String(body.checklist_no||`${Date.now()}-${String(body.type).slice(0,3).toUpperCase()}`),ulb_id:ulb.id,district_id:ulb.district_id,financial_year:String(body.financial_year||'2026-27'),month:Number(body.month||new Date().getMonth()+1),type:String(body.type),status:'Draft',result:'-',net_eligible:0,register:body.register||{},file_details:body.file_details||{},checks:Array.isArray(body.checks)?body.checks:[],deductions:Array.isArray(body.deductions)?body.deductions:[],books:body.books||{accounts:[],documents:[]},result_details:body.result_details||{},party:String(body.party||''),work:String(body.work||''),voucher_no:String(body.voucher_no||''),scheme_fund:String(body.scheme_fund||''),nature_work:String(body.nature_work||''),amount:Number(body.amount||0),audit_date:body.audit_date||'',file_received_date:body.file_received_date||'',created_by:u.id,updated_by:u.id,created_at:now(),updated_at:now(),finalized_at:null};
    db.checklistRecords.push(x);save(db);log(u,'checklist_record',x.id,'CREATE',null,x);return json(res,201,x);
  }
  if(p.startsWith('/api/checklist-records/')&&method==='GET'&&p.endsWith('/doc')){
    const rid=p.split('/')[3],x=db.checklistRecords.find(z=>z.id===rid); if(!x)return json(res,404,{error:'Checklist not found'});
    const checks=(x.checks||[]).map(q=>`<tr><td>${esc(q.code)}</td><td>${esc(q.text)}</td><td>${esc(q.status||'')}</td><td>${esc(q.remark||'')}</td></tr>`).join('');
    const ded=(x.deductions||[]).map(q=>`<tr><td>${esc(q.code)}</td><td>${esc(q.head)}</td><td>${esc(q.rate||'')}</td><td>${money(q.amount)}</td><td>${esc(q.remark||'')}</td></tr>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(x.checklist_no)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;padding:24px}h1,h2{margin:6px 0}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}th{background:#eee}.right{text-align:right}</style></head><body><h1>${esc(OFFICIAL_TITLE(x.type))}</h1><p><b>Checklist No.:</b> ${esc(x.checklist_no)} &nbsp; <b>ULB:</b> ${esc(db.ulbs.find(z=>z.id===x.ulb_id)?.name||'')} &nbsp; <b>Status:</b> ${esc(x.status)}</p><h2>A. Register details</h2><table>${Object.entries(x.register||{}).map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table><h2>C. Checks</h2><table><tr><th>No.</th><th>Check</th><th>Y/N/NA</th><th>Remark</th></tr>${checks}</table><h2>D. Deductions</h2><table><tr><th>No.</th><th>Head</th><th>Rate %</th><th>Amount</th><th>Remark</th></tr>${ded}<tr><th colspan="3">Net eligible</th><th>${money(x.net_eligible)}</th><th></th></tr></table><h2>F. Result</h2><table>${Object.entries(x.result_details||{}).map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></body></html>`;
    return text(res,200,html,'application/msword; charset=utf-8',{'Content-Disposition':`attachment; filename="${String(x.checklist_no).replace(/[^a-z0-9_-]/gi,'_')}.doc"`});
  }
  if(p.startsWith('/api/checklist-records/')&&method==='GET'){
    const rid=p.split('/').pop(),x=db.checklistRecords.find(z=>z.id===rid); if(!x)return json(res,404,{error:'Checklist not found'}); return json(res,200,x);
  }
  if(p.startsWith('/api/checklist-records/')&&method==='PATCH'){
    const rid=p.split('/').pop(),x=db.checklistRecords.find(z=>z.id===rid); if(!x)return json(res,404,{error:'Checklist not found'});
    if(x.status==='Final'&&body.action!=='reopen')return json(res,400,{error:'Finalized checklist cannot be edited'});
    const old=JSON.parse(JSON.stringify(x));
    const allowed=['register','file_details','checks','deductions','books','result_details','query_form','party','work','voucher_no','scheme_fund','nature_work','amount','audit_date','file_received_date','financial_year','month','result','net_eligible'];
    for(const k of allowed)if(body[k]!==undefined)x[k]=body[k];

    // Keep a single Form-2 record linked to each checklist and update it in place.
    if (body.query_form !== undefined) {
      if (!x.query_form) x.query_form = {};
      const q = x.query_form;
      const hasNo = (x.checks || []).some(c => String(c.status || '').toUpperCase() === 'N') ||
        String(x.result_details?.amount_approved || '').toUpperCase() === 'N';
      // Always assign one stable Query Sheet No. and mirror it into Section F Results.
      const generatedQuerySheetNo = String(q.form2_number || x.result_details?.query_sheet_no || `${x.checklist_no || 'CL'}-Q1`);
      q.form2_number = generatedQuerySheetNo;
      x.result_details = { ...(x.result_details || {}), query_sheet_no: generatedQuerySheetNo };
      const required = ['form2_number','query_date','bill_invoice_reference','amount','party_name','query_text'];
      const complete = required.every(k => String(q[k] ?? '').trim() !== '');
      if (hasNo && complete) {
        if (!Array.isArray(db.form2)) db.form2 = [];
        let linked = db.form2.find(row => row.checklist_record_id === x.id);
        const payload = {
          checklist_record_id: x.id,
          checklist_no: x.checklist_no,
          audit_register_id: null,
          ulb_id: x.ulb_id,
          form2_number: String(q.form2_number),
          query_date: String(q.query_date),
          bill_invoice_reference: String(q.bill_invoice_reference),
          amount: Number(q.amount || 0),
          party_name: String(q.party_name),
          query_text: String(q.query_text),
          image_name: linked?.image_name || '',
          image_data: linked?.image_data || '',
          ai_extracted: false,
          confidence: 0,
          verified: true
        };
        if (linked) {
          const previous = JSON.parse(JSON.stringify(linked));
          Object.assign(linked, payload, { updated_by: u.id, updated_at: now() });
          log(u, 'form2', linked.id, 'SYNC_FROM_CHECKLIST', previous, {...linked, image_data: linked.image_data ? '[stored]' : ''});
        } else {
          linked = { id: id(), ...payload, created_by: u.id, created_at: now() };
          db.form2.push(linked);
          log(u, 'form2', linked.id, 'CREATE_FROM_CHECKLIST', null, {...linked, image_data: ''});
        }
      }
    }

    x.updated_by=u.id;x.updated_at=now();
    if(Array.isArray(x.deductions)){let gross=Number(x.register?.bill_amount||x.amount||0);let total=x.deductions.reduce((s,d)=>s+Number(d.amount||0),0);x.net_eligible=Math.max(gross-total,0);}
    save(db);log(u,'checklist_record',x.id,'EDIT',old,x);return json(res,200,x);
  }
  if(p.startsWith('/api/checklist-records/')&&method==='POST'&&p.endsWith('/finalize')){
    const rid=p.split('/')[3],x=db.checklistRecords.find(z=>z.id===rid); if(!x)return json(res,404,{error:'Checklist not found'});
    const hasNo = (x.checks || []).some(c => String(c.status || '').toUpperCase() === 'N') ||
        String(x.result_details?.amount_approved || '').toUpperCase() === 'N';
    if (hasNo) {
      const q = x.query_form || {};
      const required = ['form2_number','query_date','bill_invoice_reference','amount','party_name','query_text'];
      if (!required.every(k => String(q[k] ?? '').trim() !== '')) {
        return json(res, 400, {error:'Section G. Queries Form must be completed before finalizing this checklist.'});
      }
    }
    const old=JSON.parse(JSON.stringify(x));
    x.status='Final';x.finalized_at=now();x.updated_by=u.id;x.updated_at=now();
    const a=x.register||{};
    if(a.voucher_no && x.ulb_id){
      let existing=db.audits.find(z=>z.ulb_id===x.ulb_id&&String(z.voucher_no)===String(a.voucher_no));
      const payload={ulb_id:x.ulb_id,financial_year:x.financial_year,month:x.month,checklist_no:x.checklist_no,voucher_no:String(a.voucher_no),voucher_date:a.voucher_date||'',file_received_date:a.file_received_date||x.file_received_date||'',audit_date:a.audit_date||x.audit_date||'',scheme_fund:a.scheme_fund||x.scheme_fund||'',nature_work:a.nature_work||x.nature_work||'',party:a.party||x.party||'',amount:Number(a.bill_amount||x.amount||0),payment_approved:x.result_details?.amount_approved==='Y'?'Y':'N',proposed_payment:Number(x.net_eligible||0),payment_passed:Number(x.result_details?.payment_passed||0),cheque_issued:'N',audit_status:'Audited',query_status:x.result==='Query'?'Pending':'',form2_number:x.result_details?.query_sheet_no||'',query_text:x.result_details?.remarks||'',remarks:x.result_details?.remarks||'',updated_by:u.id,updated_at:now()};
      if(existing){Object.assign(existing,payload);}
      else db.audits.push({id:id(),...payload,created_by:u.id,created_at:now()});
    }
    save(db);log(u,'checklist_record',x.id,'FINALIZE',old,x);return json(res,200,x);
  }
  if(p.startsWith('/api/checklist-records/')&&method==='DELETE'){
    const rid=p.split('/').pop(),i=db.checklistRecords.findIndex(z=>z.id===rid); if(i<0)return json(res,404,{error:'Checklist not found'}); const old=db.checklistRecords[i]; if(old.status==='Final')return json(res,400,{error:'Finalized checklist cannot be deleted'}); db.checklistRecords.splice(i,1);save(db);log(u,'checklist_record',rid,'DELETE',old,null);return json(res,200,{ok:true});
  }
  if(p==='/api/checklists'&&method==='GET'){
    const ulb=parsed.query.ulb, fy=parsed.query.fy, month=parsed.query.month;
    if(!ulb||!fy||!month)return json(res,400,{error:'ULB, financial year and month are required'});
    const rows=db.checklists.filter(x=>x.ulb_id===ulb&&x.financial_year===fy&&String(x.month)===String(month));
    return json(res,200,rows);
  }
  if(p==='/api/checklists'&&method==='POST'){
    const ulb=db.ulbs.find(x=>x.id===body.ulb_id&&x.active);
    if(!ulb)return json(res,400,{error:'Valid ULB is required'});
    if(!body.financial_year||!body.month||!Array.isArray(body.items))return json(res,400,{error:'Financial year, month and checklist items are required'});
    const allowed=['YES','NO','N/A',''];
    const clean=[];
    for(const item of body.items){
      const status=String(item.status||'');
      const remark=String(item.remark||'').trim();
      if(!allowed.includes(status))return json(res,400,{error:'Invalid checklist status'});
      if(status==='NO'&&!remark)return json(res,400,{error:`Remark required for: ${item.item||'checklist item'}`});
      if(status==='N/A'&&!remark)return json(res,400,{error:`Reason required for N/A: ${item.item||'checklist item'}`});
      clean.push({
        id:id(),ulb_id:ulb.id,financial_year:String(body.financial_year),month:Number(body.month),
        category:String(item.category||''),item:String(item.item||''),status,remark,
        created_by:u.id,updated_by:u.id,created_at:now(),updated_at:now()
      });
    }
    const old=db.checklists.filter(x=>x.ulb_id===ulb.id&&x.financial_year===String(body.financial_year)&&Number(x.month)===Number(body.month));
    db.checklists=db.checklists.filter(x=>!(x.ulb_id===ulb.id&&x.financial_year===String(body.financial_year)&&Number(x.month)===Number(body.month)));
    db.checklists.push(...clean);save(db);
    log(u,'checklists',`${ulb.id}:${body.financial_year}:${body.month}`,'SAVE',old,clean);
    return json(res,201,clean);
  }
  if(p==='/api/checklists'&&method==='DELETE'){
    const {ulb,fy,month}=parsed.query;
    if(!ulb||!fy||!month)return json(res,400,{error:'ULB, financial year and month are required'});
    const old=db.checklists.filter(x=>x.ulb_id===ulb&&x.financial_year===fy&&String(x.month)===String(month));
    db.checklists=db.checklists.filter(x=>!(x.ulb_id===ulb&&x.financial_year===fy&&String(x.month)===String(month)));
    save(db);log(u,'checklists',`${ulb}:${fy}:${month}`,'DELETE',old,null);
    return json(res,200,{ok:true});
  }
  if(p==='/api/form2'&&method==='GET'){let a=db.form2;if(parsed.query.ulb)a=a.filter(x=>x.ulb_id===parsed.query.ulb);return json(res,200,a)}
  if(p==='/api/form2'&&method==='POST'){const x={id:id(),audit_register_id:body.audit_register_id||null,ulb_id:body.ulb_id||null,form2_number:body.form2_number||'',query_date:body.query_date||'',bill_invoice_reference:body.bill_invoice_reference||'',query_text:body.query_text||'',amount:Number(body.amount||0),party_name:body.party_name||'',image_name:body.image_name||'',image_data:body.image_data||'',ai_extracted:Boolean(body.ai_extracted),confidence:Number(body.confidence||0),verified:Boolean(body.verified),created_by:u.id,created_at:now()};if(x.image_data&&x.image_data.length>7*1024*1024)return json(res,413,{error:'Image too large'});db.form2.push(x);if(x.audit_register_id){const a=db.audits.find(z=>z.id===x.audit_register_id);if(a){a.form2_number=x.form2_number;a.query_text=x.query_text;a.query_status='Pending';}}save(db);log(u,'form2',x.id,'CREATE',null,{...x,image_data:x.image_data?'[stored]':''});return json(res,201,{...x,image_data:undefined})}
  if(p==='/api/attendance'&&method==='GET')return json(res,200,db.attendance.filter(x=>x.user_id===u.id));
  if(p==='/api/attendance'&&method==='POST'){const ulb=db.ulbs.find(x=>x.id===body.ulb_id);if(!ulb)return json(res,400,{error:'ULB required'});let status='OK',distance=null;if(ulb.latitude!=null&&ulb.longitude!=null&&body.latitude!=null&&body.longitude!=null){distance=haversine(Number(body.latitude),Number(body.longitude),Number(ulb.latitude),Number(ulb.longitude));if(distance>Number(ulb.geofence_radius||200))status='OUTSIDE_GEOFENCE';}const x={id:id(),user_id:u.id,ulb_id:ulb.id,type:body.type==='out'?'OUT':'IN',timestamp_server:now(),latitude:body.latitude??null,longitude:body.longitude??null,accuracy:body.accuracy??null,address:body.address||'',device_info:body.device_info||'',status,distance_m:distance};db.attendance.push(x);save(db);log(u,'attendance',x.id,'CREATE',null,x);return json(res,201,x)}
  if(p.startsWith('/api/reports/')){const type=p.split('/')[3]?.toUpperCase();if(!['D1','D2','D3','D4','D5','D6','D7'].includes(type))return json(res,404,{error:'Report not found'});const q={...parsed.query,month:Number(parsed.query.month||new Date().getMonth()+1),ulbName:db.ulbs.find(x=>x.id===parsed.query.ulb)?.name};if(!q.startDate)q.startDate=`${q.fy?.split('-')[0]||new Date().getFullYear()}-${String(q.month).padStart(2,'0')}-01`;if(!q.endDate)q.endDate=q.startDate;return sendReport(req,res,type,q,parsed.query.format)}
  if(p==='/api/export/audits'&&method==='GET'){const rows=getAuditRows(parsed.query);const csv=tableCsv(['Sr. No.','Checklist No.','File Received Date','Audit Date','Voucher No.','Voucher Date','Scheme/Fund','Nature of Work','Contractor/Vendor','Amount','Approved','Proposed Payment','Payment Passed','Cheque Issued','Cheque No.','Cheque Date','Payment Date','Query Status','Form-2 No.','Query','Audit Status','Remarks'],rows.map((x,i)=>[i+1,x.checklist_no,x.file_received_date,x.audit_date,x.voucher_no,x.voucher_date,x.scheme_fund,x.nature_work,x.party,x.amount,x.payment_approved,x.proposed_payment,x.payment_passed,x.cheque_issued,x.cheque_no,x.cheque_date,x.payment_date,x.query_status,x.form2_number,x.query_text,x.audit_status,x.remarks]));return text(res,200,csv,'text/csv; charset=utf-8',{'Content-Disposition':'attachment; filename="audit-register.csv"'})}
  if(p==='/api/observations'&&method==='GET')return json(res,200,db.observations);
  if(p==='/api/observations'&&method==='POST'){const x={id:id(),ulb_id:body.ulb_id,financial_year:body.financial_year,month:Number(body.month),observation:body.observation||'',flag_type:body.flag_type||'Yellow Flag',suggestion:body.suggestion||'',created_by:u.id,created_at:now()};db.observations.push(x);save(db);log(u,'observations',x.id,'CREATE',null,x);return json(res,201,x)}
  if(p==='/api/revenue'&&method==='GET')return json(res,200,db.revenue);
  if(p==='/api/revenue'&&method==='POST'){if(u.role!=='admin')return json(res,403,{error:'Admin only'});const x={id:id(),ulb_id:body.ulb_id,financial_year:body.financial_year,month:Number(body.month),head:body.head,target_lacs:Number(body.target_lacs||0),till_last_lacs:Number(body.till_last_lacs||0),current_lacs:Number(body.current_lacs||0),created_by:u.id,created_at:now()};db.revenue.push(x);save(db);log(u,'revenue',x.id,'CREATE',null,x);return json(res,201,x)}
  if(p==='/api/audit-logs'&&method==='GET'){if(u.role!=='admin')return json(res,403,{error:'Forbidden'});return json(res,200,db.auditLogs.slice(-500).reverse())}
  return json(res,404,{error:'Not found'});
}
function safeUser(u){return {id:u.id,mobile:u.mobile,name:u.name,role:u.role,active:u.active,district_id:u.district_id||null,created_at:u.created_at};}
function haversine(lat1,lon1,lat2,lon2){const R=6371000;const p=Math.PI/180;const a=.5-Math.cos((lat2-lat1)*p)/2+Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2;return 2*R*Math.asin(Math.sqrt(a));}
function staticFile(req,res){let p=url.parse(req.url).pathname;if(p==='/')p='/index.html';const file=path.normalize(path.join(ROOT,'public',p));if(!file.startsWith(path.join(ROOT,'public')))return text(res,403,'Forbidden');fs.readFile(file,(e,d)=>{if(e)return text(res,404,'Not found');const ext=path.extname(file);const ct={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'}[ext]||'application/octet-stream';text(res,200,d,ct)});}
const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/'))handle(req,res).catch(e=>{console.error(e);json(res,500,{error:'Server error'})});else staticFile(req,res)});
server.listen(PORT,()=>console.log(`ULB Audit System running at http://localhost:${PORT}`));
