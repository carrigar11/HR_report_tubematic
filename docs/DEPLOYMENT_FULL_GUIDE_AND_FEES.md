# Full Deployment Guide – How It Works & Fees

This document explains **how deployment works** end-to-end and **typical fees/costs** (hosting, domain, SSL).

---

## 1. How Deployment Works (Full Picture)

### 1.1 What You Have Today

| Part | What it is | Runs on |
|------|------------|--------|
| **Frontend** | React + Vite app (HTML, JS, CSS) | In dev: `npm run dev` (port 5174). In production: **static files** only (no Node needed after build). |
| **Backend** | Django (Python) API | In dev: `python manage.py runserver` (port 8000). In production: **Gunicorn** (or uWSGI) serving Django. |
| **Database** | PostgreSQL | Separate process; Django connects to it with `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. |

So deployment = **get these three running on a server** and put a **web server** (e.g. Nginx) in front so users hit one URL.

### 1.2 Request Flow (After Deployment)

```
User browser
    |
    |  https://yourdomain.com/
    v
[ Nginx (or similar) ]
    |
    |  /          → serve files from frontend/dist/  (React build)
    |  /api/      → proxy to Django (e.g. localhost:8000)
    v
[ Django (Gunicorn) ]
    |
    |  reads/writes
    v
[ PostgreSQL ]
```

- User opens `https://yourdomain.com` → Nginx serves the React app (index.html + JS/CSS).
- React app calls `/api/...` → Nginx forwards to Django → Django talks to PostgreSQL and returns JSON.
- One domain, no CORS issues; JWT and cookies work as in dev.

### 1.3 Deployment Steps (High Level)

1. **Server** – Get a machine (VPS or use a PaaS). Install: Python 3, Node (for build only), PostgreSQL, Nginx (or Caddy).
2. **Code** – Clone/copy your repo to the server (e.g. Git clone or upload).
3. **Database** – Create a PostgreSQL database and user; set `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` in env.
4. **Backend** – Create virtualenv, `pip install -r requirements.txt`, `python manage.py migrate`, run Django with Gunicorn (e.g. port 8000). Keep it running (systemd/supervisor).
5. **Frontend** – `npm ci`, `npm run build`; you get `frontend/dist/`. Nginx (or similar) serves this folder for `/`.
6. **Nginx** – Configure: root = `frontend/dist`, `location /api/` → proxy to `http://127.0.0.1:8000`. Enable HTTPS (e.g. Let’s Encrypt).
7. **Domain** – Point your domain’s DNS (A record or CNAME) to the server’s IP (or PaaS URL).

That’s the full flow; details are below.

---

## 2. Step-by-Step Deployment (Single VPS Example)

Assumption: you have a **Linux VPS** (Ubuntu 22.04) and a **domain** (e.g. `hr.yourcompany.com`).

### 2.1 Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python, Node (for build), PostgreSQL, Nginx
sudo apt install -y python3 python3-pip python3-venv nodejs npm postgresql nginx
```

### 2.2 PostgreSQL

```bash
sudo -u postgres psql
```

In PostgreSQL:

```sql
CREATE DATABASE hr_attendance_db;
CREATE USER hr_user WITH PASSWORD 'your_strong_password';
ALTER ROLE hr_user SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE hr_attendance_db TO hr_user;
\q
```

Use these in Django env: `DB_NAME=hr_attendance_db`, `DB_USER=hr_user`, `DB_PASSWORD=your_strong_password`, `DB_HOST=localhost`, `DB_PORT=5432`.

### 2.3 Clone Code and Backend

```bash
cd /var/www
sudo git clone https://github.com/your-org/report-final-ver.git hr-app
cd hr-app/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt gunicorn
```

Create `/var/www/hr-app/backend/.env` (or export in shell):

```env
DEBUG=False
DJANGO_SECRET_KEY=your-long-random-secret-key
ALLOWED_HOSTS=hr.yourcompany.com,www.hr.yourcompany.com
DB_NAME=hr_attendance_db
DB_USER=hr_user
DB_PASSWORD=your_strong_password
DB_HOST=localhost
DB_PORT=5432
```

Update Django `ALLOWED_HOSTS` from env (your `settings.py` can do `ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')` in production).

Run migrations:

```bash
python manage.py migrate
python manage.py collectstatic --noinput   # if you use Django static files
```

Test Gunicorn:

```bash
gunicorn hr_system.wsgi:application --bind 0.0.0.0:8000 --workers 2
```

Then run it as a service (systemd) so it restarts on reboot.

Example **systemd unit** `/etc/systemd/system/hr-backend.service`:

```ini
[Unit]
Description=HR Django Backend
After=network.target postgresql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/hr-app/backend
Environment="PATH=/var/www/hr-app/backend/venv/bin"
ExecStart=/var/www/hr-app/backend/venv/bin/gunicorn hr_system.wsgi:application --bind 127.0.0.1:8000 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable hr-backend
sudo systemctl start hr-backend
```

### 2.4 Frontend Build

On the same server (or on your PC and upload `dist/`):

```bash
cd /var/www/hr-app/frontend
npm ci
npm run build
```

This creates `frontend/dist/`. Nginx will serve this directory.

