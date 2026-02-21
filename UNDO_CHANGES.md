# Undo log – New department auto-add & admin creation (this prompt)

Use this to revert all changes made in the "new department detection + admin creation on upload" task.

---

## Summary of changes

1. **Employee upload**  
   When you upload an employee Excel that contains a **Department Name** not seen before, the system now:
   - Adds that department to the report system (Plant Report, Google Sheet, export) automatically — departments come from `Employee.dept_name`, so no extra "department list" change was needed.
   - Creates a **department admin** for that department and adds it to **Manage Admins**: email `admin_{slug}@dept.hr`, default password `123456789` (same as admin@gmail.com in seed).

2. **Files modified**
   - `backend/core/excel_upload.py` – new helper + call after upload
   - `frontend/src/pages/UploadEmployees.jsx` – show created admins in result
   - `UNDO_CHANGES.md` – this file (can delete after undo)

---

## How to undo

### 1. Revert `backend/core/excel_upload.py`

**Remove:**
- The new import: `Admin` in the `from .models import ...` line (change back to `from .models import Employee, Attendance`).
- The entire block from `# Default password for new department admins` through the end of `ensure_admins_for_departments(...)` (constants `DEFAULT_DEPT_ADMIN_PASSWORD`, `DEPT_ADMIN_ACCESS`, and functions `_slugify_dept`, `ensure_admins_for_departments`).
- In `upload_employees_excel`:
  - The variable `upload_dept_names = set()` and the two lines that add to it: `if (dept or '').strip(): upload_dept_names.add(dept.strip())`.
  - The call `created_admins = ensure_admins_for_departments(upload_dept_names)` and the key `'created_admins': created_admins` in the return dict; restore the original return to `return {'success': True, 'created': created, 'updated': updated, 'errors': errors}`.

### 2. Revert `frontend/src/pages/UploadEmployees.jsx`

**Remove:**
- The extra result block for `created_admins`. Change the result display back to only:
  - `Created: {result.created}, Updated: {result.updated}, Errors: {result.errors}`

### 3. Optional: remove created admins from DB

If you want to remove the admins that were auto-created:

- In Django shell or admin: delete `Admin` rows where `email` matches `admin_*@dept.hr` for the departments you want to remove.

### 4. Delete this file

- Delete `UNDO_CHANGES.md` if you no longer need the undo instructions.

---

## Exact code to restore (for reference)

**`backend/core/excel_upload.py`**

- Line ~11: `from .models import Employee, Attendance` (no `Admin`).
- In `upload_employees_excel`: no `upload_dept_names`, no `upload_dept_names.add(...)`, no `ensure_admins_for_departments` call, and the return is:
  `return {'success': True, 'created': created, 'updated': updated, 'errors': errors}`.

**`frontend/src/pages/UploadEmployees.jsx`**

- Result section:
  `Created: {result.created}, Updated: {result.updated}, Errors: {result.errors}`  
  (no `created_admins` line).
