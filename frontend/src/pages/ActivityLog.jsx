import { useState, useEffect } from 'react'
import { auditLog as auditLogApi } from '../api'
import './Table.css'

const MODULES = ['auth', 'admins', 'upload', 'attendance', 'employees', 'export', 'bonus', 'rewards', 'holidays', 'settings']
const ACTIONS = ['login', 'create', 'update', 'delete', 'export', 'upload', 'adjust', 'run']

export default function ActivityLog() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [limit, setLimit] = useState(200)

  const load = () => {
    setLoading(true)
    setError('')
    const params = { limit }
    if (moduleFilter) params.module = moduleFilter
    if (actionFilter) params.action = actionFilter
    auditLogApi
      .list(params)
      .then((r) => setList(r.data.results || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load activity log'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [moduleFilter, actionFilter, limit])

  if (error) return <p className="exportError">{error}</p>

  return (
    <div className="pageContent">
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Record of who did what and where. Super admin only.
      </p>
      <div className="exportPayrollFields" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="exportField">
          <label className="exportLabel">Module</label>
          <select className="input exportInput" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">All</option>
            {MODULES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="exportField">
          <label className="exportLabel">Action</label>
          <select className="input exportInput" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="exportField">
          <label className="exportLabel">Limit</label>
          <select className="input exportInput" value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ minWidth: 80 }}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Who</th>
                <th>Action</th>
                <th>Module</th>
                <th>Target</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={7} className="muted">No logs</td></tr>
              ) : (
                list.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                    <td>
                      {log.admin_name || log.admin_email || '—'}
                      {log.admin_email && log.admin_name !== log.admin_email && (
                        <span className="muted" style={{ fontSize: '0.85rem' }}> ({log.admin_email})</span>
                      )}
                    </td>
                    <td>{log.action}</td>
                    <td>{log.module}</td>
                    <td>{log.target_type && log.target_id ? `${log.target_type}: ${log.target_id}` : '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0
                        ? JSON.stringify(log.details)
                        : '—'}
                    </td>
                    <td>{log.ip_address || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
