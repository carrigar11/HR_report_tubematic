import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { employees } from '../api'
import './Table.css'
import './EmployeeMaster.css'

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatJoined = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return `${dt.getDate()} ${monthNames[dt.getMonth() + 1]} ${dt.getFullYear()}`
}

export default function EmployeeMaster() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [designationFilter, setDesignationFilter] = useState('')
  const [shiftFilter, setShiftFilter] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [salaryTypeFilter, setSalaryTypeFilter] = useState('')
  const [joinedMonthFilter, setJoinedMonthFilter] = useState('')
  const [joinedYearFilter, setJoinedYearFilter] = useState('')
  const [sortBy, setSortBy] = useState('emp_code_asc') // emp_code_asc | emp_code_desc | monthly_hrs_desc | monthly_hrs_asc

  // Filter options from backend
  const [filterOptions, setFilterOptions] = useState({
    departments: [],
    designations: [],
    shifts: [],
    genders: [],
    join_years: [],
  })

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Fetch filter options once
  useEffect(() => {
    employees.list({ include_filters: 'true' })
      .then((r) => {
        const d = r.data
        if (d.filters) setFilterOptions(d.filters)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = { include_filters: 'false' }
    if (statusFilter) params.status = statusFilter
    if (searchDebounced) params.search = searchDebounced
    if (deptFilter) params.department = deptFilter
    if (designationFilter) params.designation = designationFilter
    if (shiftFilter) params.shift = shiftFilter
    if (genderFilter) params.gender = genderFilter
    if (salaryTypeFilter) params.salary_type = salaryTypeFilter
    if (joinedMonthFilter) params.joined_month = joinedMonthFilter
    if (joinedYearFilter) params.joined_year = joinedYearFilter
    employees.list(params)
      .then((r) => {
        const d = r.data
        setList(d.results ?? d ?? [])
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [statusFilter, searchDebounced, deptFilter, designationFilter, shiftFilter, genderFilter, salaryTypeFilter, joinedMonthFilter, joinedYearFilter])

  const hasFilters = statusFilter || deptFilter || designationFilter || shiftFilter || genderFilter || salaryTypeFilter || joinedMonthFilter || joinedYearFilter
  const sortedList = (() => {
    const arr = Array.isArray(list) ? [...list] : []
    if (sortBy === 'emp_code_asc') return arr.sort((a, b) => (a.emp_code || '').localeCompare(b.emp_code || ''))
    if (sortBy === 'emp_code_desc') return arr.sort((a, b) => (b.emp_code || '').localeCompare(a.emp_code || ''))
    if (sortBy === 'monthly_hrs_desc') return arr.sort((a, b) => (parseFloat(b.month_hours) || 0) - (parseFloat(a.month_hours) || 0))
    if (sortBy === 'monthly_hrs_asc') return arr.sort((a, b) => (parseFloat(a.month_hours) || 0) - (parseFloat(b.month_hours) || 0))
    return arr
  })()

  const clearFilters = () => {
    setStatusFilter('')
    setDeptFilter('')
    setDesignationFilter('')
    setShiftFilter('')
    setGenderFilter('')
    setSalaryTypeFilter('')
    setJoinedMonthFilter('')
    setJoinedYearFilter('')
  }

  return (
    <div className="pageContent">
      {/* Filter Bar */}
      <div className="card filterCard">
        <div className="filterBar">
          <div className="filterGroup searchInput">
            <label className="label">Search</label>
            <input
              type="text"
              className="input"
              placeholder="Emp code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filterGroup">
            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive (Left)</option>
              <option value="Week off">Week off</option>
              <option value="Holiday">Holiday</option>
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Department</label>
            <select className="input" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">All</option>
              {filterOptions.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Designation</label>
            <select className="input" value={designationFilter} onChange={(e) => setDesignationFilter(e.target.value)}>
              <option value="">All</option>
              {filterOptions.designations.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Shift</label>
            <select className="input" value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}>
              <option value="">All</option>
              <option value="none">Not Assigned</option>
              {filterOptions.shifts.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Gender</label>
            <select className="input" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
              <option value="">All</option>
              {filterOptions.genders.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Salary Type</label>
            <select className="input" value={salaryTypeFilter} onChange={(e) => setSalaryTypeFilter(e.target.value)}>
              <option value="">All</option>
              <option value="Monthly">Monthly</option>
              <option value="Hourly">Hourly</option>
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Joined Month</label>
            <select className="input" value={joinedMonthFilter} onChange={(e) => setJoinedMonthFilter(e.target.value)}>
              <option value="">All</option>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                <option key={m} value={m}>{monthNames[m]}</option>
              ))}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Joined Year</label>
            <select className="input" value={joinedYearFilter} onChange={(e) => setJoinedYearFilter(e.target.value)}>
              <option value="">All</option>
              {(filterOptions.join_years || []).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Sort by</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="emp_code_asc">Emp Code (A → Z)</option>
              <option value="emp_code_desc">Emp Code (Z → A)</option>
              <option value="monthly_hrs_desc">Monthly Hrs (High → Low)</option>
              <option value="monthly_hrs_asc">Monthly Hrs (Low → High)</option>
            </select>
          </div>
          {hasFilters && (
            <div className="filterGroup" style={{ alignSelf: 'flex-end' }}>
              <button className="empClearBtn" onClick={clearFilters}>Clear Filters</button>
            </div>
          )}
        </div>
      </div>

      {/* Count badge */}
      {!loading && (
        <div className="empCountBar">
          <span className="empCountBadge">{sortedList.length} employees</span>
        </div>
      )}

      {/* Table */}
      <div className="card tableCard">
        {loading ? (
          <p className="muted">Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Emp Code</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Monthly Hrs</th>
                <th>Joined</th>
                <th>Shift</th>
                <th>Dept</th>
                <th>Designation</th>
                <th>Status</th>
                <th>Profile</th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((row) => (
                <tr key={row.id}>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                  <td>{row.name || '—'}</td>
                  <td>{row.mobile || '—'}</td>
                  <td>{row.email || '—'}</td>
                  <td>
                    <div className="empHoursCell">
                      <span className="empHoursVal">{Number(row.month_hours || 0).toFixed(1)}h</span>
                      {(row.month_days || 0) > 0 && (
                        <span className="empHoursDays">{row.month_days}d</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="empJoined">{formatJoined(row.created_at)}</span>
                  </td>
                  <td>
                    {row.shift ? (
                      <div className="empShiftCell">
                        <span className="empShiftName">{row.shift}</span>
                        {row.shift_from && row.shift_to && (
                          <span className="empShiftTime">{String(row.shift_from).slice(0,5)} – {String(row.shift_to).slice(0,5)}</span>
                        )}
                      </div>
                    ) : (
                      <span className="empShiftNone">Not assigned</span>
                    )}
                  </td>
                  <td>{row.dept_name || '—'}</td>
                  <td>{row.designation || '—'}</td>
                  <td><span className={`badge badge-${row.status === 'Active' ? 'success' : row.status === 'Inactive' ? 'warn' : row.status === 'Week off' ? 'info' : 'neutral'}`}>{row.status}</span></td>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && sortedList.length === 0 && (
          <p className="muted">No employees match your filters.</p>
        )}
      </div>
    </div>
  )
}
