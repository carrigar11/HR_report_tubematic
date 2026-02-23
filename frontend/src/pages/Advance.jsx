import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { advance as advanceApi, employees, salary } from '../api'
import './Table.css'
import './Advance.css'

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()
const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MAX_SUGGESTIONS = 20

export default function Advance() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [empCode, setEmpCode] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [showEmpDropdown, setShowEmpDropdown] = useState(false)
  const empDropdownRef = useRef(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [employeeOptions, setEmployeeOptions] = useState([])
  const [deletingId, setDeletingId] = useState(null)
  const [earnedByEmp, setEarnedByEmp] = useState({})  // emp_code -> earned_so_far for selected month

  useEffect(() => {
    advanceApi.list(month, year)
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
  }, [month, year])

  useEffect(() => {
    salary.monthly(month, year)
      .then((r) => {
        const arr = Array.isArray(r.data) ? r.data : []
        const map = {}
        arr.forEach((row) => {
          map[row.emp_code] = parseFloat(row.earned_so_far) || 0
        })
        setEarnedByEmp(map)
      })
      .catch(() => setEarnedByEmp({}))
  }, [month, year])

  useEffect(() => {
    employees.list({ include_filters: 'false' })
      .then((r) => {
        const d = r.data
        const results = d.results ?? d ?? []
        setEmployeeOptions(Array.isArray(results) ? results : [])
      })
      .catch(() => setEmployeeOptions([]))
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (empDropdownRef.current && !empDropdownRef.current.contains(e.target)) setShowEmpDropdown(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const empSuggestions = empSearch.trim()
    ? employeeOptions.filter((emp) => {
        const q = empSearch.trim().toLowerCase()
        const code = (emp.emp_code || '').toString().toLowerCase()
        const name = (emp.name || '').toString().toLowerCase()
        return code.includes(q) || name.includes(q)
      }).slice(0, MAX_SUGGESTIONS)
    : []

  const selectEmployee = (emp) => {
    setEmpCode(emp.emp_code)
    setEmpSearch(`${emp.emp_code} – ${emp.name || ''}`)
    setShowEmpDropdown(false)
  }

  const clearEmployee = () => {
    setEmpCode('')
    setEmpSearch('')
    setShowEmpDropdown(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const code = empCode.trim()
    const amt = parseFloat(amount)
    if (!code) {
      setError('Select an employee')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    setSubmitting(true)
    advanceApi.create({
      emp_code: code,
      amount: amt,
      month,
      year,
      note: note.trim() || undefined,
      date_given: new Date().toISOString().slice(0, 10),
    })
      .then(() => {
        setSuccess('Advance recorded.')
        setEmpCode('')
        setEmpSearch('')
        setAmount('')
        setNote('')
        advanceApi.list(month, year).then((r) => setList(Array.isArray(r.data) ? r.data : []))
        setTimeout(() => setSuccess(''), 2000)
      })
      .catch((err) => setError(err.response?.data?.error || err.message || 'Failed to save'))
      .finally(() => setSubmitting(false))
  }

  const periodLabel = `${monthNames[month]} ${year}`
  const totalAdvance = list.reduce((s, r) => s + parseFloat(r.amount || 0), 0)

  const handleRemoveAdvance = (row) => {
    if (!window.confirm(`Remove advance of ${Number(row.amount || 0).toFixed(2)} for ${row.emp_code}?`)) return
    setDeletingId(row.id)
    advanceApi.delete(row.id)
      .then(() => {
        setSuccess('Advance removed.')
        advanceApi.list(month, year).then((r) => setList(Array.isArray(r.data) ? r.data : []))
        setTimeout(() => setSuccess(''), 2000)
      })
      .catch((err) => setError(err.response?.data?.error || err.message || 'Failed to remove'))
      .finally(() => setDeletingId(null))
  }

  return (
    <div className="pageContent advancePage">
      <h2 className="advanceTitle">Advance</h2>
      <p className="advanceIntro">Record advance given to employees. Amount is deducted from that month&apos;s salary.</p>

      <div className="card advanceCard">
        <div className="advanceFilters">
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
        </div>

        <div className="advanceAddForm">
          <h3 className="advanceSectionTitle">Add advance for {periodLabel}</h3>
          <form onSubmit={handleSubmit} className="advanceForm">
            <div className="advanceFormRow">
              <div className="advanceFormField advanceEmpSelectWrap" ref={empDropdownRef}>
                <label className="label">Employee</label>
                <input
                  type="text"
                  className="input"
                  value={empSearch}
                  onChange={(e) => {
                    setEmpSearch(e.target.value)
                    setShowEmpDropdown(true)
                    if (!e.target.value.trim()) setEmpCode('')
                  }}
                  onFocus={() => setShowEmpDropdown(true)}
                  placeholder="Type code or name to search…"
                  autoComplete="off"
                />
                {empCode && (
                  <button type="button" className="advanceEmpClear" onClick={clearEmployee} title="Clear">×</button>
                )}
                {showEmpDropdown && (
                  <div className="advanceEmpDropdown">
                    {empSuggestions.length === 0 ? (
                      <p className="advanceEmpDropdownEmpty muted">{empSearch.trim() ? 'No match' : 'Type to search'}</p>
                    ) : (
                      empSuggestions.map((emp) => (
                        <button
                          key={emp.emp_code}
                          type="button"
                          className="advanceEmpDropdownItem"
                          onClick={() => selectEmployee(emp)}
                        >
                          <span className="advanceEmpDropdownCode">{emp.emp_code}</span>
                          <span className="advanceEmpDropdownName">{emp.name || '—'}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="advanceFormField">
                <label className="label">Amount</label>
                <input type="number" className="input" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
                {empCode && earnedByEmp[empCode] != null && (
                  <p className="advanceEarnedSoFar">Earned so far this month: <strong>{Number(earnedByEmp[empCode]).toFixed(2)}</strong> (from hours worked)</p>
                )}
              </div>
              <div className="advanceFormField">
                <label className="label">Note (optional)</label>
                <input type="text" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Advance for expenses" />
              </div>
              <div className="advanceFormField advanceFormSubmit">
                <label className="label">&nbsp;</label>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Add Advance'}</button>
              </div>
            </div>
            {error && <p className="advanceError">{error}</p>}
            {success && <p className="advanceSuccess">{success}</p>}
          </form>
        </div>

        <div className="advanceListSection">
          <h3 className="advanceSectionTitle">Advances in {periodLabel} {loading ? '(loading…)' : ''}</h3>
          {list.length === 0 && !loading && <p className="muted">No advances recorded for this month.</p>}
          {list.length > 0 && (
            <>
              <table className="advanceTable">
                <thead>
                  <tr>
                    <th>Emp Code</th>
                    <th>Amount</th>
                    <th>Date given</th>
                    <th>Note</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                      <td>{Number(row.amount || 0).toFixed(2)}</td>
                      <td>{row.date_given || '—'}</td>
                      <td>{row.note || '—'}</td>
                      <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                      <td>
                        <button type="button" className="advanceRemoveBtn" onClick={() => handleRemoveAdvance(row)} disabled={deletingId === row.id} title="Remove advance">
                          {deletingId === row.id ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="advanceTotal">Total advance this month: <strong>{totalAdvance.toFixed(2)}</strong></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
