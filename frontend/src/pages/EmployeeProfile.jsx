import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { employees } from '../api'
import './Table.css'
import './EmployeeProfile.css'

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const formatCurrency = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

/** Per-hour rate: Hourly = base_salary; Monthly/Fixed = base_salary / 208 (26 days × 8 h, same as backend). */
function perHourSalary(baseSalary, salaryType) {
  if (baseSalary == null) return null
  const base = Number(baseSalary)
  if (!base) return 0
  const st = (salaryType || '').toLowerCase()
  if (st === 'hourly') return base
  return base / 208
}

const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Week off', label: 'Week off' },
  { value: 'Holiday', label: 'Holiday' },
]

export default function EmployeeProfile() {
  const { empCode } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusUpdating, setStatusUpdating] = useState(false)

  const fetchProfile = () => {
    if (!empCode) return
    setLoading(true)
    employees.profile(empCode)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Not found'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchProfile()
  }, [empCode])

  if (loading) return <div className="pageContent"><p className="muted">Loading…</p></div>
  if (error) return <div className="pageContent"><p className="muted" style={{ color: 'var(--danger)' }}>Error: {error}</p></div>
  if (!data) return null

  const emp = data.employee
  const att = data.attendance || []
  const rewards = data.rewards || []
  const adjustments = data.adjustments || []
  const salaries = data.salaries || []
  const dailyStatus = data.daily_status || []
  const daysThisMonth = data.days_this_month ?? 0
  const hoursThisMonth = data.hours_this_month ?? 0
  const initials = emp?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate()
  const daysInMonth = dailyStatus.length || daysInCurrentMonth
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay()
  const calendarRows = []
  let row = Array(firstDayOfWeek).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const item = dailyStatus.find((d) => d.day === day) || { day, status: null }
    row.push(item)
    if (row.length === 7) {
      calendarRows.push(row)
      row = []
    }
  }
  if (row.length) {
    while (row.length < 7) row.push(null)
    calendarRows.push(row)
  }
  const statusToClass = (status, day) => {
    const isSunday = day != null && new Date(currentYear, currentMonth - 1, day).getDay() === 0
    if (isSunday) return 'sunday'
    if (!status) return 'none'
    if (status === 'Present') return 'present'
    if (status === 'Absent') return 'absent'
    if (status === 'Half-Day') return 'halfday'
    if (status === 'FD' || status === 'Early-Left' || status === 'Early Left') return 'earlyleft'
    return 'none'
  }
  const monthName = new Date(2000, currentMonth - 1).toLocaleString('default', { month: 'long' })

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
      {/* Top grid: Name + Shift (left) | Calendar (right) */}
      <div className="profileTopGrid">
        <div className="profileNameSection card">
          <div className="profileHeader">
            <div className="profileAvatar">{initials}</div>
            <div className="profileHeaderInfo">
              <h2>{emp?.name}</h2>
              <span className="profileCode">{emp?.emp_code}</span>
              <span className="profileStatusWrap">
                <span className={`profileStatus ${emp?.status === 'Active' ? 'profileStatusActive' : emp?.status === 'Inactive' ? 'profileStatusInactive' : 'profileStatusOther'}`}>
                  {emp?.status}
                </span>
                <select
                  className="profileStatusSelect"
                  value={emp?.status || ''}
                  disabled={statusUpdating}
                  onChange={(e) => {
                    const newStatus = e.target.value
                    if (!emp?.id || newStatus === emp?.status) return
                    setStatusUpdating(true)
                    employees.update(emp.id, { status: newStatus })
                      .then(() => {
                        setData((d) => d ? { ...d, employee: { ...d.employee, status: newStatus } } : d)
                      })
                      .catch(() => {})
                      .finally(() => setStatusUpdating(false))
                    }}
                  title="Update employee status"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </span>
            </div>
          </div>

          {/* Shift info directly under name */}
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
        </div>

        <div className="profileCalendarCard card">
          <h3 className="profileCalendarTitle">This month — {monthName} {currentYear}</h3>
          <div className="profileCalendar">
            <div className="profileCalendarWeekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <span key={d} className="profileCalendarWeekday">{d}</span>
              ))}
            </div>
            {calendarRows.map((week, wi) => (
              <div key={wi} className="profileCalendarRow">
                {week.map((cell, ci) => (
                  <div key={ci} className={`profileCalendarCell ${cell ? statusToClass(cell.status, cell.day) : 'empty'}`} title={cell ? `${cell.day}: ${cell.status || 'No record'}` : ''}>
                    {cell ? cell.day : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="profileCalendarLegend">
            <span className="profileLegendItem present">Present</span>
            <span className="profileLegendItem absent">Absent</span>
            <span className="profileLegendItem halfday">Half day</span>
            <span className="profileLegendItem earlyleft">Early left</span>
            <span className="profileLegendItem sunday">Sunday</span>
            <span className="profileLegendItem none">No record</span>
          </div>
          <div className="profileCalendarStats">
            <div className="profileStatItem">
              <span className="profileStatValue">{daysThisMonth}</span>
              <span className="profileStatLabel">Days came</span>
            </div>
            <div className="profileStatItem">
              <span className="profileStatValue">{hoursThisMonth}h</span>
              <span className="profileStatLabel">Hours this month</span>
            </div>
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
          <DetailItem label="Per hour salary" value={emp?.base_salary != null ? formatCurrency(perHourSalary(emp?.base_salary, emp?.salary_type)) : null} empty className="highlight" />
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
            <tr><th>Month</th><th>Year</th><th>Base</th><th>OT Hrs</th><th>Bonus</th><th>Advance</th><th>Gross</th><th>Net Pay</th></tr>
          </thead>
          <tbody>
            {salaries.map((row) => (
              <tr key={row.id}>
                <td>{row.month}</td>
                <td>{row.year}</td>
                <td>{formatCurrency(row.base_salary)}</td>
                <td>{Number(row.overtime_hours || 0).toFixed(2)}</td>
                <td>{formatCurrency(row.bonus)}</td>
                <td>{formatCurrency(row.advance_total)}</td>
                <td>{formatCurrency(row.gross_salary)}</td>
                <td>{formatCurrency(row.net_pay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
