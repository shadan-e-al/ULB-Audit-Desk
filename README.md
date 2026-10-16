# ULB Audit Management System

A runnable Node.js + HTML/CSS/JS application implementing the core workflow described in the supplied master development prompt and government reference documents.

## Included
- Login with PBKDF2 password hashing and signed session cookie.
- Admin-only user management: add, deactivate/activate, reset password, delete (cannot delete/deactivate self).
- District and ULB master with editable names, codes, coordinates and geofence radius.
- Monthly audit workspace with FY + month selection.
- Input/Audit Register with payment approval and cheque logic.
- Automatic Form-2 queue for payment-approved = NO.
- Form-2 manual entry and image storage.
- D-1 to D-7 report pages populated from saved data.
- CSV export and browser Print/Save-as-PDF / Word-compatible HTML export.
- Attendance check-in/out with browser GPS and optional ULB geofence.
- Audit trail for important edits.
- English/Hindi UI toggle.
- Local persistent JSON database; no npm packages are required.

## Important scope note
The supplied master prompt requires exact reproduction of government D-1 to D-7 templates, cloud storage, PostgreSQL, production HTTPS, signed URLs, malware scanning, AI/OCR and several advanced modules. This package is a **fully runnable local application foundation**, but it does not pretend that browser-only HTML can provide production security/cloud infrastructure or guarantee pixel-identical government-template reproduction.

The uploaded Internal Audit Register is used as the field authority for the core register: Sr. No., Checklist No., File Received Date, Audit Date, Name of Scheme/Fund, Nature of Work, Name of Contractor, Amount, Approved (Y/N), Query Sheet No., Proposed for Payment, Payment Passed, and payment details. See the supplied register template.

The supplied FORM-2 is used for Query Sheet Serial No., Date, Bill/Invoice Reference and Query entries.

The supplied D-1 reference contains D-1 letter, D-2 work progress, D-3 certificate, D-4 revenue/irregularities, D-5 statutory deductions/compliance, D-6 unpaid/unaudited/advances/fixed-deposit sections and D-7 observations. The UI/report engine follows those source headings as closely as possible without silently inventing missing template data.

## Run
1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `node server.js`.
4. Open `http://localhost:8080`.
5. Default admin: mobile `9999999999`, password `Admin@123`.
6. Change the default password by creating a new admin password/resetting it before real use.

## Data
Runtime data is stored under `data/db.json`. Uploaded Form-2 images are stored under `uploads/`.
Back up both folders together.

## Seed ULBs
The source prompt specifies counts (Rajnandgaon 9, Balod 9, Kawardha 8, Bemetara 11, Durg 11) but does not provide the official names. Therefore the seed uses explicit placeholders such as `Rajnandgaon - ULB 01`. Replace them in Admin > ULB Master with the official names. The exact ULB master name is then reused in reports.

## Report output
Use the report screen's:
- **Print / Save PDF** for a PDF through the browser print dialog.
- **Download Word-compatible HTML** for opening in Word.
- **Download CSV** where a tabular export is applicable.

For production, replace the report adapter with DOCX templates and server-side PDF conversion using the exact government files.
