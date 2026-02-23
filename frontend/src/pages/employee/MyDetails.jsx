import { useState, useEffect } from 'react'
import { employee } from '../../api'
import './MyDetails.css'

export default function EmployeeMyDetails() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    employee.profile()
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="empDetailsLoading">Loading…</p>
  if (!data) return <p className="empDetailsError">Could not load profile.</p>

  const statusClass = data.status === 'Active' ? 'active' : data.status === 'Inactive' ? 'inactive' : 'other'
  const baseSal = Number(data.base_salary) || 0
  const isHourly = (data.salary_type || '').toLowerCase() === 'hourly'
  const perHourRate = isHourly ? baseSal : (baseSal ? baseSal / 208 : 0)

  return (
    <div className="empDetailsPage">
      <section className="empDetailsSection card">
        <h3 className="empDetailsSectionTitle">Personal</h3>
        <div className="empDetailsGrid">
          <div className="empDetailsField">
            <span className="empDetailsLabel">Employee code</span>
            <span className="empDetailsValue">{data.emp_code ?? '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Name</span>
            <span className="empDetailsValue">{data.name ?? '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Email</span>
            <span className={`empDetailsValue ${!data.email ? 'empty' : ''}`}>{data.email || '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Mobile</span>
            <span className={`empDetailsValue ${!data.mobile ? 'empty' : ''}`}>{data.mobile || '—'}</span>
          </div>
        </div>
      </section>

      <section className="empDetailsSection card">
        <h3 className="empDetailsSectionTitle">Work</h3>
        <div className="empDetailsGrid">
          <div className="empDetailsField">
            <span className="empDetailsLabel">Department</span>
            <span className={`empDetailsValue ${!data.dept_name ? 'empty' : ''}`}>{data.dept_name || '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Designation</span>
            <span className={`empDetailsValue ${!data.designation ? 'empty' : ''}`}>{data.designation || '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Status</span>
            <span className={`empDetailsBadge ${statusClass}`}>{data.status || '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Employment type</span>
            <span className="empDetailsValue">{data.employment_type || '—'}</span>
          </div>
        </div>
      </section>

      <section className="empDetailsSection card spanFull">
        <h3 className="empDetailsSectionTitle">Salary & shift</h3>
        <div className="empDetailsGrid">
          <div className="empDetailsField">
            <span className="empDetailsLabel">Salary type</span>
            <span className="empDetailsValue">{data.salary_type || '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Base salary</span>
            <span className="empDetailsValue">{data.base_salary != null && data.base_salary !== '' ? `₹ ${Number(data.base_salary).toLocaleString('en-IN')}` : '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Per hour rate</span>
            <span className="empDetailsValue">{perHourRate ? `₹ ${perHourRate.toFixed(2)}` : '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Shift</span>
            <span className={`empDetailsValue ${!data.shift ? 'empty' : ''}`}>{data.shift || '—'}</span>
          </div>
          <div className="empDetailsField">
            <span className="empDetailsLabel">Shift time</span>
            <span className="empDetailsValue">
              {[data.shift_from, data.shift_to].filter(Boolean).length ? `${data.shift_from || '—'} – ${data.shift_to || '—'}` : '—'}
            </span>
          </div>
          {data.company_name && (
            <div className="empDetailsField">
              <span className="empDetailsLabel">Company</span>
              <span className="empDetailsValue">{data.company_name}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
