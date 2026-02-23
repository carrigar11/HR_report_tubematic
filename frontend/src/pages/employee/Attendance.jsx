import { useState, useEffect } from 'react'
import { employee } from '../../api'
import '../Table.css'
import './Attendance.css'

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()

function formatTime(t) {
  if (!t) return '—'
  if (typeof t === 'string' && t.includes(':')) return t
  return t
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr + 'Z')
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function StatusBadge({ status }) {
  const c = status === 'Present' ? 'present' : status === 'Absent' ? 'absent' : status === 'Half-Day' ? 'halfday' : 'other'
  return <span className={`empAttStatusBadge ${c}`}>{status || '—'}</span>
}

export default function EmployeeAttendance() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)

  const load = () => {
    setLoading(true)
    employee.attendance({ month, year })
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => load(), [month, year])

  const totalHrs = list.reduce((s, r) => s + (parseFloat(r.total_working_hours) || 0), 0)
  const totalOt = list.reduce((s, r) => s + (parseFloat(r.over_time) || 0), 0)
  const presentCount = list.filter((r) => r.status === 'Present').length

  return (
    <div className="empAttPage">
      <div className="empAttTop">
        <div className="empAttFilters">
          <div className="empAttFilterGroup">
            <label className="label">Month</label>
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <div className="empAttFilterGroup">
            <label className="label">Year</label>
            <input type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear)} min={2020} max={2100} />
          </div>
          <div className="empAttActions">
            <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <h2 className="empAttHeading">{new Date(2000, month - 1).toLocaleString('default', { month: 'long' })} {year}</h2>
      </div>

      <div className="empAttSummary card">
        <span className="empAttSummaryItem"><strong>{presentCount}</strong> days present</span>
        <span className="empAttSummaryItem"><strong>{totalHrs.toFixed(1)}</strong> h worked</span>
        <span className="empAttSummaryItem"><strong>{totalOt.toFixed(1)}</strong> h OT</span>
      </div>

      <div className="card empAttTableCard">
        {loading ? (
          <p className="muted empAttLoading">Loading…</p>
        ) : list.length === 0 ? (
          <p className="muted empAttEmpty">No attendance for this month.</p>
        ) : (
          <div className="empAttTableWrap">
            <table className="empAttTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Punch in</th>
                  <th>Punch out</th>
                  <th>Hours</th>
                  <th>OT</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id || `${row.emp_code}-${row.date}`}>
                    <td className="empAttDate">{formatDate(row.date)}</td>
                    <td>{formatTime(row.punch_in)}</td>
                    <td>{formatTime(row.punch_out)}</td>
                    <td className="empAttNum">{row.total_working_hours ?? '—'}</td>
                    <td className="empAttNum">{row.over_time ?? '—'}</td>
                    <td><StatusBadge status={row.status} /></td>
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
