# Export page & sheets – audit (before any update)

## 1. Export Center page (frontend)

**File:** `frontend/src/pages/ExportCenter.jsx`

**What it does:**
- **Payroll to Excel** – Date range: All dates / Month & year / Single day / From–to. Calls `exportPayrollExcel(params)`, downloads `.xlsx`. No `emp_code` option on this page (emp_code is used from Salary report → employee detail → download range).
- **Previous day** – Calls `exportPayrollPreviousDay()`, downloads previous-day Excel.
- **Raw data to CSV** – Report: Employees or Attendance. Optional emp code, date from/to for attendance. Calls `exportReport({ type: 'csv', report, date_from, date_to, emp_code })`, downloads CSV.

**APIs used:** `exportReport`, `exportPayrollExcel`, `exportPayrollPreviousDay` (all in `frontend/src/api.js`).

**Findings:**
- Export Center does **not** call `exportEmployeeSalaryHistory` (that’s only from the employee salary detail page).
- Payroll Excel does not send `emp_code` from Export Center (only month/year or date/range).
- No issues found in the UI logic; it just passes params and downloads blobs.

---

## 2. Backend export endpoints & sheets

### A. `GET /api/export/` (ExportView) – CSV/JSON

**File:** `backend/core/views.py` → `ExportView`

**Reports:**
- **employees** – Columns: emp_code, name, mobile, email, gender, dept_name, designation, status, employment_type, salary_type, base_salary. No bonus/salary totals.
- **attendance** – Columns: emp_code, name, date, shift, shift_from, shift_to, punch_in, punch_out, punch_spans_next_day, total_working_hours, total_break, status, over_time.

**Findings:** Raw data only. No gross/bonus calculation. **OK** – no change needed for bonus-as-hours.

---

### B. `GET /api/export/payroll-excel/` (ExportPayrollExcelView)

**File:** `backend/core/views.py` → `ExportPayrollExcelView`  
**Logic:** `backend/core/export_excel.py` → `generate_payroll_excel()`, `build_payroll_rows()`, `_add_bonus_to_payroll_rows()`, `write_payroll_sheet()`, `_write_payroll_workbook()`.

**Sheets:**
1. **Plant Report** – Dept-level: Total Man Hrs, date columns (daily salary), Total Worker Present/Absent, Average Salary, Avg Salary/hr, Absenteeism %, Total Salary.
2. **Payroll** – One row per employee: Emp Code, STAFF, Pla, Status, Under Work, Department, Sala (hourly rate), Du, then one column per date (daily earnings = rate × hours), **TOTAL**, **Advance**.
3. **Per-department sheets** – Same as Payroll but filtered by department.

**How TOTAL is built:**
- `build_payroll_rows()`: daily amount = `hourly_rate × total_working_hours` (from attendance). Fixed: row_total = base_salary. So TOTAL = sum of daily earnings (or base for Fixed).
- When **month and year** are provided, `_add_bonus_to_payroll_rows(payroll_rows, month, year)` runs: for each employee loads Salary (bonus hours, base_salary), computes bonus money = bonus_hours × hourly_rate (Hourly: rate = base; Monthly/Fixed: rate = base/208), and **adds that to row['total']**.

**Findings:**
- **Month+year export:** TOTAL includes bonus (hours × hourly rate). **Aligned** with current bonus logic.
- **Single day / date range / all dates:** `_add_bonus_to_payroll_rows` is **not** called (only when `month is not None and year is not None`). So for “Single day” or “From–to” or “All dates”, TOTAL = only sum of daily earnings (no bonus). That’s expected because bonus is stored per month in `salaries`; for a range spanning multiple months you’d need a different rule. **No bug**, but worth knowing.

---

### C. Previous day report – `GET /api/export/payroll-excel/?previous_day=1`

**File:** `backend/core/export_excel.py` → `generate_payroll_excel_previous_day()`

**Behaviour:**
- Date columns = **yesterday only** (one day).
- TOTAL column = “current month (1st through yesterday)” for each employee: built from `build_payroll_rows(employees, att_month)` (att_month = month_start → yesterday). So TOTAL = sum of (hourly_rate × hours) for each day in that period.
- **Bonus is not added** to this month total. There is no call to `_add_bonus_to_payroll_rows(payroll_month, yesterday.month, yesterday.year)` or equivalent.

**Finding:** **Gap** – In the Previous day report, the “Total Salary” column is **missing bonus** (bonus hours × hourly rate for that month). If you want it to match the Salary report’s gross (including bonus), we need to add bonus to the month total in this report.

---

### D. `GET /api/export/employee-salary-history/?emp_code=X` (CSV)

**File:** `backend/core/views.py` → `ExportEmployeeSalaryHistoryView`

**Content:** One row per month per employee: emp_code, name, month, year, salary_type, base_salary, days_present, total_working_hours, overtime_hours, **bonus** (hours), advance_total, penalty_deduction, **gross_salary**, net_pay.  
Gross is computed with `_gross_and_rate()` (bonus = hours, bonus money = bonus × hourly_rate).

**Finding:** **Aligned** with current bonus-as-hours and gross logic. No change needed.

---

## 3. Summary table

| Export | Location | Bonus in export? | Notes |
|--------|----------|------------------|--------|
| Export Center → Payroll Excel (month+year) | export_excel.py | Yes | TOTAL includes bonus (hours × rate). OK. |
| Export Center → Payroll Excel (single/range/all) | export_excel.py | No | TOTAL = daily earnings only. Bonus is per month; no month scope in range. |
| Export Center → Previous day Excel | export_excel.py | No | **Gap:** Total Salary = month-to-date earnings only; bonus not added. |
| Export Center → CSV (employees / attendance) | views.py ExportView | N/A | Raw data; no salary/bonus. OK. |
| Employee salary detail → Download full data (CSV) | views.py ExportEmployeeSalaryHistoryView | Yes | gross_salary uses _gross_and_rate (bonus = hours). OK. |
| Employee salary detail → Download payroll (Excel) | Same as Payroll Excel; can pass emp_code + date_from/date_to | Depends | If user picks a range that doesn’t map to one month, bonus isn’t in TOTAL (same as “range” above). |

---

## 4. Recommended change (only one)

- **Previous day report:** Add bonus to the “Total Salary” (month total) so it matches the Salary report’s idea of gross for the current month. That would mean:
  - After building `payroll_month`, call something like `_add_bonus_to_payroll_rows(payroll_month, yesterday.month, yesterday.year)` so each row’s `total` includes bonus for that month, then use that for `emp_to_month_total` and the Plant Report.

No other updates are required for the Export page or sheets for the current bonus and gross logic. If you want, next step is to implement only the previous-day bonus fix and leave the rest as-is.
