import { useState, useEffect } from 'react'
import { auditLog as auditLogApi } from '../api'
import './Table.css'
import './ActivityLog.css'

const MODULES = ['auth', 'admins', 'upload', 'attendance', 'employees', 'export', 'bonus', 'rewards', 'holidays', 'settings', 'salary', 'penalty']
const ACTIONS = ['login', 'create', 'update', 'delete', 'export', 'upload', 'adjust', 'run']

export default function ActivityLog() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [adminIdFilter, setAdminIdFilter] = useState('')
  const [limit, setLimit] = useState(200)
  const [detailLog, setDetailLog] = useState(null)

  const clearFilters = () => {
    setModuleFilter('')
    setActionFilter('')
    setAdminIdFilter('')
    setLimit(200)
  }

  const load = () => {
    setLoading(true)
    setError('')
    const params = { limit }
    if (moduleFilter) params.module = moduleFilter
    if (actionFilter) params.action = actionFilter
    if (adminIdFilter.trim()) params.admin_id = adminIdFilter.trim()
    auditLogApi
      .list(params)
      .then((r) => setList(r.data.results || []))
      .catch((err) => setError(err.response?.data?.error || 'Failed to load activity log'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [moduleFilter, actionFilter, adminIdFilter, limit])

  if (error) return <p className="exportError">{error}</p>

  return (
    <div className="pageContent activityLogPage">
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Record of who did what and where. Super admin only.
      </p>
      <div className="activityLogFilters">
        <div className="filterGroup">
          <label>Module</label>
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
            <option value="">All</option>
            {MODULES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="filterGroup">
          <label>Action</label>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="filterGroup">
          <label>Admin ID</label>
          <input
            type="number"
            className="adminIdInput"
            placeholder="ID"
            value={adminIdFilter}
            onChange={(e) => setAdminIdFilter(e.target.value.replace(/\D/g, ''))}
            min={1}
          />
        </div>
        <div className="filterGroup">
          <label>Limit</label>
          <select className="limitSelect" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
        <button type="button" className="btn btn-secondary refreshBtn" onClick={load} disabled={loading}>Refresh</button>
        <button type="button" className="btn btn-outline activityLogClearBtn" onClick={clearFilters} disabled={loading}>Clear filters</button>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="activityLogTableWrap">
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
                    <td className="activityLogDetailsCell">
                      {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 ? (
                        <>
                          <span className="activityLogDetailsPreview" title={JSON.stringify(log.details)}>
                            {JSON.stringify(log.details)}
                          </span>
                          <button type="button" className="btn btn-secondary activityLogViewDetailsBtn" onClick={() => setDetailLog(log)}>View full</button>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{log.ip_address || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {detailLog && (
        <div className="activityLogDetailBackdrop" onClick={() => setDetailLog(null)}>
          <div className="activityLogDetailModal card" onClick={(e) => e.stopPropagation()}>
            <h3 className="activityLogDetailTitle">Full details</h3>
            <div className="activityLogDetailMeta">
              <p><strong>Time</strong> {detailLog.created_at ? new Date(detailLog.created_at).toLocaleString() : '—'}</p>
              <p><strong>Who</strong> {detailLog.admin_name || detailLog.admin_email || '—'} {detailLog.admin_email && detailLog.admin_name !== detailLog.admin_email && `(${detailLog.admin_email})`}</p>
              <p><strong>Action</strong> {detailLog.action} · <strong>Module</strong> {detailLog.module}</p>
              <p><strong>Target</strong> {detailLog.target_type && detailLog.target_id ? `${detailLog.target_type}: ${detailLog.target_id}` : '—'}</p>
              <p><strong>IP</strong> {detailLog.ip_address || '—'}</p>
            </div>
            <div className="activityLogDetailJsonWrap">
              <label className="activityLogDetailJsonLabel">Details (JSON)</label>
              <pre className="activityLogDetailJson">
                {detailLog.details && typeof detailLog.details === 'object' && Object.keys(detailLog.details).length > 0
                  ? JSON.stringify(detailLog.details, null, 2)
                  : '{}'}
              </pre>
            </div>
            <div className="activityLogDetailActions">
              <button type="button" className="btn btn-primary" onClick={() => setDetailLog(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
