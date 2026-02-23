# Changelog

## Daily update format (use from tomorrow)

```
Update: @Divyam Dharod sir

Today's update
Done:
1. [item 1]
2. [item 2]
3. ...

Employee (making & related):
- [New joins / created employees, if any]
- [Employee updates: profile, status, shift, designation, dept, etc.]
- [Uploads: employee master, shift assignment, or other employee-related uploads]
```

---

## 2025-02-21 (Friday)

Update: @Divyam Dharod sir

Today's update
Done:
1. Penalty page: added View button (modal with all penalty dates for that person/month), Change and Remove per row, and emp_code filter on penalty list API
2. Polished penalty View modal (backdrop blur, animations, stat pills, loading spinner, empty state) and main table buttons/cards
3. Updated profile dropdown: added Sign out icon, open animation, role badge pill, Sign out red hover, accent ring on trigger when open
4. Wired JWT auth: added JWT middleware, 401 on invalid/expired token, JWT settings, CSRF exempt for login/refresh, audit log uses JWT admin
5. Fixed JWT refresh flow so expired access token returns 401 and frontend retries with refresh token without double-request race
6. Google Sheets: verified/fixed sync config and tested attendance/salary data push to sheet
7. Database: did normalization / optimization, improved response time (faster API)
8. Google Sheet: update/sync time made fast
9. Added daily update format in CHANGELOG for ClickUp (template for future updates)

---

## 2025-02-12 (Thursday)

### Penalty page – View action and month breakdown

- **Backend:** Added `emp_code` query parameter to Penalty list API so the frontend can fetch all penalty records for one employee and one month.
- **Frontend:** Added a **View** button in the Penalty page Actions column (next to Remove). Clicking View opens a modal that shows:
  - All dates for that month for that person
  - For each date: date, minutes late, amount charged, type (Late/Manual), description
  - **Change** and **Remove** per row: Change opens inline edit for amount and description with Save/Cancel; Remove deletes the record and refreshes the list.
- Modal data is loaded by calling the penalty list API with `emp_code`, `month`, and `year`.

### Penalty page – UI polish

- View modal: backdrop blur, slide-in animation, clearer title (Penalty breakdown) and subtitle (name · emp code · month year).
- Summary shown as two stat pills: “X day(s) with penalty” and “Total Rs Y” (total pill styled with accent color).
- Loading state: centered spinner and “Loading breakdown…” text.
- Table in modal: bordered container, uppercase column headers, row hover, rounded inputs and buttons.
- Empty state: centered message with icon when there are no penalty records for the month.
- Main table: card border-radius, View and Remove buttons with hover states; View uses secondary style with accent on hover.

### Profile dropdown – improvements

- **Sign out** now has a logout icon (same style as Settings) for consistency.
- Dropdown panel: open animation (fade + slide), stronger shadow, 12px rounded corners, min-width 260px.
- Header: clear title and subtitle (user name, email, role) “Penalty breakdown”–style role shown as a small pill badge (“Super Admin” / “Dept: …”).
- Close button: 36px rounded button with hover state.
- Menu items: clearer hover and active states; Sign out block has a top border and red hover to signal a destructive action.
- Trigger button: when dropdown is open, it shows an accent ring so the active state is clear.

### JWT authentication – full wiring

- **Backend**
  - **JWT middleware:** Added `core.middleware.JWTAdminMiddleware` in Django settings so every request can resolve the admin from `Authorization: Bearer <access_token>` and set `request.jwt_admin_id`. `get_request_admin()` uses this first, then falls back to `X-Admin-Id`.
  - **401 on invalid/expired token:** If the request sends a Bearer token that is missing, invalid, or expired, the middleware returns **401** (JSON) so the frontend can run the refresh flow (and redirect to login if refresh fails).
  - **JWT settings:** `JWT_SECRET_KEY` (defaults to `SECRET_KEY`), `JWT_ACCESS_TTL` (15 min), `JWT_REFRESH_TTL` (7 days), configurable via env.
  - **CSRF:** Login and refresh views are CSRF-exempt so the SPA can POST without a CSRF token.
  - **Audit logging:** `log_activity()` now uses `request.jwt_admin_id` when set (JWT), then falls back to `X-Admin-Id`.
- **Frontend:** No code changes; login already stores `admin`, `access`, and `refresh`; `api.js` already sends Bearer and handles 401 with refresh and redirect. Backend wiring ensures JWT is used consistently and expired tokens yield 401 for correct refresh behavior.

---

*Previous work is not listed here; this file was added on 2025-02-12.*
