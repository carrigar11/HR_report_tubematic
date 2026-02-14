import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { salary, advance as advanceApi } from '../api'
import './Table.css'
import './SalaryReport.css'

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SORT_OPTIONS = [
  { value: 'emp_code_asc', label: 'Emp Code (A → Z)' },
  { value: 'emp_code_desc', label: 'Emp Code (Z → A)' },
  { value: 'today_hrs_desc', label: "Today's Hrs (High → Low)" },
  { value: 'today_hrs_asc', label: "Today's Hrs (Low → High)" },
  { value: 'total_hrs_desc', label: 'Total Hrs (High → Low)' },
  { value: 'total_hrs_asc', label: 'Total Hrs (Low → High)' },
  { value: 'ot_desc', label: 'OT (High → Low)' },
  { value: 'ot_asc', label: 'OT (Low → High)' },
  { value: 'advance_desc', label: 'Advance (High → Low)' },
  { value: 'advance_asc', label: 'Advance (Low → High)' },
  { value: 'net_desc', label: 'Net Pay (High → Low)' },
  { value: 'net_asc', label: 'Net Pay (Low → High)' },
]

export default function SalaryReport() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState('emp_code_asc')
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [advanceEmpCode, setAdvanceEmpCode] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceNote, setAdvanceNote] = useState('')
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false)
  const [advanceError, setAdvanceError] = useState('')
  const [advanceSuccess, setAdvanceSuccess] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchList = () => {
    setLoading(true)
    salary.monthly(month, year, searchDebounced || undefined)
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList()
  }, [month, year, searchDebounced])

  const sortedList = (() => {
    const arr = Array.isArray(list) ? [...list] : []
    const num = (v) => parseFloat(v) || 0
    if (sortBy === 'emp_code_asc') return arr.sort((a, b) => (a.emp_code || '').localeCompare(b.emp_code || ''))
    if (sortBy === 'emp_code_desc') return arr.sort((a, b) => (b.emp_code || '').localeCompare(a.emp_code || ''))
    if (sortBy === 'today_hrs_desc') return arr.sort((a, b) => num(b.today_hours) - num(a.today_hours))
    if (sortBy === 'today_hrs_asc') return arr.sort((a, b) => num(a.today_hours) - num(b.today_hours))
    if (sortBy === 'total_hrs_desc') return arr.sort((a, b) => num(b.total_working_hours) - num(a.total_working_hours))
    if (sortBy === 'total_hrs_asc') return arr.sort((a, b) => num(a.total_working_hours) - num(b.total_working_hours))
    if (sortBy === 'ot_desc') return arr.sort((a, b) => num(b.overtime_hours) - num(a.overtime_hours))
    if (sortBy === 'ot_asc') return arr.sort((a, b) => num(a.overtime_hours) - num(b.overtime_hours))
    if (sortBy === 'advance_desc') return arr.sort((a, b) => num(b.advance_total) - num(a.advance_total))
    if (sortBy === 'advance_asc') return arr.sort((a, b) => num(a.advance_total) - num(b.advance_total))
    if (sortBy === 'net_desc') return arr.sort((a, b) => num(b.net_pay) - num(a.net_pay))
    if (sortBy === 'net_asc') return arr.sort((a, b) => num(a.net_pay) - num(b.net_pay))
    return arr
  })()

  const handleAddAdvance = (e) => {
    e.preventDefault()
    setAdvanceError('')
    setAdvanceSuccess('')
    const emp = advanceEmpCode.trim()
    const amt = parseFloat(advanceAmount)
    if (!emp) {
      setAdvanceError('Select an employee')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setAdvanceError('Enter a valid amount')
      return
    }
    setAdvanceSubmitting(true)
    advanceApi.create({
      emp_code: emp,
      amount: amt,
      month,
      year,
      note: advanceNote.trim() || undefined,
      date_given: new Date().toISOString().slice(0, 10),
    })
      .then(() => {
        setAdvanceSuccess('Advance recorded.')
        setAdvanceEmpCode('')
        setAdvanceAmount('')
        setAdvanceNote('')
        fetchList()
        setTimeout(() => { setShowAdvanceModal(false); setAdvanceSuccess('') }, 1200)
      })
      .catch((err) => setAdvanceError(err.response?.data?.error || err.message || 'Failed to save'))
      .finally(() => setAdvanceSubmitting(false))
  }

  const periodLabel = `${monthNames[month]} ${year}`

  return (
    <div className="pageContent">
      <div className="card filterCard">
        <div className="filterBar">
          <div className="filterGroup">
            <label className="label">Month</label>
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ minWidth: 100 }}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                <option key={m} value={m}>{monthNames[m]} ({m})</option>
              ))}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Year</label>
            <input type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2030} style={{ width: 100 }} />
          </div>
          <div className="filterGroup searchInput">
            <label className="label">Search by Emp Code or Name</label>
            <input
              type="text"
              className="input"
              placeholder="Type emp code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 200 }}
            />
          </div>
          <div className="filterGroup">
            <label className="label">Sort by</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ minWidth: 180 }}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="filterGroup">
            <button type="button" className="btn btn-primary" onClick={() => setShowAdvanceModal(true)}>
              Add Advance
            </button>
          </div>
        </div>
      </div>

      {showAdvanceModal && (
        <div className="salModalOverlay" onClick={() => !advanceSubmitting && setShowAdvanceModal(false)}>
          <div className="salModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="salModalTitle">Add Advance ({periodLabel})</h3>
            <p className="salModalDesc">Advance will be deducted from this month&apos;s salary.</p>
            <form onSubmit={handleAddAdvance}>
              <div className="salModalField">
                <label className="label">Employee</label>
                <select className="input" value={advanceEmpCode} onChange={(e) => setAdvanceEmpCode(e.target.value)} required>
                  <option value="">Select employee</option>
                  {sortedList.map((row) => (
                    <option key={row.emp_code} value={row.emp_code}>{row.emp_code} – {row.name}</option>
                  ))}
                </select>
              </div>
              <div className="salModalField">
                <label className="label">Amount</label>
                <input type="number" className="input" step="0.01" min="0.01" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0.00" required />
                {advanceEmpCode && (() => {
                  const row = sortedList.find((r) => r.emp_code === advanceEmpCode)
                  return row && row.earned_so_far != null ? (
                    <p className="salModalEarnedSoFar">Earned so far this month: <strong>{Number(row.earned_so_far).toFixed(2)}</strong> (from hours worked)</p>
                  ) : null
                })()}
              </div>
              <div className="salModalField">
                <label className="label">Note (optional)</label>
                <input type="text" className="input" value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} placeholder="e.g. Advance for March" />
              </div>
              {advanceError && <p className="salModalError">{advanceError}</p>}
              {advanceSuccess && <p className="salModalSuccess">{advanceSuccess}</p>}
              <div className="salModalActions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdvanceModal(false)} disabled={advanceSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={advanceSubmitting}>{advanceSubmitting ? 'Saving…' : 'Save Advance'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="card tableCard">
        <div className="salPeriodHeader">
          <span className="salPeriodLabel">Period</span>
          <span className="salPeriodValue">{periodLabel}</span>
        </div>
        {loading ? (
          <p className="muted">Loading...</p>
        ) : (
          <table className="salTable">
            <thead>
              <tr>
                <th>Emp Code</th>
                <th>Name</th>
                <th>Salary Type</th>
                <th>Base Salary</th>
                <th>Days Present</th>
                <th>Today's Hrs</th>
                <th>Total Monthly Hrs</th>
                <th>Overtime Hrs</th>
                <th>Bonus</th>
                <th>Earned so far</th>
                <th>Advance</th>
                <th>Gross</th>
                <th>Net Pay</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((row) => (
                <tr key={row.id}>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                  <td>{row.name || '—'}</td>
                  <td>{row.salary_type}</td>
                  <td>{Number(row.base_salary || 0).toFixed(2)}</td>
                  <td>{row.days_present ?? 0}</td>
                  <td>
                    <span className={`salTodayHrs ${!row.today_punch_out && row.today_punch_in ? 'salLive' : ''}`}>
                      {Number(row.today_hours || 0).toFixed(2)}
                      {!row.today_punch_out && row.today_punch_in ? ' *' : ''}
                    </span>
                  </td>
                  <td>{Number(row.total_working_hours || 0).toFixed(2)}</td>
                  <td>{Number(row.overtime_hours || 0).toFixed(2)}</td>
                  <td>{Number(row.bonus || 0).toFixed(2)}</td>
                  <td title="From hours worked (1st of month to today)">{Number(row.earned_so_far || 0).toFixed(2)}</td>
                  <td>{Number(row.advance_total || 0).toFixed(2)}</td>
                  <td>{Number(row.gross_salary || 0).toFixed(2)}</td>
                  <td className="salNetPay">{Number(row.net_pay || 0).toFixed(2)}</td>
                  <td>
                    <Link to={`/employees/${row.emp_code}/profile`} className="salViewBtn">
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && list.length === 0 && <p className="muted">No salary data for this period.</p>}
      </div>
    </div>
  )
}
