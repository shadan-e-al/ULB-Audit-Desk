# Template Mapping (source-derived)

This mapping is intentionally conservative: fields are only mapped where the uploaded source templates support them. It is not a replacement for a final pixel-level DOCX/PDF template engine.

| Report | Source | Source structure used by application | Main data/calculation |
|---|---|---|---|
| D-1 | Format_2026-05-01_to_2026-05-31 - D-1(1).docx | Letter to Joint Director; audit certification paragraph; signature block; Encl D2-D7 | ULB, month/FY, audit completion status |
| D-2 | Same DOCX, Annexure D-2 | Work Progress Report; opening/received/audited/pending counts; transaction table with checklist/date/scheme/nature/amount/approved/remarks | Input Register; audited count; payment-approved NO becomes query/remark data |
| D-3 | Same DOCX, certificate section | Certificate of completing Pre-Audit/Internal Audit at ULB; ULB dispatch; month; Commissioner/CMO and audit-firm signature areas | ULB, period, voucher/audit completion |
| D-4 | Same DOCX, Annexure D-4 | Irregularities + Revenue table: Head, Target, achieved till last month, current month, cumulative, percentage | Revenue master/history and observations |
| D-5 | Same DOCX, Annexure D-5 | Statutory deductions table; statutory compliance table; other liabilities in source template | Deductions/compliance data tables |
| D-6 | Same DOCX, Annexure D-6 | Bills audited but not paid; bills not audited but paid; advances; fixed deposits | Rule-based Input Register status + monthly master tables |
| D-7 | Same DOCX, Annexure D-7 | Major Observations / Red Flag Issues / Suggestions | Observation master |
| Internal Audit Register | Internal_Audit_Register_2(1).docx | Sr No, Checklist No, File Received Date, Audit Date, Scheme/Fund, Nature of Work, Contractor, Amount, Approved, Query Sheet No, Proposed Payment, Payment Passed, Payment Details | Primary audit transaction source |
| FORM-2 | FORM-2 querry list(1).pdf | Query Sheet Serial No, Date, Bill/Invoice Reference, Query | Form-2 query linked to audit row |
