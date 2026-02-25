import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { systemOwner } from '../../api'
import './SystemOwner.css'

export default function SystemOwnerCompanies() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    systemOwner.companies.list()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h2 className="pageSubtitle" style={{ margin: 0 }}>All companies</h2>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/system-owner/companies/add')}>
            Add company
          </button>
        </div>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
