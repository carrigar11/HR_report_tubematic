import { useState, useEffect } from 'react'
import { systemOwner } from '../../api'
import './SystemOwner.css'
import '../ManageAdmins.css'

const ACCESS_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'employees', label: 'Employee Master' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'salary', label: 'Salary Report' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'bonus', label: 'Bonus Manager' },
  { key: 'penalty', label: 'Penalty' },
  { key: 'absentee_alert', label: 'Absentee Alert' },
  { key: 'adjustment', label: 'Adjustments' },
  { key: 'export', label: 'Export' },
  { key: 'upload', label: 'Upload' },
  { key: 'holidays', label: 'Holidays and leave' },
  { key: 'manage_admins', label: 'Manage Admins' },
]

export default function SystemOwnerAdmins() {
  const [list, setList] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editAdmin, setEditAdmin] = useState(null)
  const [editDepartment, setEditDepartment] = useState('')
  const [editAccess, setEditAccess] = useState({})
  const [editCompanyId, setEditCompanyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    systemOwner.companies.list()
      .then((r) => setCompanies(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCompanies([]))
  }, [])

  useEffect(() => {
    systemOwner.admins.list()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const openEdit = (admin) => {
    setEditAdmin(admin)
    setEditDepartment(admin.department || '')
    setEditAccess(admin.access || {})
    setEditCompanyId(admin.company_id ?? '')
    setMessage('')
  }

  const handleSaveAccess = async (e) => {
    e.preventDefault()
    if (!editAdmin) return
    setSaving(true)
    setMessage('')
    try {
      await systemOwner.admins.update(editAdmin.id, {
        department: editDepartment,
        access: editAccess,
        company_id: editCompanyId === '' ? null : parseInt(editCompanyId, 10),
      })
      setMessage('Saved.')
      setList((prev) => prev.map((a) => a.id === editAdmin.id ? { ...a, department: editDepartment, access: editAccess, company_id: editCompanyId ? parseInt(editCompanyId, 10) : null, company_name: editCompanyId ? companies.find((c) => c.id === parseInt(editCompanyId, 10))?.name : null } : a))
    } catch (err) {
      setMessage(err.response?.data?.error || err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <div className="card"><p className="error">{error}</p></div>

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <h2 className="pageSubtitle">All admins</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td>{a.department || '—'}</td>
                    <td>{a.company_name || '—'}</td>
                    <td>{a.role === 'super_admin' ? 'Super Admin' : 'Dept Admin'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btnSm" onClick={() => openEdit(a)}>Edit access</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editAdmin && (
          <>
            <div className="profileBackdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100 }} onClick={() => setEditAdmin(null)} aria-hidden />
            <div className="card" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 101, maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' }}>
              <h3>Edit access — {editAdmin.email}</h3>
              {message && <p className={message === 'Saved.' ? 'success' : 'error'}>{message}</p>}
              <form onSubmit={handleSaveAccess}>
                <label className="label">Department</label>
                <input type="text" className="input" value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)} />
                <label className="label">Company</label>
                <select className="input" value={editCompanyId} onChange={(e) => setEditCompanyId(e.target.value)}>
                  <option value="">None</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <label className="label">Access</label>
                <div className="manageAdminsAccessGrid">
                  {ACCESS_OPTIONS.map(({ key, label }) => (
                    <label key={key}>
                      <input type="checkbox" checked={!!editAccess[key]} onChange={(e) => setEditAccess((acc) => ({ ...acc, [key]: e.target.checked }))} />
                      {label}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditAdmin(null)}>Close</button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
