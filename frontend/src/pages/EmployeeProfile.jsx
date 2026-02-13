import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { employees } from '../api'
import './Table.css'
import './EmployeeProfile.css'

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const formatCurrency = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

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
  const initials = emp?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'

  const DetailItem = ({ label, value, empty, className = '' }) => (
    <div className="profileDetailItem">
      <span className="profileDetailLabel">{label}</span>
      <span className={`profileDetailValue ${!value && empty ? 'empty' : ''} ${className}`}>
        {value || '—'}
      </span>
    </div>
  )

  const expectedHours = (() => {
    if (!emp?.shift_from || !emp?.shift_to) return null
    const [fh, fm] = String(emp.shift_from).split(':').map(Number)
    const [th, tm] = String(emp.shift_to).split(':').map(Number)
    let fromMin = fh * 60 + fm
    let toMin = th * 60 + tm
    if (toMin <= fromMin) toMin += 24 * 60
    return ((toMin - fromMin) / 60).toFixed(1)
  })()

  return (
    <div className="pageContent profilePage">
      {/* Header */}
      <div className="profileHeader">
        <div className="profileAvatar">{initials}</div>
        <div className="profileHeaderInfo">
          <h2>{emp?.name}</h2>
          <span className="profileCode">{emp?.emp_code}</span>
          <span className={`profileStatus ${emp?.status === 'Active' ? 'profileStatusActive' : 'profileStatusInactive'}`}>
            {emp?.status}
          </span>
        </div>
      </div>

      {/* Shift & Work Banner */}
      <div className="profileShiftBanner">
        <div className="shiftBannerItem">
          <span className="shiftBannerIcon">&#128336;</span>
          <div className="shiftBannerText">
            <span className="shiftBannerLabel">Assigned Shift</span>
            <span className="shiftBannerValue">{emp?.shift || 'Not assigned'}</span>
          </div>
        </div>
        <div className="shiftBannerDivider" />
        <div className="shiftBannerItem">
          <span className="shiftBannerIcon">&#128197;</span>
          <div className="shiftBannerText">
            <span className="shiftBannerLabel">Shift Timing</span>
            <span className="shiftBannerValue">
              {emp?.shift_from && emp?.shift_to
                ? `${String(emp.shift_from).slice(0, 5)} – ${String(emp.shift_to).slice(0, 5)}`
                : '—'}
            </span>
          </div>
        </div>
        <div className="shiftBannerDivider" />
        <div className="shiftBannerItem">
          <span className="shiftBannerIcon">&#9201;</span>
          <div className="shiftBannerText">
            <span className="shiftBannerLabel">Expected Hours</span>
            <span className="shiftBannerValue shiftBannerHighlight">{expectedHours ? `${expectedHours}h / day` : '—'}</span>
          </div>
        </div>
      </div>

      {/* Details Card */}
      <div className="card profileDetailsCard">
        <h3 className="profileDetailsTitle">Details</h3>
        <div className="profileDetailsGrid">
          <DetailItem label="Employee Code" value={emp?.emp_code} className="mono" />
          <DetailItem label="Department" value={emp?.dept_name} empty />
          <DetailItem label="Designation" value={emp?.designation} empty />
          <DetailItem label="Gender" value={emp?.gender} empty />
          <DetailItem label="Mobile" value={emp?.mobile} empty />
          <DetailItem label="Email" value={emp?.email} empty />
          <DetailItem label="Employment Type" value={emp?.employment_type} empty />
          <DetailItem label="Salary Type" value={emp?.salary_type} empty />
          <DetailItem label="Base Salary" value={emp?.base_salary != null ? formatCurrency(emp?.base_salary) : null} empty className="highlight" />
          <DetailItem label="Joined" value={emp?.created_at ? formatDate(emp.created_at) : null} empty />
          <DetailItem label="Last Updated" value={emp?.updated_at ? formatDate(emp.updated_at) : null} empty />
        </div>
      </div>

      <h3 className="profileSectionTitle">Recent Attendance</h3>
      <div className="card tableCard profileCard">
        <table>
          <thead>
            <tr><th>Date</th><th>Punch In</th><th>Punch Out</th><th>Hrs</th><th>Status</th><th>OT</th></tr>
          </thead>
          <tbody>
            {att.slice(0, 20).map((row) => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.punch_in ? String(row.punch_in).slice(0, 5) : '—'}</td>
                <td>{row.punch_out ? `${String(row.punch_out).slice(0, 5)}${row.punch_spans_next_day ? ' (next day)' : ''}` : '—'}</td>
                <td>{Number(row.total_working_hours || 0).toFixed(2)}</td>
                <td>{row.status}</td>
                <td>{Number(row.over_time || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="profileSectionTitle">Rewards / Actions</h3>
      <div className="card tableCard profileCard">
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

      <h3 className="profileSectionTitle">Adjustments</h3>
      <div className="card tableCard profileCard">
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

      <h3 className="profileSectionTitle">Salary History</h3>
      <div className="card tableCard profileCard">
        <table>
          <thead>
            <tr><th>Month</th><th>Year</th><th>Base</th><th>OT Hrs</th><th>Bonus</th></tr>
          </thead>
          <tbody>
            {salaries.map((row) => (
              <tr key={row.id}>
                <td>{row.month}</td>
                <td>{row.year}</td>
                <td>{formatCurrency(row.base_salary)}</td>
                <td>{Number(row.overtime_hours || 0).toFixed(2)}</td>
                <td>{formatCurrency(row.bonus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
