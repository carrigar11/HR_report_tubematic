# How to Disable Employee Login / Revert to “No Employee” Mode

You can turn off employee features in two ways: **switch off** (recommended) or **fully remove** code.

---

## Option 1: Switch Off (No Code Delete)

Set the feature flag so the employee login and APIs are disabled. No code changes needed.

### Backend

Set environment variable:

```bash
EMPLOYEE_LOGIN_ENABLED=false
```

Or in `backend/hr_system/settings.py` change:

```python
EMPLOYEE_LOGIN_ENABLED = os.environ.get('EMPLOYEE_LOGIN_ENABLED', 'false').lower() == 'true'  # default False
```

**Effect:**

- `GET /api/config/` returns `employee_login_enabled: false`.
- `POST /api/employee/auth/login/` returns 403 "Employee login is disabled".
- All other `/api/employee/*` endpoints return 403 when called with an employee token (and employee tokens cannot be issued).

### Frontend

The login page calls `GET /api/config/`. When `employee_login_enabled` is `false`:

- The "Login as Employee | Admin" toggle is **hidden**.
- Only the admin login form is shown.

So with **Option 1** you only set `EMPLOYEE_LOGIN_ENABLED=false` (env or settings). No file deletions.

---

## Option 2: Fully Remove Employee Code

If you want to remove employee-related code from the repo:

### Backend (optional cleanup)

- Remove or comment out in `core/urls.py`: all `path('employee/...')` and `path('leave-requests/...')`, `path('penalty-inquiries/...')`.
- Remove or comment out in `core/views.py`: `ConfigView`, `EmployeeLoginView`, `get_request_employee`, `_require_employee`, `EmployeeDashboardView`, `EmployeeAttendanceListView`, `EmployeeSelfProfileView`, `EmployeeSalarySummaryView`, `EmployeeLeaveRequestListCreateView`, `EmployeePenaltyListView`, `EmployeePenaltyInquiryCreateView`, `LeaveRequestAdminListView`, `LeaveRequestAdminDetailView`, `PenaltyInquiryAdminListView`, `PenaltyInquiryAdminDetailView`.
- In `core/middleware.py`: remove handling of `employee_access` / `jwt_employee_emp_code` (keep only admin JWT).
- In `core/jwt_auth.py`: remove `encode_access_employee`, `encode_refresh_employee`.
- In `core/views.py` `AdminRefreshTokenView`: remove the `employee_refresh` branch.
- You can keep the **models** (Company, LeaveRequest, PenaltyInquiry, Employee.password, Employee.company, Admin.company) and migrations so the DB stays consistent; or add new migrations to drop employee-only tables/columns if you want a full revert.

### Frontend

- **Login:** Remove employee toggle and employee login logic; keep only admin form.
- **App.jsx:** Remove all routes under `/employee/*` and `EmployeePrivateRoute` / `LayoutEmployee`.
- **api.js:** Remove `config.get()`, `employeeAuth`, and all `employee.*` and `leaveRequests` / `penaltyInquiries` calls.
- **Delete folder:** `src/employee/` (or `src/pages/employee/`) and file `LayoutEmployee.jsx` (if you created it).

---

## Summary

| Goal | Action |
|------|--------|
| **Disable employee login but keep code** | Set `EMPLOYEE_LOGIN_ENABLED=false` (env or settings). Frontend hides toggle when config says disabled. |
| **Remove employee features from codebase** | Remove URLs, views, middleware/JWT employee bits, frontend routes and employee UI as in Option 2. |

Recommendation: use **Option 1** so you can re-enable employee features later by setting `EMPLOYEE_LOGIN_ENABLED=true` again.

---

## Enabling employee login and company

- **Employee login:** In Django admin (Core → Employees), set a **password** on the employee. Only employees with a non-empty password can log in. (Password is stored plain for now, like admin.)
- **Company:** In Django admin (Core → Companies), create companies (e.g. code `HQ`, name `Head Office`). Then assign **Company** on Employee and, if needed, on Admin. Admins with a company see only that company’s employees; employees see their own data. Super admin and admins without a company see all.