If your API in production is on the same domain (e.g. `https://hr.yourcompany.com/api`), your existing `baseURL: '/api'` in `api.js` is fine. If API is on a different domain, set `VITE_API_BASE` and use it in `api.js`, then rebuild.

### 2.5 Nginx

Create a site config, e.g. `/etc/nginx/sites-available/hr-app`:

```nginx
server {
    listen 80;
    server_name hr.yourcompany.com;

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

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/hr-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 2.6 HTTPS (SSL) – Free with Let’s Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d hr.yourcompany.com
```

Certbot will add HTTPS to the Nginx config and auto-renew. No fee for the certificate.

### 2.7 Domain DNS

At your domain registrar, add an **A record**: `hr.yourcompany.com` → your VPS **IP address**. After DNS propagates, users can open `https://hr.yourcompany.com`.

---

## 3. How Each Part “Works” in Production

| Component | How it runs | Who uses it |
|-----------|-------------|------------|
| **PostgreSQL** | Service on the server (or managed DB). Listens on port 5432. | Only Django (backend). |
| **Gunicorn + Django** | Process bound to 127.0.0.1:8000. Handles `/api/*` after Nginx proxies. | Browsers (via Nginx). |
| **Nginx** | Listens on 80/443. Serves `frontend/dist/` for `/` and proxies `/api/` to Django. | Browsers. |
| **Frontend (dist/)** | Just files (HTML, JS, CSS). No server-side React; all runs in the user’s browser. | Users load the app; the app then calls `/api/`. |

So: **deployment = same logic as dev, but:**

- Frontend is **pre-built** and served as static files.
- Backend runs with **Gunicorn** (multi-worker) instead of `runserver`.
- Database is **PostgreSQL** (same as you use now).
- **One public URL**; Nginx decides whether to serve files or forward to Django.

---

## 4. Fees / Costs

### 4.1 What You Pay For (Typical)

| Item | What it is | Typical cost |
|------|------------|--------------|
| **Server (VPS)** | Machine that runs Nginx, Django, and (optionally) PostgreSQL. | **$5–20/month** (e.g. DigitalOcean, Linode, Vultr: 1 GB RAM, 1 vCPU). More if you need more RAM/CPU. |
| **Domain** | e.g. `hr.yourcompany.com`. | **~$10–15/year** (e.g. Namecheap, Google Domains, Cloudflare). |
| **SSL (HTTPS)** | Let’s Encrypt. | **Free.** |
| **Managed PostgreSQL** (optional) | If you don’t want to manage DB on the same VPS. | **$0 (free tier)** to **$15+/month** (e.g. Railway, Render, Neon, Supabase). |

You can run **everything on one VPS** (Django + PostgreSQL + Nginx) to keep cost low: **about $5–10/month + domain once a year**.

### 4.2 Platform “Fees” (Hosting Options)

- **Your own VPS (e.g. DigitalOcean, Linode, Vultr)**  
  - You pay only for the server (+ domain). No per-user or per-request fee.  
  - **Fees:** Monthly VPS price (e.g. **$6/month**); no extra “deployment fee” from the provider.

- **PaaS (e.g. Railway, Render, Fly.io)**  
  - They run your backend (and sometimes DB) for you; you connect your Git repo and they build/deploy.  
  - **Fees:** Often **free tier** (limited hours or resources); paid tiers **~$5–20/month** depending on usage. No “per deploy” fee; you pay for compute/resources.

- **Frontend-only hosting (e.g. Vercel, Netlify)**  
  - You can host only the **frontend** (static build) for free; your backend would be elsewhere (e.g. same VPS or PaaS).  
  - **Fees:** Free tier is common; paid if you need more bandwidth or features.

So: **deployment itself has no extra “fee”** beyond the cost of the server/hosting and domain. You’re not charged “per deploy” or “per login”; you pay for the **machine or platform** that runs your app.

### 4.3 Example Monthly Cost (Rough)

- **Minimal (one VPS, you manage everything):**  
  VPS **$6** + domain **~$1** (amortized) ≈ **$7/month**.

- **With managed DB:**  
  VPS **$6** + managed PostgreSQL **$0–15** + domain ≈ **$7–22/month**.

- **All on PaaS (e.g. backend + DB on Railway, frontend on Vercel):**  
  **$0** on free tiers, or **$5–15/month** if you exceed free limits.

---

## 5. Summary

| Question | Answer |
|----------|--------|
| **How does deployment work?** | You put the **frontend build** (dist/) and **Django (Gunicorn)** on a server, with **PostgreSQL** and **Nginx** in front. Nginx serves the app and proxies `/api/` to Django. Users open one URL; no change to how your app logic or JWT works. |
| **What actually runs?** | Nginx (web + reverse proxy), Gunicorn (Django), PostgreSQL. Frontend = static files only. |
| **Fees?** | No “deployment fee.” You pay for **hosting** (VPS ~$5–20/month or PaaS free/paid) and **domain** (~$10–15/year). SSL is free (Let’s Encrypt). |
| **Can it scale?** | Yes: bigger VPS, or separate DB server, or move to PaaS; your current design (stateless Django + DB) scales by adding more workers or a stronger DB. |

If you tell me your preferred option (e.g. “single VPS” or “Railway + Vercel”), I can narrow this to exact commands and a minimal checklist for your repo.
