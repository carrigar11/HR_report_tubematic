import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { leaderboard } from '../api'
import './Table.css'

export default function Leaderboard() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    leaderboard()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Leaderboard (rewards)</h2>
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
                <th>Date</th>
                <th>Profile</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id}>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                  <td><span className="badge badge-success">{row.trigger_reason}</span></td>
                  <td>{row.metric_data}</td>
                  <td>{row.created_at?.slice(0, 10)}</td>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && list.length === 0 && <p className="muted">No leaderboard entries yet.</p>}
      </div>
    </div>
  )
}
