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

  // Edit profile (name, email, password, department, role, access)
  const [editProfileAdmin, setEditProfileAdmin] = useState(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editRole, setEditRole] = useState('dept_admin')
  const [editAccess, setEditAccess] = useState({ ...DEPT_ADMIN_ACCESS })
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

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

  const openEditProfile = (admin) => {
    setEditProfileAdmin(admin)
    setEditName(admin.name || '')
    setEditEmail(admin.email || '')
    setEditPhone(admin.phone || '')
    setEditPassword('')
    setEditDepartment(admin.department || '')
    setEditRole(admin.role || 'dept_admin')
    setEditAccess(admin.access && typeof admin.access === 'object' ? { ...DEFAULT_ACCESS_OBJ, ...admin.access } : { ...DEPT_ADMIN_ACCESS })
    setShowEditPassword(false)
    setEditError('')
  }

  const applyEditAccessPreset = (role) => {
    setEditAccess(role === 'super_admin' ? { ...SUPER_ADMIN_ACCESS } : { ...DEPT_ADMIN_ACCESS })
    setEditRole(role)
  }

  const handleEditProfile = async (e) => {
    e.preventDefault()
    if (!editProfileAdmin) return
    setEditError('')
    setEditLoading(true)
    try {
      const payload = { name: editName.trim(), email: editEmail.trim(), phone: (editPhone || '').trim() }
      if (editPassword.trim()) payload.password = editPassword
      await adminsApi.update(editProfileAdmin.id, payload)
      if (editProfileAdmin.id !== 1) {
        await adminsApi.updateAccess(editProfileAdmin.id, {
          department: editDepartment.trim(),
          role: editRole,
          access: editAccess,
        })
      }
      setList((prev) =>
        prev.map((a) =>
          a.id === editProfileAdmin.id
            ? { ...a, name: payload.name, email: payload.email, phone: payload.phone, department: editDepartment.trim(), role: editRole, access: editAccess }
            : a
        )
      )
      setMessage('Profile and access updated.')
      setEditProfileAdmin(null)
    } catch (err) {
      const msg = err.response?.data?.email?.[0] || err.response?.data?.error || 'Update failed'
      setEditError(msg)
    } finally {
      setEditLoading(false)
    }
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
                  <td>{admin.id === 1 ? <span className="muted">—</span> : (admin.department || '—')}</td>
                  <td>
                    {admin.id === 1 ? <strong>Super Admin</strong> : (admin.role === 'super_admin' ? 'Super Admin' : 'Dept Admin')}
                  </td>
                  <td>
                    {admin.id === 1 ? (
                      <span className="manageAdminsAccessLabel full">Full access</span>
                    ) : (admin.role === 'super_admin' || (admin.access?.manage_admins && admin.access?.settings)) ? (
                      <span className="manageAdminsAccessLabel full">Full access</span>
                    ) : (
                      <span className="manageAdminsAccessLabel dept">Dept access</span>
                    )}
                  </td>
                  <td>
                    <div className="manageAdminsActions">
                      <button
                        type="button"
                        className="maActionBtn maActionEdit"
                        onClick={() => openEditProfile(admin)}
                      >
                        Edit
                      </button>
                      {admin.id !== 1 && (
                        <>
                          <span className="maActionDivider" aria-hidden />
                          <button
                            type="button"
                            className="maActionBtn maActionDelete"
                            disabled={deletingId === admin.id}
                            onClick={() => handleDelete(admin)}
                          >
                            {deletingId === admin.id ? '…' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
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

      {editProfileAdmin && (
        <div className="manageAdminsModalBackdrop" onClick={() => !editLoading && setEditProfileAdmin(null)}>
          <div className="card manageAdminsModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="manageAdminsModalTitle">Edit profile</h3>
            <p className="manageAdminsModalUser muted">ID {editProfileAdmin.id}</p>
            <form onSubmit={handleEditProfile}>
              {editError && <p className="exportError">{editError}</p>}
              <div className="manageAdminsField">
                <label>Name *</label>
                <input
                  type="text"
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  placeholder="Full name"
                />
              </div>
              <div className="manageAdminsField">
                <label>Email *</label>
                <input
                  type="email"
                  className="input"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  placeholder="admin@example.com"
                />
              </div>
              <div className="manageAdminsField">
                <label>Phone</label>
                <input
                  type="tel"
                  className="input"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div className="manageAdminsField">
                <label>New password</label>
                <div className="manageAdminsPasswordWrap">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    className="input"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                  />
                  <button
                    type="button"
                    className="manageAdminsEyeBtn"
                    onClick={() => setShowEditPassword((v) => !v)}
                    aria-label={showEditPassword ? 'Hide password' : 'Show password'}
                  >
                    {showEditPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
              </div>
              {editProfileAdmin.id !== 1 && (
                <>
                  <hr className="manageAdminsEditDivider" />
                  <h4 className="manageAdminsEditSectionTitle">Department &amp; Access</h4>
                  <div className="manageAdminsField">
                    <label>Department</label>
                    <input
                      type="text"
                      className="input"
                      value={editDepartment}
                      onChange={(e) => setEditDepartment(e.target.value)}
                      placeholder="e.g. HR, Production"
                    />
                  </div>
                  <div className="manageAdminsField">
                    <label>Role &amp; access preset</label>
                    <p className="manageAdminsAccessDesc" style={{ marginBottom: '0.5rem' }}>
                      Dept Admin: all modules except Manage Admins &amp; Settings. Super Admin: full access.
                    </p>
                    <div className="manageAdminsEditAccessBtns">
                      <button
                        type="button"
                        className={`btn ${editRole === 'dept_admin' ? 'btn-primary manageAdminsRoleBtnActive' : 'btn-secondary'}`}
                        onClick={() => applyEditAccessPreset('dept_admin')}
                      >
                        Dept Admin
                      </button>
                      <button
                        type="button"
                        className={`btn ${editRole === 'super_admin' ? 'btn-primary manageAdminsRoleBtnActive' : 'btn-secondary'}`}
                        onClick={() => applyEditAccessPreset('super_admin')}
                      >
                        Super Admin
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="manageAdminsModalActions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditProfileAdmin(null)} disabled={editLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
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
