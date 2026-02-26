import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { systemOwner } from '../../api'
import './SystemOwner.css'

export default function SystemOwnerCompanies() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const handleDeleteClick = (c) => {
    if (!deleteConfirm || deleteConfirm.id !== c.id) {
      setDeleteConfirm({ id: c.id, name: c.name, step: 1 })
      setMessage('')
      return
    }
    if (deleteConfirm.step === 1) {
      setDeleteConfirm({ ...deleteConfirm, step: 2 })
      setMessage('')
      return
    }
    setDeleting(true)
    setMessage('')
    systemOwner.companies.delete(c.id)
      .then(() => {
        setList((prev) => prev.filter((x) => x.id !== c.id))
        setDeleteConfirm(null)
        setMessage('Company deleted.')
      })
      .catch((e) => setMessage(e.response?.data?.error || e.message || 'Delete failed'))
      .finally(() => setDeleting(false))
  }

  const cancelDelete = () => {
    setDeleteConfirm(null)
    setMessage('')
  }

  useEffect(() => {
    systemOwner.companies.list()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>

  const confirmStep = deleteConfirm?.step ?? 0
  const companyToDelete = deleteConfirm ? list.find((c) => c.id === deleteConfirm.id) : null

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h2 className="pageSubtitle" style={{ margin: 0 }}>All companies</h2>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/system-owner/companies/add')}>
            Add company
          </button>
        </div>
        {message && <p className={message.startsWith('Company deleted') ? 'muted' : 'error'} style={{ marginBottom: '0.75rem' }}>{message}</p>}
        {list.length === 0 ? (
          <p className="muted">No companies yet.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Employees</th>
                  <th>Admins</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.code}</td>
                    <td>{c.employee_count ?? 0}</td>
                    <td>{c.admin_count ?? 0}</td>
                    <td>{c.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btnSm" onClick={() => navigate(`/system-owner/companies/${c.id}`)}>
                        Edit
                      </button>
                      {' '}
                      <button type="button" className="btn btnSm" style={{ background: 'var(--danger, #dc3545)', color: '#fff' }} onClick={() => setDeleteConfirm({ id: c.id, name: c.name, step: 1 })}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteConfirm && companyToDelete && (
        <div className="modalOverlay" onClick={() => !deleting && cancelDelete()} role="dialog" aria-modal="true" aria-labelledby="delete-company-title">
          <div className="card modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 id="delete-company-title" className="pageSubtitle" style={{ margin: '0 0 1rem 0' }}>
              Delete company
            </h3>
            {confirmStep === 1 ? (
              <>
                <p className="muted" style={{ marginBottom: '1rem' }}>
                  Delete <strong>{companyToDelete.name}</strong>? You will be asked to confirm again.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={cancelDelete}>Cancel</button>
                  <button type="button" className="btn" style={{ background: 'var(--danger, #dc3545)', color: '#fff' }} onClick={() => setDeleteConfirm((p) => ({ ...p, step: 2 }))}>
                    Yes, continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginBottom: '1rem' }}>
                  This will permanently delete the company and all its employees and admins. This cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" disabled={deleting} onClick={cancelDelete}>Cancel</button>
                  <button type="button" className="btn" disabled={deleting} style={{ background: 'var(--danger, #dc3545)', color: '#fff' }} onClick={() => handleDeleteClick(companyToDelete)}>
                    {deleting ? 'Deleting…' : 'Yes, delete permanently'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
