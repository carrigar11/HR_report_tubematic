# Employee Penalty Page + Inquiry, and Deployment

This doc explains: (1) the **employee Penalty page** and **inquiry** feature, (2) why it **does not break** existing logic, and (3) **how to deploy** the app.

---

## 1. What We Will Add (Employee Penalty + Inquiry)

### 1.1 Employee Penalty Page (new)

- **Location:** `frontend/src/employee/pages/Penalty.jsx` (or `pages/employee/Penalty.jsx` depending on your chosen structure).
- **What the employee sees:**
  - **At top:** Total fine (Rs) for the **selected month** (e.g. “Total fine this month: ₹ 450”).
  - **Table:** One row per penalty: **date**, **minutes late**, **deduction amount (Rs)**, **description** (if any), **inquiry status** (none / Pending / Approved / Rejected / Amount adjusted).
  - **Month filter:** Dropdown or selector for month/year (default: current month).
  - **Action per row:** Button **“Create inquiry”** (only if that penalty has no open inquiry already).

- **Behaviour:**
  - Data comes from **existing Penalty table only** (filtered by logged-in employee and month/year). No change to how penalties are stored or calculated.
  - Total = sum of `deduction_amount` for that employee for that month (same as current salary/export logic).

### 1.2 “Create inquiry” Flow

- **Employee:** Clicks “Create inquiry” on a penalty row → modal/form: optional **message** (e.g. “I was not late, please check”) → Submit.
- **Backend:** New model **PenaltyInquiry** (see below). New API: `POST /api/employee/penalty-inquiries/` with `{ penalty_id, message }`. Creates one inquiry per penalty (or allow one “open” per penalty; we can restrict so only one open inquiry per penalty).
- **Admin/HR:** On the **existing Penalty page** we add a section (e.g. tab or block) **“Penalty inquiries”**:
  - List: employee name, penalty date, amount, employee’s message, status (Open / Approved / Rejected / Amount adjusted), created at.
  - Filters: status (Open / All), optional department.
  - **Actions per open inquiry:**
    - **Approve** – Mark inquiry as “Approved” (penalty stays as is; employee was informed).
    - **Reject** – Mark as “Rejected” (optional admin note to employee).
    - **Adjust amount** – Open existing “Edit penalty” flow (same as today): change `deduction_amount` (and optionally description), save; then mark inquiry as “Amount adjusted”. Salary/export already use `Penalty.deduction_amount`, so **no change** to any existing salary or report logic.

- So: **inquiry = notification + audit trail**. Resolving “Amount adjusted” reuses the **current** penalty edit API; we do **not** add a second source of truth for deduction.

### 1.3 New Backend Pieces (additive only)

