import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { employee } from '../../api'
import './Dashboard.css'

function formatHoursMinutes(totalHours) {
  if (totalHours == null || totalHours === 0) return { h: 0, m: 0, str: '0h 0m' }
  const h = Math.floor(totalHours)
  const m = Math.round((totalHours - h) * 60)
  if (m === 60) return { h: h + 1, m: 0, str: `${h + 1}h 0m` }
  return { h, m, str: `${h}h ${m}m` }
}

/** Parse "HH:mm" or "HH:mm:ss" to decimal hours since midnight */
function timeStringToHours(str) {
  if (!str || typeof str !== 'string') return null
  const parts = str.trim().split(':').map(Number)
  if (parts.length < 2) return null
  const [h, m, s] = [parts[0], parts[1] || 0, parts[2] || 0]
  return h + m / 60 + s / 3600
}

/** Live hours from punch_in time to now (or to punch_out). All in local time. */
function getLiveHoursToday(punchInStr, punchOutStr) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const nowHours = (now.getTime() - todayStart.getTime()) / (1000 * 60 * 60)
  const inHours = timeStringToHours(punchInStr)
  if (inHours == null) return null
  if (punchOutStr) {
    const outHours = timeStringToHours(punchOutStr)
    if (outHours != null) return Math.max(0, outHours - inHours)
  }
  return Math.max(0, nowHours - inHours)
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getEmployeeName() {
  try {
    const stored = localStorage.getItem('hr_employee')
    if (stored) {
      const o = JSON.parse(stored)
      return o.name || 'there'
    }
  } catch (_) {}
  return 'there'
}

export default function EmployeeDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [leaveRequests, setLeaveRequests] = useState([])

  useEffect(() => {
    employee.dashboard()
      .then((r) => setData(r.data))
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!loading && data) {
      employee.leaveRequests.list()
        .then((r) => setLeaveRequests(Array.isArray(r.data) ? r.data : []))
        .catch(() => setLeaveRequests([]))
    }
  }, [loading, data])

  const punchInStr = data?.today_punch_in ?? null
  const punchOutStr = data?.today_punch_out ?? null
  const isLive = punchInStr && !punchOutStr
  const [liveTick, setLiveTick] = useState(0)
  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => setLiveTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [isLive])

  const liveHoursToday = useMemo(() => {
    if (isLive) return getLiveHoursToday(punchInStr, punchOutStr)
    return null
  }, [isLive, punchInStr, punchOutStr, liveTick])

  if (loading) return <p className="empDashLoading">Loading…</p>
  if (error || !data) return <p className="empDashError">{error || 'No data'}</p>

  const todayHours = liveHoursToday != null ? liveHoursToday : (data.hours_today ?? 0)
  const todayTime = formatHoursMinutes(todayHours)
  const dailyStatus = data.daily_status || []
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
  const pendingLeave = leaveRequests.filter((r) => r.status === 'Pending').length

  return (
    <div className="employeeDashboardPage">
      {/* Greeting */}
      <div className="empDashGreeting">
        <h2 className="empDashGreetingText">{getGreeting()}, {getEmployeeName()}</h2>
      </div>

      {/* Top grid: Today's work time (left) + Calendar (right) */}
      <div className="empDashTopGrid">
        <section className="empDashHero card">
          <p className="empDashHeroLabel">Today&apos;s work time</p>
          <div className="empDashHeroTime">
            <span className="empDashHeroHours">{todayTime.h}</span>
            <span className="empDashHeroUnit">h</span>
            <span className="empDashHeroMinutes">{todayTime.m}</span>
            <span className="empDashHeroUnit">m</span>
          </div>
          <p className="empDashHeroSub">
            {isLive ? 'Live from punch in' : 'Total hours logged today'}
          </p>
        </section>

        <section className="empDashCalendarSection card">
          <h3 className="empDashSectionTitle">This month — {monthName} {currentYear}</h3>
          <div className="empDashCalendar">
            <div className="empDashCalendarWeekdays">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <span key={d} className="empDashCalendarWeekday">{d}</span>
              ))}
            </div>
            {calendarRows.map((week, wi) => (
              <div key={wi} className="empDashCalendarRow">
                {week.map((cell, ci) => (
                  <div key={ci} className={`empDashCalendarCell ${cell ? statusToClass(cell.status, cell.day) : 'empty'}`} title={cell ? `${cell.day}: ${cell.status || 'No record'}` : ''}>
                    {cell ? cell.day : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="empDashCalendarLegend">
            <span className="empDashLegendItem present">Present</span>
            <span className="empDashLegendItem absent">Absent</span>
            <span className="empDashLegendItem halfday">Half day</span>
            <span className="empDashLegendItem earlyleft">Early left</span>
            <span className="empDashLegendItem sunday">Sunday</span>
            <span className="empDashLegendItem none">No record</span>
          </div>
        </section>
      </div>

      {/* Leave requests & Penalty shortcuts */}
      <section className="empDashSection empDashAlertsRow">
        <div className="empDashAlertCard card">
          <div className="empDashAlertContent">
            <span className="empDashAlertLabel">Leave requests</span>
            <span className="empDashAlertValue">{pendingLeave} pending</span>
            <Link to="/employee/holiday-request" className="empDashAlertLink">View / request leave →</Link>
          </div>
        </div>
        <Link to="/employee/penalty" className="empDashAlertCard card empDashAlertCardLink">
          <div className="empDashAlertContent">
            <span className="empDashAlertLabel">Penalties</span>
            <span className="empDashAlertValue">View details</span>
            <span className="empDashAlertLink">Go to Penalty →</span>
          </div>
        </Link>
      </section>

      {/* Stats cards */}
      <section className="empDashSection">
        <h3 className="empDashSectionTitle">This month</h3>
        <div className="dashboardCards">
          <div className="card dashboardCard">
            <p className="dashboardCardValue">{data.days_this_month}</p>
            <p className="dashboardCardLabel">Days worked</p>
          </div>
          <div className="card dashboardCard">
            <p className="dashboardCardValue">{data.hours_this_month} <span className="unit">h</span></p>
            <p className="dashboardCardLabel">Working hours</p>
          </div>
          <div className="card dashboardCard">
            <p className="dashboardCardValue">{data.bonus_hours_this_month} <span className="unit">h</span></p>
            <p className="dashboardCardLabel">Bonus hours <span className="muted">(₹ {data.bonus_rs_this_month})</span></p>
          </div>
        </div>
      </section>

      <section className="empDashSection">
        <h3 className="empDashSectionTitle">From joining</h3>
        <div className="dashboardCards">
          <div className="card dashboardCard">
            <p className="dashboardCardValue">{data.total_hours_all} <span className="unit">h</span></p>
            <p className="dashboardCardLabel">Total working hours</p>
          </div>
          <div className="card dashboardCard">
            <p className="dashboardCardValue">{data.bonus_hours_all} <span className="unit">h</span></p>
            <p className="dashboardCardLabel">Total bonus <span className="muted">(₹ {data.bonus_rs_all})</span></p>
          </div>
        </div>
      </section>
    </div>
  )
}
