import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { absenteeAlert } from '../api'
import './Table.css'

export default function AbsenteeAlert() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    absenteeAlert()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Absentee Alert (red flags)</h2>
      <div className="card tableCard">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Emp Code</th>
                <th>Trigger</th>
                <th>Metric</th>
                <th>Admin Status</th>
                <th>Date</th>
                <th>Profile</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id}>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                  <td><span className="badge badge-danger">{row.trigger_reason}</span></td>
                  <td>{row.metric_data}</td>
                  <td>{row.admin_action_status || 'Pending'}</td>
                  <td>{row.created_at?.slice(0, 10)}</td>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && list.length === 0 && <p className="muted">No absentee alerts.</p>}
      </div>
    </div>
  )
}
