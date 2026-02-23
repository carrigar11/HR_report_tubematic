# Late-coming penalty – sequence diagram

## How to view on PlantText.com

1. Open **https://www.planttext.com/**
2. Copy the **entire contents** of `penalty_late_coming_sequence.puml`
3. Paste into the PlantText editor
4. The sequence diagram will render automatically (or click Update/Refresh if needed)

## What the diagram covers

- **Triggers**: Attendance adjustment API, Upload attendance Excel, Upload force-punch Excel
- **Eligibility**: Only **Hourly** and **Monthly** employees (Fixed skipped)
- **Data**: Employee (salary_type), Attendance (punch_in, shift_from), Penalty (existing, monthly total)
- **Logic**: No punch / on time → delete auto penalty; Late → compute deduction (2.5 Rs/min up to 300 Rs/month, then 5 Rs/min), create or update Penalty in a transaction

Nothing is omitted: every branch (skip, delete, update, create) and every call into the penalty logic is shown.
