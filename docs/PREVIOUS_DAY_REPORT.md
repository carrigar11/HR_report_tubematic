# Previous Day Report – How It Works & What Data Is What

## What it is

The **Previous day** report is a payroll-style Excel you download from **Export → Payroll to Excel → "Previous day"**. It gives:

- **Daily data** = **yesterday only** (one date column).
- **Total Salary** = **current month** (1st of month through yesterday), including bonus.

So you get “yesterday’s snapshot” plus “month-to-date salary” in one file.

---

## How it’s built (backend)

1. **Dates**
   - **Today** = server’s local date.
   - **Yesterday** = today − 1 day.
   - **Month** = month of yesterday (e.g. if yesterday is 11 Feb 2025, month = February 2025).

2. **Attendance used**
   - **att_yesterday**: attendance records for **yesterday only** (one row per employee who has a record that day).
   - **att_month**: attendance from **1st of month** up to **yesterday** (used only to compute month-to-date salary).

3. **Employees**
   - All employees (or filtered by department if a dept admin is logged in).

4. **Advance & penalty**
   - **Advance (month)** = total advance for **yesterday’s month** (from `salary_advances`).
   - **Penalty (month)** = total penalty for **yesterday’s month** (from `penalty` table).

5. **Two payroll runs**
   - **Payroll rows (daily)**  
     Built from **att_yesterday** + advance/penalty for the month.  
     - **Date column** = yesterday.  
     - **TOTAL** is then **overwritten** (see next step).
   - **Payroll rows (month)**  
     Built from **att_month** + same advance/penalty.  
     - **Bonus** is added from `Salary` for that month (`_add_bonus_to_payroll_rows`).  
     - These **month totals** are copied onto the daily rows.

6. **Overwriting TOTAL**
   - For each employee in the “daily” report, **TOTAL** is replaced by that employee’s **month-to-date total** from the “month” run (so TOTAL = gross for 1st–yesterday including bonus).

7. **Punch In / Punch Out**
   - For previous day only, **Punch In** and **Punch Out** for yesterday are added from **att_yesterday** (so you see that day’s timings).

8. **Plant report**
   - Department-level summary for **yesterday**: man-hours, present/absent, avg salary, etc.  
   - **Total Salary** column in Plant = sum of the **month-to-date** totals for that department (from the overwritten payroll TOTAL).

9. **Excel written**
   - **Plant Report** sheet (by department).
   - **Payroll** sheet (all employees, one date col = yesterday, TOTAL = month, plus Punch In/Out, Advance, Penalty).
   - One sheet per **department** (same layout as Payroll, filtered by dept).

---

## What each column/data is

| Column / Data | Meaning |
|---------------|--------|
| **Date column(s)** | Only **yesterday’s date** (one column). |
| **TOTAL** | **Month-to-date salary** (1st of month through yesterday): daily earnings for that period + **bonus** for the month. Not “yesterday only”. |
| **Advance** | Total advance for **yesterday’s month** (same month as TOTAL). |
| **Penalty** | Total penalty for **yesterday’s month**. |
| **Punch In** | Punch-in time **yesterday** (from attendance). |
| **Punch Out** | Punch-out time **yesterday** (from attendance). |
| **Sala** | Hourly rate (from employee: base_salary for Hourly, base_salary/208 for Monthly). |
| **Du** | Expected shift duration (hours) from employee’s shift_from/shift_to. |
| **Daily amount (date column)** | **Yesterday only**: hourly rate × total_working_hours for that day (or fixed salary logic for Fixed). |

So:

- **“Previous day”** = the **date** and **daily earnings** are for **yesterday**.
- **TOTAL / Advance / Penalty** = for the **whole month** (month of yesterday).
- **Punch In/Out** = **yesterday’s** timings.

---

## API

- **Endpoint:** `GET /api/export/payroll-excel/?previous_day=1`
- **Backend:** `export_excel.py` → `generate_payroll_excel_previous_day()`
- **Frontend:** Export Center → Payroll to Excel → “Download Previous Day” calls `exportPayrollPreviousDay()`.

---

## One-line summary

**Previous day report:** one Excel with **yesterday’s** date column and punch times, **yesterday’s** daily earnings in that column, and **TOTAL / Advance / Penalty** for the **current month** (1st through yesterday), with bonus included in TOTAL.
