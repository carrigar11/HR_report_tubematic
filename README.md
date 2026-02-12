# HR Employee & Attendance Management System

Tech stack: **Django + Django REST Framework** (backend), **React** (frontend), **PostgreSQL** (database).

## Features

- Admin login; upload Employee & Attendance Excel (flexible column names: *, /, case)
- Smart attendance: no overwrite; only missing punch_out is updated
- Salary history with bonus (hourly: bonus = floor(overtime/2))
- Auto reward engine: 4-day streak, weekly OT > 6h, 3-day absent red flag
- Holiday calendar so absentee logic skips public holidays
- System settings for thresholds; Export Center (CSV); Employee profile & adjustment audit

## Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL (local)

## 1. Create PostgreSQL database

Create the database **before** running migrations. Use either:

- **pgAdmin:** Right-click Databases → Create → Database → Name: `hr_attendance_db`
- **psql:** Add PostgreSQL `bin` to PATH, then:
  ```bash
  psql -U postgres -h localhost -c "CREATE DATABASE hr_attendance_db;"
  ```

## 2. Backend (Django)

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
set DJANGO_SETTINGS_MODULE=hr_system.settings
python manage.py migrate
python manage.py seed_hr_data
python manage.py runserver
```

Backend runs at **http://localhost:8000**. API root: **http://localhost:8000/api/**.

## 3. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000** and proxies `/api` to the backend.

## 4. Login

Use your admin credentials to log in.

## 5. Clear attendance (re-upload from scratch)

To delete all attendance records and re-upload a fresh Excel:

```bash
cd backend
python manage.py clear_attendance
# Confirm with y. Then upload your attendance Excel again.
```

## 6. Reward engine (daily automation)

- **Option A – Cron / Task Scheduler:**  
  Run daily: `python manage.py run_reward_engine`

- **Option B – Celery Beat (optional):**  
  Install Redis, set `REWARD_ENGINE_USE_CELERY=true`, then:
  `celery -A hr_system worker -l info` and `celery -A hr_system beat -l info`

## API summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login/ | Admin login |
| POST | /api/upload/employees/ | Upload employee Excel |
| POST | /api/upload/attendance/ | Upload attendance Excel |
| GET | /api/dashboard/ | Dashboard stats |
| GET | /api/employees/ | List employees (filter: status, dept_name) |
| GET | /api/employees/{emp_code}/profile/ | Employee profile + history |
| GET | /api/attendance/?date= | List attendance (filter: date, emp_code) |
| POST | /api/attendance/adjust/ | Adjust attendance (audit log) |
| GET | /api/salary/monthly/?month=&year= | Monthly salary report |
| GET | /api/leaderboard/ | Reward leaderboard |
| GET | /api/absentee-alert/ | Red flag list |
| GET/POST | /api/holidays/ | Holiday calendar |
| GET/PATCH | /api/settings/ | System settings |
| GET | /api/export/?report=&type=csv | Export CSV |
| POST | /api/reward-engine/run/ | Run reward engine manually |

## Excel column mapping

- **Employee:** Code, Name (required); Mobile No, Email, Gender, Department Name, Designation Name, Status, Employment Type, Salary Type, Salary (optional). Column names are normalized (ignores *, /, case).
- **Attendance:** Emp Id, Date (required); Name, Dept, Designation, Day, Punch In, Punch Out, Total Working Hours, Total Break, Status (optional). Same normalization.

Place your Excel files in the project folder and use **Upload Employees** / **Upload Attendance** in the app.
