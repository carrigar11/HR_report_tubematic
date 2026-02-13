import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { salary } from '../api'
import './Table.css'
import './SalaryReport.css'

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function SalaryReport() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setLoading(true)
    salary.monthly(month, year, searchDebounced || undefined)
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [month, year, searchDebounced])

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
        </div>
      </div>
      <div className="card tableCard">
        {loading ? (
          <p className="muted">Loading...</p>
        ) : (
          <table className="salTable">
            <thead>
              <tr>
                <th>Period</th>
                <th>Emp Code</th>
                <th>Name</th>
                <th>Salary Type</th>
                <th>Base Salary</th>
                <th>Days Present</th>
                <th>Today's Hrs</th>
                <th>Total Monthly Hrs</th>
                <th>Overtime Hrs</th>
                <th>Bonus</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id}>
                  <td>{monthNames[row.month]} {row.year}</td>
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
