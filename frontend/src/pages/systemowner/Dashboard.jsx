import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { systemOwner } from '../../api'
import './SystemOwner.css'
import '../../Layout.css'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString(undefined, { dateStyle: 'short' })
  } catch (_) {
    return iso
  }
}

export default function SystemOwnerDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    systemOwner.dashboard()
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>

  const stats = [
    { label: 'Companies', value: data?.companies_count ?? 0, to: '/system-owner/companies', variant: 'primary' },
    { label: 'Employees', value: data?.employees_count ?? 0, to: '/system-owner/employees', variant: 'gold' },
    { label: 'Admins', value: data?.admins_count ?? 0, to: '/system-owner/admins', variant: 'purple' },
    {
      label: 'Pending requests',
      value: data?.pending_company_requests_count ?? 0,
      to: '/system-owner/company-requests',
      variant: 'danger',
      highlight: (data?.pending_company_requests_count ?? 0) > 0,
    },
  ]

  return (
    <div className="systemOwnerDashboard">
      <div className="dashboardHead">
        <h2 className="pageSubtitle dashboardPageTitle">Overview</h2>
        <div className="dashboardQuickActions">
          <Link to="/system-owner/companies/add" className="btn btn-primary btnSm dashboardBtnPrimary">Add company</Link>
          <Link to="/system-owner/company-requests" className="btn btn-secondary btnSm dashboardBtnSecondary">Company requests</Link>
        </div>
      </div>

      <div className="dashboardStats">
        {stats.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className={`dashboardStatCard card dashboardStatCard--${s.variant || 'primary'} ${s.highlight ? 'dashboardStatCardHighlight' : ''}`}
          >
            <div className="dashboardStatContent">
              <span className="dashboardStatLabel">{s.label.toUpperCase()}</span>
              <span className="dashboardStatValue">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</span>
            </div>
          </Link>
        ))}
      </div>

      {((data?.notifications?.length ?? 0) > 0 || (data?.pending_company_requests_count ?? 0) > 0) && (
        <div className="card systemOwnerCardSection">
          <div className="dashboardSectionHead">
            <h3 className="pageSubtitle dashboardSectionTitle" style={{ margin: 0 }}>Notifications</h3>
            <Link to="/system-owner/company-requests" className="dashboardViewAllLink">View all</Link>
          </div>
          <ul className="dashboardNotificationList">
            {(data?.notifications?.length ?? 0) === 0 ? (
              <li className="dashboardMuted">No recent notifications.</li>
            ) : (
              (data?.notifications || []).slice(0, 5).map((n) => (
                <li key={`${n.type}-${n.id}`} className="dashboardNotificationItem">
                  <span className="dashboardNotificationTitle">{n.title}</span>
                  <span className="dashboardNotificationMessage">{n.message}</span>
                  <span className="dashboardNotificationTime">{formatDate(n.created_at)}</span>
                  <Link to={n.link} className="dashboardViewLink">View</Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <div className="dashboardGrid">
        <div className="card">
          <div className="dashboardSectionHead">
            <h3 className="pageSubtitle dashboardSectionTitle" style={{ margin: 0 }}>Recent company requests</h3>
            <Link to="/system-owner/company-requests" className="dashboardViewAllLink">View all</Link>
          </div>
          {!data?.recent_company_requests?.length ? (
            <p className="dashboardMuted">No registration requests yet.</p>
          ) : (
            <div className="tableWrap">
              <table className="table dashboardTable">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_company_requests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.company_name}</td>
                      <td>{r.contact_email}</td>
                      <td>{formatDate(r.created_at)}</td>
                      <td><Link to="/system-owner/company-requests" className="btn btn-secondary btnSm">Review</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="dashboardSectionHead">
            <h3 className="pageSubtitle dashboardSectionTitle" style={{ margin: 0 }}>Recent companies</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link to="/system-owner/companies/add" className="dashboardViewAllLink">Add</Link>
              <Link to="/system-owner/companies" className="dashboardViewAllLink">View all</Link>
            </div>
          </div>
          {!data?.recent_companies?.length ? (
            <p className="dashboardMuted">No companies yet.</p>
          ) : (
            <div className="tableWrap">
              <table className="table dashboardTable">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Added</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_companies.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.code}</td>
                      <td>{formatDate(c.created_at)}</td>
                      <td><Link to={`/system-owner/companies/${c.id}`} className="btn btn-secondary btnSm">Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
