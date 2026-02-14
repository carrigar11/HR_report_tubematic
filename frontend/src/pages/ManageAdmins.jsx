import { useState, useEffect, Fragment } from 'react'
import { admins as adminsApi } from '../api'
import { IconEye, IconEyeOff, IconUser } from '../components/Icons'
import './Table.css'
import './ManageAdmins.css'

const ACCESS_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employee Master' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'salary', label: 'Salary Report' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'bonus', label: 'Bonus Manager' },
  { key: 'absentee_alert', label: 'Absentee Alert' },
  { key: 'adjustment', label: 'Adjustments' },
  { key: 'export', label: 'Export' },
  { key: 'upload', label: 'Upload' },
  { key: 'holidays', label: 'Holidays' },
  { key: 'settings', label: 'Settings' },
  { key: 'manage_admins', label: 'Manage Admins' },
]

const DEFAULT_ACCESS_OBJ = ACCESS_OPTIONS.reduce((acc, { key }) => ({ ...acc, [key]: true }), {})

// Role-based presets: Department Admin = full access to work on their dept data (no Manage Admins, no Settings)
const DEPT_ADMIN_ACCESS = { ...DEFAULT_ACCESS_OBJ, manage_admins: false, settings: false }
const SUPER_ADMIN_ACCESS = { ...DEFAULT_ACCESS_OBJ }

