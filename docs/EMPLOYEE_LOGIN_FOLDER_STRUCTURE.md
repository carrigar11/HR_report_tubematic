# Employee Login – Folder Structure & Plan

This document describes the **current** layout and the **proposed** folder structure and features for the employee login system. **Say "yes" to approve** and then implementation will start.

---

## 1. Current Setup (Brief)

### Root
```
report final ver/
├── backend/          # Django (hr_system + core app)
├── frontend/         # React + Vite, port 5174
├── docs/
├── database.sql, README.md, CHANGELOG.md, ...
```

### Backend (PostgreSQL via Django)
- **Single app:** `backend/core/` – all models and API.
- **Key models:** `Admin`, `Employee`, `Attendance`, `Salary`, `SalaryAdvance`, `Adjustment`, `ShiftOvertimeBonus`, `Penalty`, `PerformanceReward`, `Holiday`, `SystemSetting`, `AuditLog`, etc. All employee-linked data uses **emp_code** (no FK; string match).
- **Auth:** Admin only. JWT (access + refresh); login at `POST /api/auth/login/`, tokens in localStorage (`hr_admin`, `hr_access_token`, `hr_refresh_token`).
- **Holiday:** Model `Holiday` (date, name, year) = company calendar. **No leave/holiday request** table yet.

### Frontend
- **Routes:** `App.jsx` – `/login` (public), then all under `/` with `Layout` + `PrivateRoute` (checks `hr_admin`).
- **Pages:** All under `frontend/src/pages/` (Login, Dashboard, AttendanceTable, HolidayCalendar, etc.).
- **API:** Single `api.js` – axios with Bearer token, 401 → refresh or redirect to `/login`.

---

## 2. Proposed Folder Structure (After Employee Login)

### 2.1 Backend (no new top-level folders; everything stays under `core/`)

```
backend/
├── hr_system/           # unchanged
│   ├── settings.py
│   └── urls.py          # mounts api/ → core.urls
├── core/
│   ├── models.py        # ADD: LeaveRequest; ADD: Employee.password (nullable, hashed)
│   ├── views.py         # ADD: sections "Employee Auth", "Employee API", "Leave Requests (Admin)"
│   ├── serializers.py   # ADD: EmployeeLoginSerializer, LeaveRequestSerializer, EmployeeDashboardSerializer, etc.
│   ├── urls.py          # ADD: employee auth + employee API + leave-request admin routes
│   ├── jwt_auth.py      # EXTEND: encode/decode JWT with type=admin|employee, admin_id vs emp_code
│   ├── middleware.py    # EXTEND: set request.jwt_employee_emp_code when JWT type=employee
│   ├── migrations/     # NEW: 0008_employee_password, 0009_leaverequest
│   └── (rest unchanged: excel_upload, export_excel, salary_logic, ...)
```

**New API routes (conceptual):**
- `POST /api/employee/auth/login/`   – body: `{ emp_code, password }` → access, refresh, employee summary
- `POST /api/employee/auth/refresh/` – same as admin refresh (reuse or separate by token type)
- `GET  /api/employee/dashboard/`    – stats for logged-in employee (days this month, total hours, bonus hours, bonus Rs)
- `GET  /api/employee/attendance/`    – list attendance for this employee (filter by month/year)
- `GET  /api/employee/profile/`      – full employee details (read-only)
- `GET  /api/employee/leave-requests/`        – list my leave requests
- `POST /api/employee/leave-requests/`       – create leave request (from_date, to_date, reason?)
- `GET  /api/employee/salary-summary/`       – optional: monthly summary (read-only)
- Admin: `GET /api/leave-requests/`          – list all (filter by department, status); `PATCH /api/leave-requests/<id>/` – set status (approved/declined), reviewed_by

**New DB model:**
- **LeaveRequest:** emp_code, from_date, to_date, reason (optional), status (pending/approved/declined), requested_at, reviewed_by_admin_id (FK Admin, nullable), reviewed_at, notes. Optional: dept_name (denormalized from Employee for admin filter).

---

### 2.2 Frontend

```
frontend/src/
├── App.jsx                    # ADD: Employee routes under /employee/*, EmployeePrivateRoute
├── api.js                     # ADD: employeeAuth, employee.*, leaveRequests; EXTEND: interceptor for hr_employee + same token keys
├── Layout.jsx                 # unchanged (admin layout)
├── LayoutEmployee.jsx         # NEW: employee sidebar + outlet (Dashboard, Attendance, Holiday request, My details, Salary summary, Sign out)
├── pages/
│   ├── Login.jsx              # MODIFY: toggle "Login as Employee" | "Login as Admin" above box; animation; same card
│   ├── Login.css              # MODIFY: styles for toggle + animation
│   ├── (all existing admin pages unchanged)
│   └── employee/              # NEW folder – all employee-facing pages
│       ├── Dashboard.jsx      # Stats: days worked this month, total hours (month + all-time), bonus hours + Rs
│       ├── Attendance.jsx     # Table of my attendance (like HR attendance, read-only, filters)
│       ├── HolidayRequest.jsx  # Form: request leave from–to, reason; list my requests (pending/approved/declined)
│       ├── MyDetails.jsx       # Read-only employee profile (same fields as EmployeeProfile, no edit)
│       ├── SalarySummary.jsx   # Optional: read-only monthly salary summary (days, hours, bonus, advance, etc.)
│       └── (optional later: Documents.jsx, Notifications.jsx)
├── components/
│   └── Icons.jsx              # ADD any new icons for employee nav
└── (Table.css, index.css, etc. unchanged)
```

