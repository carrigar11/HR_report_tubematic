# Data storage, location, and flow

## Where data is stored

All main data is in the **PostgreSQL database** (see `database.sql`). Django uses the same schema via models in `backend/core/models.py`. Table names and purpose:

| Table (location) | What is stored |
|------------------|----------------|
| **admins** | Admin users (login, name, email, password). |
| **employees** | Master employee list: emp_code, name, mobile, email, dept_name, designation, status, **salary_type** (Hourly/Monthly/Fixed), **base_salary**, shift_from, shift_to, etc. |
| **attendance** | One row per employee per day: **date**, punch_in, punch_out, **total_working_hours**, **over_time**, status. UNIQUE(emp_code, date). |
| **salaries** | One row per employee per month: **month**, **year**, salary_type, base_salary, **overtime_hours** (sum of daily OT), **total_working_hours** (sum of daily hours), **bonus** (hours), days_present. |
| **salary_advances** | Advances: emp_code, amount, month, year, date_given, note. Summed per emp/month and deducted from salary. |
| **shift_overtime_bonus** | One row per (emp_code, date) when >12h worked: bonus_hours (1h per 2h over 12). Used to add to Salary.bonus for that month. |
| **penalty** | Late/manual penalties: emp_code, deduction_amount, month, year, date. Deducted from salary (Hourly only). |
| **adjustment** | Audit log of manual attendance edits (punch in/out changes). |
| **performance_rewards** | Streak/OT rewards, absentee alerts, leaderboard. |
| **holidays** | Holiday dates. |
| **system_settings** | Config (e.g. weekly OT threshold). |
| **audit_log** | Admin actions log. |

**Location:** Database connection is set in `backend/hr_system/settings.py` (e.g. `DATABASE_URL` or `ENGINE`, `NAME`, `USER`, `PASSWORD`, `HOST`, `PORT`). Data files are on the server where PostgreSQL runs; the app connects to that DB.

---

## How data is written

1. **Attendance (daily)**  
   - From **Excel upload** (`backend/core/excel_upload.py`) or **Adjustments** (manual punch in/out).  
   - Stored: `attendance.total_working_hours`, `attendance.over_time`.  
   - **Hourly employees:** OT = max(0, total_working_hours − 12).  
   - **Others:** OT = total_working_hours − expected shift hours.

2. **Salary (monthly)**  
   - Filled/updated by **salary_logic.ensure_monthly_salaries(month, year)** (runs when you open Salary report or after uploads).  
   - Reads **attendance** for that month, sums per emp: `total_working_hours`, `over_time`, counts days present.  
   - Writes/updates **salaries**: overtime_hours, total_working_hours, days_present.  
   - For **Hourly:** bonus from OT = floor(overtime_hours / 2).  
   - **Shift OT bonus** (shift_bonus.py): if on a day total_working_hours > 12, adds floor((hours − 12) / 2) **hours** to Salary.bonus for that month (only for today/yesterday/day-before).

3. **Bonus (hours)**  
   - Stored in **salaries.bonus** (always in **hours**).  
   - Sources: (1) auto from OT for Hourly [floor(OT/2)], (2) shift OT bonus (>12h/day), (3) manual from Bonus page (give/set).  
   - **Bonus money** is never stored; it is computed when needed as **bonus_hours × hourly_rate** (Hourly: rate = base_salary; Monthly/Fixed: rate = base_salary/208).

---

## If employee X works 18 hours (one day)

Assumption: **Hourly** employee, that day is e.g. **today** (so shift OT bonus applies).

### 1. What gets stored (attendance – one row for that day)

| Column | Value | Meaning |
|--------|--------|--------|
| emp_code | X | Employee X |
| date | that day | e.g. 2026-02-12 |
| total_working_hours | **18** | Actual worked hours (from punch or Excel). |
| over_time | **6** | For Hourly: normal = 12 h, so OT = 18 − 12 = **6 hours**. |

(If punch_in/punch_out are present, they are stored too; total_working_hours and over_time can come from punch calculation or from Excel.)

### 2. Shift OT bonus (same day, because 18 > 12)

- Extra hours = 18 − 12 = **6**.  
- Bonus hours = floor(6 / 2) = **3** (rule: 1 bonus hour per 2 extra hours).  
- **shift_overtime_bonus**: one row (emp_code=X, date=that day, bonus_hours=3).  
- **salaries**: for that month, `bonus` is increased by **3** (hours). So that day alone adds **3 h** to the month’s bonus.

### 3. Monthly salary row (after ensure_monthly_salaries)

For that month, **salaries** for employee X will have (among other days):

- **total_working_hours** = sum of all days’ total_working_hours (e.g. if only that day: 18).  
- **overtime_hours** = sum of all days’ over_time (e.g. if only that day: 6).  
- **bonus** = includes (1) floor(monthly overtime_hours / 2) for Hourly, and (2) shift OT bonus entries (e.g. +3 from the 18h day). So bonus is in **hours**.

### 4. How much X gets paid for that 18h day (conceptually)

- **Hourly rate** = employee X’s **base_salary** (₹/hour).  
- **Earnings from hours** = 18 × rate.  
- **OT** is already included in “18 hours” (we don’t pay 12 + 6 separately; we pay 18 × rate).  
- **Bonus** for that day = 3 **hours** → bonus money = 3 × rate (added in the month’s gross).

So for **one day** we only store in **attendance**: total_working_hours = 18, over_time = 6; and in **shift_overtime_bonus**: 3 bonus hours for that date. The **money** (18 × rate, 3 × rate) is computed when we calculate the month’s **gross** (total_working_hours + bonus, then × rate for Hourly).

---

## Summary

- **Location:** PostgreSQL database; tables listed above; connection in `backend/hr_system/settings.py`.  
- **Daily work:** Stored in **attendance** (total_working_hours, over_time).  
- **Monthly rollup:** In **salaries** (total_working_hours, overtime_hours, bonus in **hours**).  
- **18h day (Hourly):** attendance: 18 h, 6 OT; shift bonus: 3 h; month’s gross uses (total_working_hours + bonus) × hourly rate.