export default function ManageAdmins() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createDepartment, setCreateDepartment] = useState('')
  const [createRole, setCreateRole] = useState('dept_admin')
  const [createAccess, setCreateAccess] = useState({ ...DEPT_ADMIN_ACCESS })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [showCreatePassword, setShowCreatePassword] = useState(false)

  // Modal for editing access (preset only)
  const [accessModalAdmin, setAccessModalAdmin] = useState(null)

  const loadList = () => {
    adminsApi
      .list()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((err) => {
        setError(err.response?.data?.error || 'Only super admin can view this page.')
        setList([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadList()
  }, [])

  // When role changes in create form, apply role-based access preset
  useEffect(() => {
    if (!showCreate) return
    setCreateAccess(createRole === 'super_admin' ? { ...SUPER_ADMIN_ACCESS } : { ...DEPT_ADMIN_ACCESS })
  }, [createRole, showCreate])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateError('')
    setCreateLoading(true)
    try {
      await adminsApi.create({
        name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
        phone: createPhone.trim(),
        department: createDepartment.trim(),
        role: createRole,
        access: createAccess,
      })
      setMessage('Admin created successfully.')
      setShowCreate(false)
      resetCreateForm()
      loadList()
    } catch (err) {
      const msg = err.response?.data?.email?.[0] || err.response?.data?.error || 'Create failed'
      setCreateError(msg)
    } finally {
      setCreateLoading(false)
    }
  }

  const resetCreateForm = () => {
    setCreateName('')
    setCreateEmail('')
    setCreatePassword('')
    setCreatePhone('')
    setCreateDepartment('')
    setCreateRole('dept_admin')
    setCreateAccess({ ...DEPT_ADMIN_ACCESS })
    setCreateError('')
    setShowCreatePassword(false)
  }

  const setCreateAccessAll = (value) => {
    const next = {}
    ACCESS_OPTIONS.forEach(({ key }) => { next[key] = value })
    setCreateAccess(next)
  }

  const applyRolePreset = (role) => {
    setCreateAccess(role === 'super_admin' ? { ...SUPER_ADMIN_ACCESS } : { ...DEPT_ADMIN_ACCESS })
  }

  const handleSave = async (admin) => {
    if (admin.id === 1) return
    setSavingId(admin.id)
    setMessage('')
    try {
      const payload = {}
      if (admin.department !== undefined) payload.department = admin.department
      if (admin.role !== undefined) payload.role = admin.role
      if (admin.access !== undefined) payload.access = admin.access
      await adminsApi.updateAccess(admin.id, payload)
      setList((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, ...payload } : a))
      )
      setMessage('Saved.')
      setAccessModalAdmin(null)
    } catch (err) {
      setMessage(err.response?.data?.error || 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (admin) => {
    if (admin.id === 1) return
    setConfirmDelete(admin)
  }

  const confirmDeleteYes = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    setMessage('')
    try {
      await adminsApi.delete(confirmDelete.id)
      setList((prev) => prev.filter((a) => a.id !== confirmDelete.id))
      setMessage('Admin deleted.')
    } catch (err) {
      setMessage(err.response?.data?.error || 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  const updateLocal = (id, field, value) => {
    setList((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    )
  }

  const toggleAccess = (admin, key) => {
    if (admin.id === 1) return
    const access = { ...(admin.access || {}), [key]: !admin.access?.[key] }
    updateLocal(admin.id, 'access', access)
  }

  const setAccessAll = (admin, value) => {
    if (admin.id === 1) return
    const access = {}
    ACCESS_OPTIONS.forEach(({ key }) => { access[key] = value })
    updateLocal(admin.id, 'access', access)
  }

  const applyRolePresetToAdmin = (admin, role) => {
    if (admin.id === 1) return
    const access = role === 'super_admin' ? { ...SUPER_ADMIN_ACCESS } : { ...DEPT_ADMIN_ACCESS }
    updateLocal(admin.id, 'access', access)
  }

  const applyPresetAndSave = async (admin, role) => {
    if (admin.id === 1) return
    setSavingId(admin.id)
    setMessage('')
    const access = role === 'super_admin' ? { ...SUPER_ADMIN_ACCESS } : { ...DEPT_ADMIN_ACCESS }
    try {
      await adminsApi.updateAccess(admin.id, { access })
      setList((prev) => prev.map((a) => (a.id === admin.id ? { ...a, access } : a)))
      setMessage('Access updated.')
      setAccessModalAdmin(null)
    } catch (err) {
      setMessage(err.response?.data?.error || 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  const superCount = list.filter((a) => a.id === 1 || a.role === 'super_admin').length
  const deptCount = list.filter((a) => a.id !== 1 && a.role !== 'super_admin').length

  if (loading) {
    return (
      <div className="pageContent manageAdminsPage">
        <div className="manageAdminsLoading">
          <div className="manageAdminsSpinner" />
          <p>Loading admin accounts…</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="pageContent manageAdminsPage">
        <div className="manageAdminsError card">
          <p className="exportError">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pageContent manageAdminsPage">
      <header className="manageAdminsHeader">
        <div className="manageAdminsHeaderTop">
          <div className="manageAdminsHeaderIcon">
            <IconUser />
          </div>
          <div>
            <h1 className="manageAdminsTitle">Admin accounts</h1>
            <p className="manageAdminsSubtitle">Manage who can access the system and what they can see.</p>
          </div>
          <button
            type="button"
            className={`btn ${showCreate ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : '+ Create new admin'}
          </button>
        </div>
        <div className="manageAdminsStats">
          <span className="manageAdminsStat">
            <strong>{list.length}</strong> total
          </span>
          <span className="manageAdminsStat">
            <strong>{superCount}</strong> super
          </span>
          <span className="manageAdminsStat">
            <strong>{deptCount}</strong> department
          </span>
        </div>
        {message && <div className="manageAdminsMessage">{message}</div>}
      </header>

      {showCreate && (
        <div className="card manageAdminsCreateCard">
          <h2 className="manageAdminsCreateTitle">Create new admin</h2>
          <form onSubmit={handleCreate} className="manageAdminsCreateForm">
            {createError && <p className="exportError">{createError}</p>}
            <div className="manageAdminsCreateGrid">
              <div className="manageAdminsField">
                <label>Name *</label>
                <input
                  type="text"
                  className="input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                  placeholder="Full name"
                />
              </div>
              <div className="manageAdminsField">
                <label>Email *</label>
                <input
                  type="email"
                  className="input"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                />
              </div>
              <div className="manageAdminsField">
                <label>Password *</label>
                <div className="manageAdminsPasswordWrap">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    className="input"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Min 6 characters"
                  />
                  <button
                    type="button"
                    className="manageAdminsEyeBtn"
                    onClick={() => setShowCreatePassword((v) => !v)}
                    title={showCreatePassword ? 'Hide password' : 'Show password'}
                    aria-label={showCreatePassword ? 'Hide password' : 'Show password'}
                  >
                    {showCreatePassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>
              <div className="manageAdminsField">
                <label>Phone</label>
                <input
                  type="text"
                  className="input"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="manageAdminsField">
                <label>Department * (for Dept Admin)</label>
                <input
                  type="text"
                  className="input"
                  value={createDepartment}
                  onChange={(e) => setCreateDepartment(e.target.value)}
                  placeholder="e.g. Production, HR, Stores"
                />
                <span className="manageAdminsHint">They will only see data for this department.</span>
              </div>
              <div className="manageAdminsField">
                <label>Role</label>
                <select
                  className="input"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                >
                  <option value="dept_admin">Department Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <span className="manageAdminsHint">
                  Dept Admin = full access to their department. Super Admin = all access.
                </span>
              </div>
            </div>
            <div className="manageAdminsAccessSection manageAdminsAccessSectionRole">
              <label>Access</label>
              <p className="manageAdminsAccessDesc">
                <strong>Department Admin:</strong> All modules except Manage Admins &amp; Settings. They see only their department&apos;s data.<br />
                <strong>Super Admin:</strong> Full access to everything.
              </p>
              <div className="manageAdminsAccessQuick">
                <button type="button" className="btn btn-secondary" onClick={() => applyRolePreset('dept_admin')}>
                  Dept Admin (recommended for departments)
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => applyRolePreset('super_admin')}>
                  Super Admin (full access)
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary manageAdminsSubmitBtn" disabled={createLoading}>
              {createLoading ? 'Creating…' : 'Create admin'}
            </button>
          </form>
        </div>
      )}

      <section className="manageAdminsTableSection card">
        <h2 className="manageAdminsSectionTitle">All admins</h2>
        <p className="manageAdminsSectionNote">ID 1 is super admin and cannot be deleted or restricted.</p>
        <div className="tableWrap manageAdminsTableWrap">
        <table className="table manageAdminsTable">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Department</th>
              <th>Role</th>
              <th>Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((admin) => (
              <Fragment key={admin.id}>
                <tr className={admin.id === 1 ? 'superAdminRow' : ''}>
                  <td><span className="manageAdminsId">{admin.id}</span></td>
                  <td>
                    <span className="manageAdminsNameCell">
                      <span className="manageAdminsAvatar">{admin.name?.charAt(0)?.toUpperCase() || '?'}</span>
                      {admin.name}
                    </span>
                  </td>
                  <td><span className="manageAdminsEmail">{admin.email}</span></td>
                  <td>{admin.phone || '—'}</td>
                  <td>
                    {admin.id === 1 ? (
                      <span className="muted">—</span>
                    ) : (
                      <input
                        type="text"
                        className="input inputSm"
                        value={admin.department || ''}
                        onChange={(e) => updateLocal(admin.id, 'department', e.target.value)}
                        placeholder="Dept"
                      />
                    )}
                  </td>
                  <td>
                    {admin.id === 1 ? (
                      <strong>Super Admin</strong>
                    ) : (
                      <select
                        className="input inputSm"
                        value={admin.role || 'dept_admin'}
                        onChange={(e) => updateLocal(admin.id, 'role', e.target.value)}
                      >
                        <option value="dept_admin">Dept Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {admin.id === 1 ? (
                      <span className="manageAdminsAccessLabel full">Full access</span>
                    ) : (admin.role === 'super_admin' || (admin.access?.manage_admins && admin.access?.settings)) ? (
                      <span className="manageAdminsAccessLabel full">Full access</span>
                    ) : (
                      <span className="manageAdminsAccessLabel dept">Dept access</span>
                    )}
                    {admin.id !== 1 && (
                      <button
                        type="button"
                        className="btn btn-secondary btnSm"
                        style={{ marginLeft: '0.5rem' }}
                        onClick={() => setAccessModalAdmin(admin)}
                      >
                        Change
                      </button>
                    )}
                  </td>
                  <td>
                    {admin.id !== 1 && (
                      <span className="manageAdminsActions">
                        <button
                          type="button"
                          className="btn btn-primary btnSm"
                          disabled={savingId === admin.id}
                          onClick={() => handleSave(admin)}
                        >
                          {savingId === admin.id ? '…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btnSm btnDanger"
                          disabled={deletingId === admin.id}
                          onClick={() => handleDelete(admin)}
                        >
                          {deletingId === admin.id ? '…' : 'Delete'}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
        {list.length === 0 && (
          <div className="manageAdminsEmpty">No admins yet. Create one above.</div>
        )}
      </section>

      {accessModalAdmin && (
        <div className="manageAdminsModalBackdrop" onClick={() => setAccessModalAdmin(null)}>
          <div className="card manageAdminsModal manageAdminsModalAccess" onClick={(e) => e.stopPropagation()}>
            <h3 className="manageAdminsModalTitle">Change access</h3>
            <p className="manageAdminsModalUser">{accessModalAdmin.name} <span className="muted">({accessModalAdmin.email})</span></p>
            <p className="manageAdminsAccessDesc" style={{ marginBottom: '1rem' }}>
              Department admins get all modules except Manage Admins &amp; Settings. Super Admin gets full access.
            </p>
            <div className="manageAdminsModalActions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary" disabled={savingId === accessModalAdmin.id} onClick={() => applyPresetAndSave(accessModalAdmin, 'dept_admin')}>
                {savingId === accessModalAdmin.id ? 'Saving…' : 'Set Dept Admin access'}
              </button>
              <button type="button" className="btn btn-secondary" disabled={savingId === accessModalAdmin.id} onClick={() => applyPresetAndSave(accessModalAdmin, 'super_admin')}>
                Set Super Admin access
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAccessModalAdmin(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="manageAdminsModalBackdrop" onClick={() => setConfirmDelete(null)}>
          <div className="card manageAdminsModal manageAdminsModalDanger" onClick={(e) => e.stopPropagation()}>
            <h3 className="manageAdminsModalTitle">Delete admin?</h3>
            <p>
              Remove <strong>{confirmDelete.name}</strong> ({confirmDelete.email})? They will no longer be able to log in.
            </p>
            <div className="manageAdminsModalActions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btnDanger"
                disabled={deletingId === confirmDelete.id}
                onClick={confirmDeleteYes}
              >
                {deletingId === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