| Piece | Purpose |
|-------|--------|
| **Model: PenaltyInquiry** | penalty_id (FK to Penalty), emp_code, message (text), status (open/approved/rejected/amount_adjusted), admin_notes (optional), reviewed_by_admin_id (nullable FK), reviewed_at (nullable), created_at. |
| **API: GET /api/employee/penalties/** | List penalties for current employee (JWT); query params: month, year. Returns list + **total_fine_month** (sum of deduction_amount for that month). |
| **API: POST /api/employee/penalty-inquiries/** | Create inquiry (penalty_id, message); validate penalty belongs to current employee and no open inquiry for that penalty. |
| **API: GET /api/employee/penalty-inquiries/** | Optional: list my inquiries (for “inquiry status” on employee penalty page). |
| **API: GET /api/penalty-inquiries/** (admin) | List inquiries with filters (status, department); used by “Penalty inquiries” section. |
| **API: PATCH /api/penalty-inquiries/<id>/** (admin) | Set status (approved/rejected/amount_adjusted), optional admin_notes. If amount_adjusted, frontend can then call **existing** PATCH /api/penalty/<id>/ to change amount (or we do it in one backend call). |

- **No change** to: `Penalty` model, `PenaltyListView`, `PenaltyCreateView`, `PenaltyDetailView`, `penalty_logic.py`, salary views, export, Google Sheet, or any code that reads `Penalty.deduction_amount`. Only **new** model and **new** endpoints.

---

## 2. Will This Break Any Old Logic or Codebase?

**No.** Summary:

- **Penalty model and logic:** Unchanged. All salary, export, and attendance logic keep using `Penalty.deduction_amount` as they do now.
- **Admin Penalty page:** We only **add** a section “Penalty inquiries”; existing list, filters, create manual penalty, view/edit/delete penalty stay as they are. Edit penalty continues to use existing `PenaltyDetailView` (PATCH).
- **Employee side:** New read-only API that **queries** Penalty by emp_code + month/year and returns same fields you already have; new API to create PenaltyInquiry. No writes to Penalty from employee.
- **Inquiry resolution:** “Adjust amount” = admin edits the existing Penalty record (same API as today). No new deduction logic.

So the codebase stays backward compatible and safe to scale; everything is **additive**.

---

## 3. Deployment (How to Deploy)

You have:

- **Backend:** Django (hr_system + core), PostgreSQL, JWT auth.
- **Frontend:** React + Vite (port 5174 in dev), proxy to backend.

Below is a **generic deployment guide** that works for a VPS, single server, or PaaS. Adjust names and paths to your environment.

### 3.1 What You Need on the Server

- **PostgreSQL** (already in use).
- **Python 3.10+** (or whatever your Django uses).
- **Node 18+** (to build the frontend).
- **Process manager:** e.g. **systemd** (Linux) or **supervisor**, or **gunicorn** + **nginx** for backend and **nginx** (or similar) to serve frontend static files.

### 3.2 Backend (Django) Deployment

1. **Code on server**  
   Clone/copy your repo (e.g. `d:\work\report final ver` → server path like `/var/www/hr-app` or `C:\inetpub\hr-app`).

2. **Virtualenv and dependencies**
   ```bash
   cd /var/www/hr-app/backend
   python3 -m venv venv
   source venv/bin/activate   # Linux/Mac; on Windows: venv\Scripts\activate
   pip install -r requirements.txt gunicorn
   ```

3. **Environment variables**  
   Create a `.env` or set in shell (do **not** commit secrets):
   - `SECRET_KEY` (Django)
   - `DEBUG=0`
   - `ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com,localhost`
   - Database: `DATABASE_URL` or set `ENGINE`, `NAME`, `USER`, `PASSWORD`, `HOST`, `PORT` in `settings.py` for PostgreSQL.

4. **Database**
   - Ensure PostgreSQL is running and the database exists.
   - Run migrations:  
     `python manage.py migrate`
   - Optional: `python manage.py collectstatic` if you serve static files from Django (else nginx can serve them).

5. **Run Django with Gunicorn (production)**
   ```bash
   gunicorn hr_system.wsgi:application --bind 0.0.0.0:8000 --workers 2
   ```
   Use systemd/supervisor to keep this running and start on boot.

### 3.3 Frontend (React/Vite) Deployment

1. **Build**
   ```bash
   cd /var/www/hr-app/frontend
   npm ci
   npm run build
   ```
   This produces `frontend/dist/` (static files: HTML, JS, CSS).

2. **Configure API base URL**  
   In production the frontend must call your **backend URL** (e.g. `https://api.yourdomain.com` or `https://yourdomain.com/api`). Options:
   - **Vite:** Set `VITE_API_BASE=/api` and in `api.js` use `baseURL: import.meta.env.VITE_API_BASE || '/api'` so in production you can set `VITE_API_BASE=https://yourdomain.com/api` and rebuild.
   - Or keep `baseURL: '/api'` and put the frontend and backend behind the **same** domain (see nginx below).

### 3.4 Nginx (single server, same domain)

Example: serve frontend at `https://yourdomain.com` and proxy `/api` to Django.

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    # ssl_certificate and ssl_certificate_key

    root /var/www/hr-app/frontend/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- Frontend: `https://yourdomain.com/`  
- API: `https://yourdomain.com/api/` → Django on port 8000.  
- No CORS issues if same origin.

### 3.5 Checklist Before Go-Live

- [ ] `DEBUG=0`, strong `SECRET_KEY`, correct `ALLOWED_HOSTS`.
- [ ] PostgreSQL accessible from Django (correct host, user, password).
- [ ] `python manage.py migrate` run.
- [ ] Frontend built with correct API base (or same-domain proxy).
- [ ] JWT/HTTPS in production (cookies/tokens over HTTPS).
- [ ] Backend process (gunicorn) and nginx (or IIS) start on boot.

---

## 4. Summary

| Topic | Answer |
|--------|--------|
| **Employee Penalty page** | New page: total fine for month at top, table of penalties (date, minutes late, amount, description), month filter, “Create inquiry” per row. |
| **Inquiry** | New model PenaltyInquiry; employee creates; admin sees in “Penalty inquiries” on existing Penalty page; resolve by Approve / Reject / Adjust amount (adjust = existing edit-penalty API). |
| **Break old logic?** | No. Only new model and new endpoints; Penalty and all salary/export/penalty logic unchanged. |
| **Deploy** | Backend: venv, migrate, gunicorn (or similar). Frontend: npm build, serve `dist/` via nginx; proxy `/api` to Django. Use env vars and HTTPS. |

If you confirm this, next step is implementing: (1) employee Penalty page + inquiry APIs and UI, and (2) “Penalty inquiries” section on admin Penalty page, without touching existing penalty or salary logic.