**Routing (App.jsx):**
- `/login` – Login page (with Employee | Admin toggle).
- **Admin:** `/` → Layout + PrivateRoute (check `hr_admin`) → Dashboard, attendance, employees, holidays, settings, etc.
- **Employee:** `/employee` → redirect to `/employee/dashboard`; `/employee/*` → EmployeePrivateRoute (check `hr_employee`) + LayoutEmployee → Dashboard, Attendance, Holiday request, My details, Salary summary.

**Auth storage (localStorage):**
- **Admin:** `hr_admin`, `hr_access_token`, `hr_refresh_token` (existing). On admin login, clear any `hr_employee`.
- **Employee:** `hr_employee` (JSON: emp_code, name, dept_name, etc.), same `hr_access_token`, `hr_refresh_token`. On employee login, clear any `hr_admin`. JWT payload will have `type: 'employee'` and `emp_code` so backend knows identity.

---

## 3. Feature Summary – Where Is What

| Feature | Where (Backend) | Where (Frontend) |
|--------|------------------|------------------|
| Employee login | `core/views.py` → EmployeeLoginView; `jwt_auth.py` → employee JWT | `Login.jsx` (toggle + form), `api.js` → employeeAuth.login |
| Employee dashboard (days, hours, bonus hrs + Rs) | `core/views.py` → EmployeeDashboardView; aggregate from Attendance, Salary | `pages/employee/Dashboard.jsx` |
| Employee attendance (list my records) | `core/views.py` → EmployeeAttendanceView (filter by emp_code from JWT) | `pages/employee/Attendance.jsx` |
| Employee profile (read-only) | `core/views.py` → EmployeeProfileView (single employee by JWT) | `pages/employee/MyDetails.jsx` |
| Leave request (create + list mine) | `core/views.py` + LeaveRequest model; EmployeeLeaveRequestListCreate | `pages/employee/HolidayRequest.jsx` |
| Admin: accept/decline leave + past records | `core/views.py` → LeaveRequestViewSet or LeaveRequestAdminView; Holidays page | `pages/HolidayCalendar.jsx` (add tab/section "Leave requests") or new page |
| Employee salary summary (read-only) | `core/views.py` → EmployeeSalarySummaryView (from Salary, SalaryAdvance) | `pages/employee/SalarySummary.jsx` |
| Login toggle + animation | — | `Login.jsx` + `Login.css` |
| Employee nav & layout | — | `LayoutEmployee.jsx`, `App.jsx` (routes) |

---

## 4. Admin Holidays Page – Leave Requests

- **Current:** Holiday calendar (add/delete company holidays).
- **Add:** A second section or tab **"Leave requests"**:
  - Table: Employee, From, To, Reason, Status (Pending/Approved/Declined), Requested at, Reviewed by, Reviewed at.
  - Filters: Department (for dept admin: only their dept), Status (pending/all/approved/declined), Year/Month.
  - Actions: For status=pending → "Approve" / "Decline" (PATCH with status + optional notes). Department head / HR see only their scope (super admin: all; dept admin: same as existing department filter).

---

## 5. What Stays Unchanged

- All existing admin routes, Layout, sidebar, Dashboard, Attendance (HR), Employees, Salary, Holidays (calendar), Settings, Export, Manage Admins, Activity Log.
- Existing JWT flow for admin (refresh, middleware, get_request_admin).
- Database tables except: **Employee** (add optional `password`), **new table** `leave_requests`.

---

## 6. Summary

- **One login page** with a toggle at the top: **Login as Employee** | **Login as Admin**. Same card; small animation. JWT used for both; token payload different (employee vs admin).
- **Employee area:** `/employee/*` with its own layout and nav: Dashboard, Attendance, Holiday request, My details, Salary summary (and optional extras).
- **Backend:** New model LeaveRequest; Employee.password; new views and URLs for employee auth and employee-scoped data; extended JWT and middleware for employee.
- **Admin:** Holidays page extended with Leave requests (list, accept/decline, past records, filtered by department).

If you approve this structure, reply **yes** and implementation will start accordingly.
