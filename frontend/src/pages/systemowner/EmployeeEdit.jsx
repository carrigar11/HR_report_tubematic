import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { systemOwner } from '../../api'
import SearchableCompanySelect from './SearchableCompanySelect'
import './SystemOwner.css'

export default function SystemOwnerEmployeeEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [emp, setEmp] = useState(null)
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    email: '',
    gender: '',
    dept_name: '',
    designation: '',
    status: 'Active',
    company: null,
    employment_type: 'Full-time',
    salary_type: 'Monthly',
    base_salary: '',
    shift: '',
    shift_from: '',
    shift_to: '',
    casual_allowance_per_year: '',
    sick_allowance_per_year: '',
    earned_allowance_per_year: '',
    password: '',
  })

  useEffect(() => {
    systemOwner.companies.list()
      .then((r) => setCompanies(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCompanies([]))
  }, [])

  useEffect(() => {
    systemOwner.employees.get(id)
      .then((r) => {
        const e = r.data
        const companyId = e.company != null ? (typeof e.company === 'object' ? e.company.id : e.company) : null
        setEmp(e)
        setForm({
          name: e.name || '',
          mobile: e.mobile || '',
          email: e.email || '',
          gender: e.gender || '',
          dept_name: e.dept_name || '',
          designation: e.designation || '',
          status: e.status || 'Active',
          company: companyId,
          employment_type: e.employment_type || 'Full-time',
          salary_type: e.salary_type || 'Monthly',
          base_salary: e.base_salary !== undefined && e.base_salary !== null ? String(e.base_salary) : '',
          shift: e.shift || '',
          shift_from: e.shift_from || '',
          shift_to: e.shift_to || '',
          casual_allowance_per_year: e.casual_allowance_per_year !== undefined && e.casual_allowance_per_year !== null ? String(e.casual_allowance_per_year) : '',
          sick_allowance_per_year: e.sick_allowance_per_year !== undefined && e.sick_allowance_per_year !== null ? String(e.sick_allowance_per_year) : '',
          earned_allowance_per_year: e.earned_allowance_per_year !== undefined && e.earned_allowance_per_year !== null ? String(e.earned_allowance_per_year) : '',
          password: '',
        })
      })
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async (e) => {
    e.preventDefault()
    setMessage('')
    setSaving(true)
    const payload = {
      name: form.name,
      dept_name: form.dept_name,
      designation: form.designation,
      status: form.status,
      mobile: (form.mobile || '').trim() || null,
      email: (form.email || '').trim() || null,
      gender: (form.gender || '').trim() || null,
      employment_type: form.employment_type || 'Full-time',
      salary_type: form.salary_type || 'Monthly',
      shift: (form.shift || '').trim() || null,
      shift_from: (form.shift_from || '').trim() || null,
      shift_to: (form.shift_to || '').trim() || null,
    }
    const rawCompany = form.company
    const companyId = rawCompany != null && rawCompany !== '' ? Number(rawCompany) : null
    if (companyId != null && !Number.isNaN(companyId) && companyId > 0) {
      payload.company = companyId
    } else if (rawCompany === null || rawCompany === '') {
      payload.company = null
    }
    if (form.base_salary !== '' && form.base_salary != null) {
      const num = parseFloat(form.base_salary)
      if (!isNaN(num)) payload.base_salary = num
    }
    const c = form.casual_allowance_per_year
    const s = form.sick_allowance_per_year
    const er = form.earned_allowance_per_year
    if (c !== '' && c != null) { const n = parseInt(c, 10); if (!isNaN(n) && n >= 0) payload.casual_allowance_per_year = n }
    if (s !== '' && s != null) { const n = parseInt(s, 10); if (!isNaN(n) && n >= 0) payload.sick_allowance_per_year = n }
    if (er !== '' && er != null) { const n = parseInt(er, 10); if (!isNaN(n) && n >= 0) payload.earned_allowance_per_year = n }
    if ((form.password || '').trim()) payload.password = form.password.trim()
    try {
      await systemOwner.employees.update(id, payload)
      setMessage('Saved.')
      setEmp((prev) => ({ ...prev, ...form }))
    } catch (err) {
      const d = err.response?.data
      const msg = d?.error || (typeof d === 'object' && d !== null && !d.error ? (Object.values(d).flat().filter(Boolean)[0] || err.message) : err.message) || 'Failed to save'
      setMessage(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>
  if (!emp) return null

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <h2 className="pageSubtitle">Edit employee — {emp.emp_code}</h2>
        {message && <p className={message === 'Saved.' ? 'success' : 'error'}>{message}</p>}
        <form onSubmit={handleSave} className="formStack">
          <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
            <h4 className="companyRequestViewPanelTitle">Company & basic</h4>
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div>
                <label className="label">Company</label>
                <SearchableCompanySelect
                  companies={companies}
                  value={form.company ?? ''}
                  onChange={(companyId) => setForm((f) => ({ ...f, company: companyId }))}
                  placeholder="Type to search company..."
                />
              </div>
              <div>
                <label className="label">Name <span className="required">*</span></label>
                <input type="text" className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Mobile</label>
                  <input type="text" className="input" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Email (optional)</label>
                  <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Change password (leave blank to keep)</label>
                <input type="password" className="input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Optional" autoComplete="new-password" />
              </div>
            </div>
          </div>
          <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
            <h4 className="companyRequestViewPanelTitle">Work details</h4>
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Department</label>
                  <input type="text" className="input" value={form.dept_name} onChange={(e) => setForm((f) => ({ ...f, dept_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Designation</label>
                  <input type="text" className="input" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Gender</label>
                  <select className="input" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Week off">Week off</option>
                    <option value="Holiday">Holiday</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Employment type</label>
                <select className="input" value={form.employment_type} onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value }))}>
                  <option value="Full-time">Full-time</option>
                  <option value="Hourly">Hourly</option>
                </select>
              </div>
            </div>
          </div>
          <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
            <h4 className="companyRequestViewPanelTitle">Salary & shift</h4>
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Salary type</label>
                  <select className="input" value={form.salary_type} onChange={(e) => setForm((f) => ({ ...f, salary_type: e.target.value }))}>
                    <option value="Monthly">Monthly</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Fixed">Fixed</option>
                  </select>
                </div>
                <div>
                  <label className="label">Base salary</label>
                  <input type="number" className="input" step="0.01" min="0" value={form.base_salary} onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="label">Shift name</label>
                  <input type="text" className="input" value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Shift from</label>
                  <input type="time" className="input" value={form.shift_from} onChange={(e) => setForm((f) => ({ ...f, shift_from: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Shift to</label>
                  <input type="time" className="input" value={form.shift_to} onChange={(e) => setForm((f) => ({ ...f, shift_to: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <div className="companyRequestViewPanel" style={{ marginBottom: '1rem' }}>
            <h4 className="companyRequestViewPanelTitle">Leave allowances</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="label">Casual / year</label>
                <input type="number" className="input" min="0" max="99" value={form.casual_allowance_per_year} onChange={(e) => setForm((f) => ({ ...f, casual_allowance_per_year: e.target.value }))} />
              </div>
              <div>
                <label className="label">Sick / year</label>
                <input type="number" className="input" min="0" max="99" value={form.sick_allowance_per_year} onChange={(e) => setForm((f) => ({ ...f, sick_allowance_per_year: e.target.value }))} />
              </div>
              <div>
                <label className="label">Earned / year</label>
                <input type="number" className="input" min="0" max="99" value={form.earned_allowance_per_year} onChange={(e) => setForm((f) => ({ ...f, earned_allowance_per_year: e.target.value }))} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/system-owner/employees')}>Back</button>
          </div>
        </form>
      </div>
    </div>
  )
}
