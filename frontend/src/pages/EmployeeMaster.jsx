import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { employees } from '../api'
import './Table.css'

export default function EmployeeMaster() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setLoading(true)
    const params = {}
    if (statusFilter) params.status = statusFilter
    if (searchDebounced) params.search = searchDebounced
    employees.list(params)
      .then((r) => setList(r.data.results ?? r.data ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [statusFilter, searchDebounced])

  return (
    <div className="pageContent">
      <div className="card filterCard">
        <div className="filterBar">
          <div className="filterGroup searchInput">
            <label className="label">Search by Emp Code or Name</label>
            <input
              type="text"
              className="input"
              placeholder="Type emp code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filterGroup">
            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 140 }}>
              <option value="">All</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>
      <div className="card tableCard">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Emp Code</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Email</th>
                <th>Dept</th>
                <th>Designation</th>
                <th>Status</th>
                <th>Type</th>
                <th>Salary Type</th>
                <th>Profile</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(list) ? list : []).map((row) => (
                <tr key={row.id}>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                  <td>{row.name || '—'}</td>
                  <td>{row.mobile || '—'}</td>
                  <td>{row.email || '—'}</td>
                  <td>{row.dept_name || '—'}</td>
                  <td>{row.designation || '—'}</td>
                  <td><span className={`badge badge-${row.status === 'Active' ? 'success' : 'warn'}`}>{row.status}</span></td>
                  <td>{row.employment_type || '—'}</td>
                  <td>{row.salary_type || '—'}</td>
                  <td><Link to={`/employees/${row.emp_code}/profile`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && Array.isArray(list) && list.length === 0 && (
          <p className="muted">No employees match your search.</p>
        )}
      </div>
    </div>
  )
}
