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

const defaultNewEmployee = () => ({
  emp_code: '',
  name: '',
  mobile: '',
  email: '',
  password: '',
  gender: '',
  dept_name: '',
  designation: '',
  status: 'Active',
  employment_type: 'Full-time',
  salary_type: 'Monthly',
  base_salary: '',
  shift: '',
  shift_from: '',
  shift_to: '',
  casual_allowance_per_year: '',
  sick_allowance_per_year: '',
  earned_allowance_per_year: '',
})

export default function EmployeeMaster() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  // Add employee modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState(defaultNewEmployee())
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

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

  const openAddModal = () => {
    setAddForm(defaultNewEmployee())
    setAddError('')
    setAddModalOpen(true)
    employees.getNextEmpCode()
      .then((r) => {
        const next = r.data?.next_emp_code
        if (next) setAddForm((f) => ({ ...f, emp_code: next }))
      })
      .catch(() => {})
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    const emp_code = (addForm.emp_code || '').trim()
    const name = (addForm.name || '').trim()
    if (!emp_code || !name) {
      setAddError('Emp code and name are required.')
      return
    }
    setAddSaving(true)
    setAddError('')
    try {
      const payload = {
        emp_code,
        name,
        mobile: (addForm.mobile || '').trim() || null,
        email: (addForm.email || '').trim() || null,
        gender: (addForm.gender || '').trim() || null,
        dept_name: (addForm.dept_name || '').trim() || null,
        designation: (addForm.designation || '').trim() || null,
        status: addForm.status || 'Active',
        employment_type: addForm.employment_type || 'Full-time',
        salary_type: addForm.salary_type || 'Monthly',
        shift: (addForm.shift || '').trim() || null,
      }
      if (addForm.base_salary !== '' && addForm.base_salary != null) {
        const num = parseFloat(addForm.base_salary)
        if (!isNaN(num)) payload.base_salary = num
      }
      if ((addForm.shift_from || '').trim()) payload.shift_from = addForm.shift_from.trim()
      if ((addForm.shift_to || '').trim()) payload.shift_to = addForm.shift_to.trim()
      const casualVal = addForm.casual_allowance_per_year
      const sickVal = addForm.sick_allowance_per_year
      const earnedVal = addForm.earned_allowance_per_year
      if (casualVal !== '' && casualVal != null) { const n = parseInt(casualVal, 10); if (!isNaN(n) && n >= 0) payload.casual_allowance_per_year = n }
      if (sickVal !== '' && sickVal != null) { const n = parseInt(sickVal, 10); if (!isNaN(n) && n >= 0) payload.sick_allowance_per_year = n }
      if (earnedVal !== '' && earnedVal != null) { const n = parseInt(earnedVal, 10); if (!isNaN(n) && n >= 0) payload.earned_allowance_per_year = n }
      const pwd = (addForm.password || '').trim()
      if (pwd) payload.password = pwd
      await employees.create(payload)
      setAddModalOpen(false)
      setAddForm(defaultNewEmployee())
      // Refresh list (re-fetch with current params)
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
      const r = await employees.list(params)
      setList(r.data.results ?? r.data ?? [])
    } catch (err) {
      const msg = err.response?.data?.emp_code?.[0] || err.response?.data?.name?.[0] || err.response?.data?.detail || (typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : err.message) || 'Failed to add employee'
      setAddError(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setAddSaving(false)
    }
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
              {((filterOptions.genders && filterOptions.genders.length) ? filterOptions.genders : ['Male', 'Female', 'Other']).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
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

      {/* Count badge + Add employee */}
      {!loading && (
        <div className="empCountBar">
          <span className="empCountBadge">{sortedList.length} employees</span>
          <button type="button" className="btn btn-primary empAddBtn" onClick={openAddModal}>
            Add employee
          </button>
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

      {/* Add employee modal */}
      {addModalOpen && (
        <div className="empModalOverlay" onClick={() => !addSaving && setAddModalOpen(false)}>
          <div className="empModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="empModalHeader">
              <h3 className="empModalTitle">Add new employee</h3>
              <button type="button" className="empModalClose" onClick={() => !addSaving && setAddModalOpen(false)} aria-label="Close">&times;</button>
            </div>
            <form onSubmit={handleAddSubmit} className="empModalForm">
              <div className="empModalSection">
                <h4 className="empModalSectionTitle">Basic info</h4>
                <div className="empModalGrid">
                  <div className="profileField">
                    <label className="label">Emp Code <span className="required">*</span></label>
                    <input type="text" className="input" value={addForm.emp_code} onChange={(e) => setAddForm((f) => ({ ...f, emp_code: e.target.value }))} placeholder="Auto-generated (e.g. 380)" required title="Auto-generated number; you can change it if needed" />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Auto-generated number (380, 381…). Edit if needed.</span>
                  </div>
                  <div className="profileField">
                    <label className="label">Name <span className="required">*</span></label>
                    <input type="text" className="input" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" required />
                  </div>
                  <div className="profileField">
                    <label className="label">Mobile</label>
                    <input type="text" className="input" value={addForm.mobile} onChange={(e) => setAddForm((f) => ({ ...f, mobile: e.target.value }))} placeholder="Phone" />
                  </div>
                  <div className="profileField">
                    <label className="label">Email</label>
                    <input type="email" className="input" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
                  </div>
                  <div className="profileField" style={{ gridColumn: '1 / -1' }}>
                    <label className="label">Password (employee portal)</label>
                    <input type="password" className="input" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leave blank to disable login" autoComplete="new-password" />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Optional. Used for employee portal login.</span>
                  </div>
                </div>
              </div>
              <div className="empModalSection">
                <h4 className="empModalSectionTitle">Work details</h4>
                <div className="empModalGrid">
                  <div className="profileField" style={{ gridColumn: '1 / -1' }}>
                    <label className="label">Department</label>
                    <input type="text" className="input" value={addForm.dept_name} onChange={(e) => setAddForm((f) => ({ ...f, dept_name: e.target.value }))} placeholder="Department" list="empDeptList" />
                    <datalist id="empDeptList">
                      {filterOptions.departments.map((d) => <option key={d} value={d} />)}
                    </datalist>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Type a new name to create a new department.</span>
                  </div>
                  <div className="profileField">
                    <label className="label">Designation</label>
                    <input type="text" className="input" value={addForm.designation} onChange={(e) => setAddForm((f) => ({ ...f, designation: e.target.value }))} placeholder="Designation" list="empDesigList" />
                    <datalist id="empDesigList">
                      {filterOptions.designations.map((d) => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  <div className="profileField">
                    <label className="label">Gender</label>
                    <select className="input" value={addForm.gender} onChange={(e) => setAddForm((f) => ({ ...f, gender: e.target.value }))}>
                      <option value="">—</option>
                      {['Male', 'Female', 'Other'].map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="profileField">
                    <label className="label">Status</label>
                    <select className="input" value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Week off">Week off</option>
                      <option value="Holiday">Holiday</option>
                    </select>
                  </div>
                  <div className="profileField">
                    <label className="label">Employment type</label>
                    <select className="input" value={addForm.employment_type} onChange={(e) => setAddForm((f) => ({ ...f, employment_type: e.target.value }))}>
                      <option value="Full-time">Full-time</option>
                      <option value="Hourly">Hourly</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="empModalSection">
                <h4 className="empModalSectionTitle">Salary & shift</h4>
                <div className="empModalGrid">
                  <div className="profileField">
                    <label className="label">Salary type</label>
                    <select className="input" value={addForm.salary_type} onChange={(e) => setAddForm((f) => ({ ...f, salary_type: e.target.value }))}>
                      <option value="Monthly">Monthly</option>
                      <option value="Hourly">Hourly</option>
                      <option value="Fixed">Fixed</option>
                    </select>
                  </div>
                  <div className="profileField">
                    <label className="label">Base salary</label>
                    <input type="number" className="input" step="0.01" min="0" value={addForm.base_salary} onChange={(e) => setAddForm((f) => ({ ...f, base_salary: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="profileField">
                    <label className="label">Shift name</label>
                    <input type="text" className="input" value={addForm.shift} onChange={(e) => setAddForm((f) => ({ ...f, shift: e.target.value }))} placeholder="e.g. General Shift" list="empShiftList" />
                    <datalist id="empShiftList">
                      {filterOptions.shifts.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                  <div className="profileField">
                    <label className="label">Shift from</label>
                    <input type="time" className="input" value={addForm.shift_from} onChange={(e) => setAddForm((f) => ({ ...f, shift_from: e.target.value }))} />
                  </div>
                  <div className="profileField">
                    <label className="label">Shift to</label>
                    <input type="time" className="input" value={addForm.shift_to} onChange={(e) => setAddForm((f) => ({ ...f, shift_to: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="empModalSection">
                <h4 className="empModalSectionTitle">Leave allowances (optional)</h4>
                <div className="empModalGrid">
                  <div className="profileField">
                    <label className="label">Casual leave per year</label>
                    <input type="number" className="input" min="0" max="99" value={addForm.casual_allowance_per_year} onChange={(e) => setAddForm((f) => ({ ...f, casual_allowance_per_year: e.target.value }))} placeholder="e.g. 12" />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Days. Leave blank for system default.</span>
                  </div>
                  <div className="profileField">
                    <label className="label">Sick leave per year</label>
                    <input type="number" className="input" min="0" max="99" value={addForm.sick_allowance_per_year} onChange={(e) => setAddForm((f) => ({ ...f, sick_allowance_per_year: e.target.value }))} placeholder="e.g. 6" />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Days. Leave blank for system default.</span>
                  </div>
                  <div className="profileField">
                    <label className="label">Earned leave per year</label>
                    <input type="number" className="input" min="0" max="99" value={addForm.earned_allowance_per_year} onChange={(e) => setAddForm((f) => ({ ...f, earned_allowance_per_year: e.target.value }))} placeholder="e.g. 0" />
                    <span className="muted" style={{ fontSize: '0.85rem' }}>Days. Leave blank for system default.</span>
                  </div>
                </div>
              </div>
              {addError && <p className="empModalError">{addError}</p>}
              <div className="empModalActions">
                <button type="button" className="btn btn-secondary" onClick={() => !addSaving && setAddModalOpen(false)} disabled={addSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={addSaving}>{addSaving ? 'Saving…' : 'Add employee'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
