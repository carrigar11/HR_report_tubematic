import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { dashboard } from '../api'
import './Dashboard.css'

function getAdminName() {
  try {
    const stored = localStorage.getItem('hr_admin')
    if (stored) {
      const o = JSON.parse(stored)
      return o.name || ''
    }
  } catch (_) {}
  return ''
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const adminName = getAdminName()

  useEffect(() => {
    dashboard()
      .then((r) => setData(r.data))
      .catch((e) => setErr(e.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="pageContent">
        <div className="dashboardWelcome card">
          <div className="welcomePlaceholder">Loading dashboard…</div>
        </div>
      </div>
    )
  }
  if (err) {
    return (
      <div className="pageContent">
        <div className="card" style={{ color: 'var(--danger)' }}>Error: {err}</div>
      </div>
    )
  }
  if (!data) return null

  const { total_employees, active_employees, today_present, today_absent, overtime_leaders, red_flag_employees, streak_rewards } = data

  const presentPct = (active_employees ?? total_employees) > 0 ? Math.round((today_present / (active_employees ?? total_employees)) * 100) : 0
  const redCount = red_flag_employees?.length ?? 0

  return (
    <div className="pageContent dashboard">
      <div className="dashboardWelcome card">
        <div className="welcomeContent">
          <h2 className="welcomeTitle">Welcome back{adminName ? `, ${adminName}` : ''}</h2>
          <p className="welcomeSub">Here is what is happening with attendance and your team today.</p>
        </div>
        <div className="welcomeMeta">
          <span className="welcomeDate">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="kpiGrid">
        <div className="kpiCard card">
          <div className="kpiIcon kpiIconDefault">E</div>
          <div className="kpiContent">
            <div className="kpiLabel">Total Employees</div>
            <div className="kpiValue">{total_employees}</div>
            <div className="kpiHint">All (including Inactive)</div>
          </div>
        </div>
        <div className="kpiCard card">
          <div className="kpiIcon kpiIconDefault">A</div>
          <div className="kpiContent">
            <div className="kpiLabel">Active Employees</div>
            <div className="kpiValue">{active_employees ?? total_employees}</div>
            <div className="kpiHint">Not Inactive (Active / Week off / Holiday)</div>
          </div>
        </div>
        <div className="kpiCard card">
          <div className="kpiIcon kpiIconGreen">P</div>
          <div className="kpiContent">
            <div className="kpiLabel">Today Present</div>
            <div className="kpiValue green">{today_present}</div>
            <div className="kpiHint">{presentPct}% of active</div>
          </div>
        </div>
        <div className="kpiCard card">
          <div className="kpiIcon kpiIconRed">A</div>
          <div className="kpiContent">
            <div className="kpiLabel">Today Absent</div>
            <div className="kpiValue red">{today_absent}</div>
            <div className="kpiHint">Requires follow-up</div>
          </div>
        </div>
        <div className="kpiCard card">
          <div className="kpiIcon kpiIconWarn">F</div>
          <div className="kpiContent">
            <div className="kpiLabel">Red Flags</div>
            <div className="kpiValue">{redCount}</div>
            <div className="kpiHint">Action required</div>
          </div>
        </div>
      </div>

      <div className="dashboardTwoCol">
        <section className="dashboardSection card dashboardLeaderboardCard">
          <div className="sectionHead">
            <h2 className="sectionTitle">Leaderboard & Streak</h2>
            <span className="sectionBadge">This week</span>
          </div>
          <div className="sectionBody">
            <div className="leaderboardSubSection">
              <h4 className="leaderboardSubTitle">Overtime leaders</h4>
              {overtime_leaders?.length ? (
                <table className="dataTable">
                  <thead>
                    <tr>
                      <th>Emp Code</th>
                      <th>Name</th>
                      <th>OT (hrs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overtime_leaders.slice(0, 5).map((row, i) => (
                      <tr key={`ot-${i}`}>
                        <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                        <td>{row.name || '—'}</td>
                        <td className="num">{Number(row.total_ot || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No overtime data this week.</p>
              )}
            </div>
            <div className="leaderboardSubSection">
              <h4 className="leaderboardSubTitle leaderboardSubTitleStreak">Streak</h4>
              {streak_rewards?.length ? (
                <table className="dataTable">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Trigger</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streak_rewards.slice(0, 5).map((row, i) => (
                      <tr key={`str-${i}`}>
                        <td><Link to={`/employees/${row.emp_code}/profile`}>{row.name || row.emp_code || '—'}</Link></td>
                        <td>{row.department || '—'}</td>
                        <td><span className="badge badge-success">{row.trigger_reason}</span></td>
                        <td>{row.created_at?.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No streak rewards yet. Run reward engine.</p>
              )}
            </div>
          </div>
        </section>

        <section className="dashboardSection card">
          <div className="sectionHead">
            <h2 className="sectionTitle">Red flag employees</h2>
            {redCount > 0 && <span className="sectionBadge danger">{redCount} pending</span>}
          </div>
          <div className="sectionBody">
            {red_flag_employees?.length ? (
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Emp Code</th>
                    <th>Reason</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {red_flag_employees.slice(0, 8).map((row, i) => (
                    <tr key={i}>
                      <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                      <td><span className="badge badge-danger">{row.trigger_reason}</span></td>
                      <td>{row.created_at?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No red flags. All clear.</p>
            )}
          </div>
        </section>
      </div>

      <div className="dashboardQuick card">
        <h2 className="sectionTitle">Quick actions</h2>
        <div className="quickActions">
          <Link to="/upload" className="quickActionItem">Upload data</Link>
          <Link to="/attendance" className="quickActionItem">View attendance</Link>
          <Link to="/employees" className="quickActionItem">Employee master</Link>
          <Link to="/absentee-alert" className="quickActionItem">Absentee alert</Link>
          <Link to="/export" className="quickActionItem">Export data</Link>
        </div>
      </div>
    </div>
  )
}
