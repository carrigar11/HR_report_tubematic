import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { employees } from '../api'
import './Table.css'

export default function EmployeeProfile() {
  const { empCode } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!empCode) return
    setLoading(true)
    employees.profile(empCode)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Not found'))
      .finally(() => setLoading(false))
  }, [empCode])

  if (loading) return <div className="pageContent"><p className="muted">Loading…</p></div>
  if (error) return <div className="pageContent"><p className="muted" style={{ color: 'var(--danger)' }}>Error: {error}</p></div>
  if (!data) return null

  const emp = data.employee
  const att = data.attendance || []
  const rewards = data.rewards || []
  const adjustments = data.adjustments || []
  const salaries = data.salaries || []

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Profile: {emp?.name} ({emp?.emp_code})</h2>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Details</h3>
        <p><strong>Code:</strong> {emp?.emp_code} | <strong>Dept:</strong> {emp?.dept_name} | <strong>Designation:</strong> {emp?.designation}</p>
        <p><strong>Mobile:</strong> {emp?.mobile || '—'} | <strong>Email:</strong> {emp?.email || '—'} | <strong>Status:</strong> {emp?.status}</p>
      </div>

      <h3>Recent Attendance</h3>
      <div className="card tableCard" style={{ marginBottom: '1.5rem' }}>
        <table>
          <thead>
            <tr><th>Date</th><th>Punch In</th><th>Punch Out</th><th>Hrs</th><th>Status</th><th>OT</th></tr>
          </thead>
          <tbody>
            {att.slice(0, 20).map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.punch_in || '—'}</td>
                <td>{row.punch_out || '—'}</td>
                <td>{Number(row.total_working_hours || 0).toFixed(2)}</td>
                <td>{row.status}</td>
                <td>{Number(row.over_time || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Rewards / Actions</h3>
      <div className="card tableCard" style={{ marginBottom: '1.5rem' }}>
        <table>
          <thead>
            <tr><th>Type</th><th>Trigger</th><th>Metric</th><th>Date</th></tr>
          </thead>
          <tbody>
            {rewards.slice(0, 15).map((row) => (
              <tr key={row.id}>
                <td><span className={`badge badge-${row.entry_type === 'REWARD' ? 'success' : 'danger'}`}>{row.entry_type}</span></td>
                <td>{row.trigger_reason}</td>
                <td>{row.metric_data}</td>
                <td>{row.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Adjustments</h3>
      <div className="card tableCard" style={{ marginBottom: '1.5rem' }}>
        <table>
          <thead>
            <tr><th>Date</th><th>Reason</th><th>By</th><th>Created</th></tr>
          </thead>
          <tbody>
            {adjustments.slice(0, 10).map((row) => (
              <tr key={row.id}>
                <td>{row.adj_date}</td>
                <td>{row.reason}</td>
                <td>{row.created_by_admin}</td>
                <td>{row.created_at?.slice(0, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Salary History</h3>
      <div className="card tableCard">
        <table>
          <thead>
            <tr><th>Month</th><th>Year</th><th>Base</th><th>OT Hrs</th><th>Bonus</th></tr>
          </thead>
          <tbody>
            {salaries.map((row) => (
              <tr key={row.id}>
                <td>{row.month}</td>
                <td>{row.year}</td>
                <td>{Number(row.base_salary || 0).toFixed(2)}</td>
                <td>{Number(row.overtime_hours || 0).toFixed(2)}</td>
                <td>{Number(row.bonus || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
