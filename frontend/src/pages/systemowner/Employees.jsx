import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { systemOwner } from '../../api'
import SearchableCompanySelect from './SearchableCompanySelect'
import './SystemOwner.css'

const defaultAddForm = () => ({
  company_id: '',
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

export default function SystemOwnerEmployees() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState(defaultAddForm())
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    systemOwner.companies.list()
      .then((r) => setCompanies(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCompanies([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    systemOwner.employees.list(companyId ? { company_id: companyId } : {})
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [companyId])

  const openAddModal = () => {
    setAddForm(defaultAddForm())
    setAddError('')
    setAddModalOpen(true)
    systemOwner.employees.getNextEmpCode()
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
    const companyIdVal = addForm.company_id ? Number(addForm.company_id) : null
    if (!companyIdVal) {
      setAddError('Please select a company.')
      return
    }
    setAddSaving(true)
    setAddError('')
    try {
      const payload = {
        company_id: companyIdVal,
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
      if (casualVal !== '' && casualVal != null) {
        const n = parseInt(casualVal, 10)
        if (!isNaN(n) && n >= 0) payload.casual_allowance_per_year = n
      }
      if (sickVal !== '' && sickVal != null) {
        const n = parseInt(sickVal, 10)
        if (!isNaN(n) && n >= 0) payload.sick_allowance_per_year = n
      }
      if (earnedVal !== '' && earnedVal != null) {
        const n = parseInt(earnedVal, 10)
        if (!isNaN(n) && n >= 0) payload.earned_allowance_per_year = n
      }
      const pwd = (addForm.password || '').trim()
      if (pwd) payload.password = pwd
      await systemOwner.employees.create(payload)
      setAddModalOpen(false)
      setAddForm(defaultAddForm())
      const r = await systemOwner.employees.list(companyId ? { company_id: companyId } : {})
      setList(Array.isArray(r.data) ? r.data : [])
    } catch (err) {
      const msg =
        err.response?.data?.emp_code?.[0] ||
        err.response?.data?.name?.[0] ||
        err.response?.data?.detail ||
        (typeof err.response?.data === 'object' ? JSON.stringify(err.response.data) : err.message) ||
        'Failed to add employee'
      setAddError(Array.isArray(msg) ? msg[0] : msg)
    } finally {
      setAddSaving(false)
    }
  }

  if (error) return <div className="card"><p className="error">{error}</p></div>

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h2 className="pageSubtitle" style={{ margin: 0 }}>All employees</h2>
          <button type="button" className="btn btn-primary" onClick={openAddModal}>
            Add employee
          </button>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label className="label">Filter by company</label>
          <select className="input" style={{ maxWidth: '280px' }} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="muted">No employees.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Status</th>
                  <th>Company</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>{e.emp_code}</td>
                    <td>{e.name}</td>
                    <td>{e.dept_name || '—'}</td>
                    <td>{e.designation || '—'}</td>
                    <td>{e.status || '—'}</td>
                    <td>{e.company_name || '—'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btnSm" onClick={() => navigate(`/system-owner/employees/${e.id}`)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add employee modal */}
      {addModalOpen && (
        <div className="modalOverlay" onClick={() => !addSaving && setAddModalOpen(false)}>
          <div className="card modalContent systemOwnerAddEmployeeModal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="pageSubtitle" style={{ margin: 0 }}>Add new employee</h3>
              <button type="button" className="btn btn-secondary btnSm" onClick={() => !addSaving && setAddModalOpen(false)} aria-label="Close">Close</button>
            </div>
            <form onSubmit={handleAddSubmit} className="formStack systemOwnerAddEmployeeForm">
              <div className="addEmployeeFormColumns">
                <div>
                  <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
                    <h4 className="companyRequestViewPanelTitle">Company & basic</h4>
                    <div className="addEmployeeGrid">
                      <div className="addEmployeeFieldFull">
                        <label className="label">Company <span className="required">*</span></label>
                        <SearchableCompanySelect
                          companies={companies}
                          value={addForm.company_id ? Number(addForm.company_id) : ''}
                          onChange={(id) => setAddForm((f) => ({ ...f, company_id: id }))}
                          placeholder="Type to search company..."
                          required
                        />
                      </div>
                      <div>
                        <label className="label">Emp code <span className="required">*</span></label>
                        <input type="text" className="input" value={addForm.emp_code} onChange={(e) => setAddForm((f) => ({ ...f, emp_code: e.target.value }))} placeholder="Auto" required />
                        <span className="muted">Auto-filled; you can change it.</span>
                      </div>
                      <div>
                        <label className="label">Name <span className="required">*</span></label>
                        <input type="text" className="input" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} required />
                      </div>
                      <div>
                        <label className="label">Mobile</label>
                        <input type="text" className="input" value={addForm.mobile} onChange={(e) => setAddForm((f) => ({ ...f, mobile: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Email</label>
                        <input type="email" className="input" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                      </div>
                      <div className="addEmployeeFieldFull">
                        <label className="label">Password (employee portal)</label>
                        <input type="password" className="input" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder="Optional" autoComplete="new-password" />
                      </div>
                    </div>
                  </div>
                  <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
                    <h4 className="companyRequestViewPanelTitle">Work details</h4>
                    <div className="addEmployeeGrid">
                      <div>
                        <label className="label">Department</label>
                        <input type="text" className="input" value={addForm.dept_name} onChange={(e) => setAddForm((f) => ({ ...f, dept_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Designation</label>
                        <input type="text" className="input" value={addForm.designation} onChange={(e) => setAddForm((f) => ({ ...f, designation: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Gender</label>
                        <select className="input" value={addForm.gender} onChange={(e) => setAddForm((f) => ({ ...f, gender: e.target.value }))}>
                          <option value="">—</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Status</label>
                        <select className="input" value={addForm.status} onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value }))}>
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                          <option value="Week off">Week off</option>
                          <option value="Holiday">Holiday</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Employment type</label>
                        <select className="input" value={addForm.employment_type} onChange={(e) => setAddForm((f) => ({ ...f, employment_type: e.target.value }))}>
                          <option value="Full-time">Full-time</option>
                          <option value="Hourly">Hourly</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
                    <h4 className="companyRequestViewPanelTitle">Salary & shift</h4>
                    <div className="addEmployeeGrid">
                      <div>
                        <label className="label">Salary type</label>
                        <select className="input" value={addForm.salary_type} onChange={(e) => setAddForm((f) => ({ ...f, salary_type: e.target.value }))}>
                          <option value="Monthly">Monthly</option>
                          <option value="Hourly">Hourly</option>
                          <option value="Fixed">Fixed</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Base salary</label>
                        <input type="number" className="input" step="0.01" min="0" value={addForm.base_salary} onChange={(e) => setAddForm((f) => ({ ...f, base_salary: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <label className="label">Shift name</label>
                        <input type="text" className="input" value={addForm.shift} onChange={(e) => setAddForm((f) => ({ ...f, shift: e.target.value }))} placeholder="e.g. General Shift" />
                      </div>
                      <div>
                        <label className="label">Shift from</label>
                        <input type="time" className="input" value={addForm.shift_from} onChange={(e) => setAddForm((f) => ({ ...f, shift_from: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Shift to</label>
                        <input type="time" className="input" value={addForm.shift_to} onChange={(e) => setAddForm((f) => ({ ...f, shift_to: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                  <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
                    <h4 className="companyRequestViewPanelTitle">Leave allowances (optional)</h4>
                    <div className="addEmployeeGrid">
                      <div>
                        <label className="label">Casual / year</label>
                        <input type="number" className="input" min="0" max="99" value={addForm.casual_allowance_per_year} onChange={(e) => setAddForm((f) => ({ ...f, casual_allowance_per_year: e.target.value }))} placeholder="e.g. 12" />
                      </div>
                      <div>
                        <label className="label">Sick / year</label>
                        <input type="number" className="input" min="0" max="99" value={addForm.sick_allowance_per_year} onChange={(e) => setAddForm((f) => ({ ...f, sick_allowance_per_year: e.target.value }))} placeholder="e.g. 6" />
                      </div>
                      <div>
                        <label className="label">Earned / year</label>
                        <input type="number" className="input" min="0" max="99" value={addForm.earned_allowance_per_year} onChange={(e) => setAddForm((f) => ({ ...f, earned_allowance_per_year: e.target.value }))} placeholder="0" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {addError && <p className="error" style={{ marginBottom: '0.5rem' }}>{addError}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={addSaving}>{addSaving ? 'Saving…' : 'Add employee'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => !addSaving && setAddModalOpen(false)} disabled={addSaving}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
