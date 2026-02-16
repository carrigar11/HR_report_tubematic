import { useState, useEffect } from 'react'
import { penalty as penaltyApi, employees } from '../api'
import './Table.css'
import './PenaltyPage.css'

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()
const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function PenaltyPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ emp_code: '', month: '', year: '', date_from: '', date_to: '' })
  const [manualEmp, setManualEmp] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualDesc, setManualDesc] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10))
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [employeeOptions, setEmployeeOptions] = useState([])
  const [showManual, setShowManual] = useState(false)

  const loadList = () => {
    setLoading(true)
    const params = {}
    if (filters.emp_code) params.emp_code = filters.emp_code
    if (filters.month) params.month = filters.month
    if (filters.year) params.year = filters.year
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    penaltyApi.list(params)
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadList() }, [filters.emp_code, filters.month, filters.year, filters.date_from, filters.date_to])

  useEffect(() => {
    employees.list({ page_size: 500 })
      .then((r) => {
        const d = r.data
        const results = d.results ?? d ?? []
        setEmployeeOptions(Array.isArray(results) ? results : [])
      })
      .catch(() => setEmployeeOptions([]))
  }, [])

  const handleManualSubmit = (e) => {
    e.preventDefault()
    setMessage({ text: '', type: '' })
    const code = manualEmp.trim()
    const amt = parseFloat(manualAmount)
    if (!code) { setMessage({ text: 'Select employee', type: 'error' }); return }
    if (!Number.isFinite(amt) || amt < 0) { setMessage({ text: 'Enter valid amount (Rs)', type: 'error' }); return }
    setManualSubmitting(true)
    penaltyApi.create({ emp_code: code, deduction_amount: amt, description: manualDesc.trim() || 'Manual penalty', date: manualDate })
      .then(() => {
        setMessage({ text: 'Penalty added.', type: 'success' })
        setManualAmount('')
        setManualDesc('')
        setManualDate(new Date().toISOString().slice(0, 10))
        loadList()
      })
      .catch((err) => setMessage({ text: err.response?.data?.error || 'Failed', type: 'error' }))
      .finally(() => setManualSubmitting(false))
  }

  const handleDelete = (id) => {
    if (!window.confirm('Remove this penalty record?')) return
    penaltyApi.delete(id).then(() => loadList()).catch(() => setMessage({ text: 'Delete failed', type: 'error' }))
  }

  const totalDeduction = list.reduce((s, r) => s + (parseFloat(r.deduction_amount) || 0), 0)

  return (
    <div className="pageContent penaltyPage">
      <header className="penaltyHeader">
        <div>
          <h1 className="penaltyTitle">Penalty (Late and Manual)</h1>
          <p className="penaltySubtitle">Late: 2.5 Rs/min until 300 Rs/month, then 5 Rs/min. Shift start 9:00 AM. Hourly only. Resets 1st of month.</p>
        </div>
        <button type="button" className={'btn ' + (showManual ? 'btn-secondary' : 'btn-primary')} onClick={() => setShowManual(!showManual)}>
          {showManual ? 'Cancel' : '+ Add manual penalty'}
        </button>
      </header>

      {showManual && (
        <div className="card penaltyManualCard">
          <h3 className="penaltyCardTitle">Add manual penalty</h3>
          <form onSubmit={handleManualSubmit} className="penaltyManualForm">
            <div className="penaltyField">
              <label>Employee *</label>
              <select className="input" value={manualEmp} onChange={(e) => setManualEmp(e.target.value)} required>
                <option value="">Select...</option>
                {employeeOptions.map((e) => <option key={e.emp_code} value={e.emp_code}>{e.emp_code} — {e.name || '—'}</option>)}
              </select>
            </div>
            <div className="penaltyField">
              <label>Amount (Rs) *</label>
              <input type="number" className="input" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} min="0" step="0.01" required />
            </div>
            <div className="penaltyField">
              <label>Date</label>
              <input type="date" className="input" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div className="penaltyField penaltyFieldWide">
              <label>Description</label>
              <input type="text" className="input" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} placeholder="e.g. Manual penalty reason" />
            </div>
            <div className="penaltyField">
              <button type="submit" className="btn btn-primary" disabled={manualSubmitting}>{manualSubmitting ? 'Adding…' : 'Add penalty'}</button>
            </div>
          </form>
          {message.text && <p className={'penaltyMessage ' + message.type}>{message.text}</p>}
        </div>
      )}

      <div className="card penaltyFilterCard">
        <h3 className="penaltyCardTitle">Filters</h3>
        <div className="penaltyFilterRow">
          <div className="penaltyField">
            <label>Emp code</label>
            <input type="text" className="input" value={filters.emp_code} onChange={(e) => setFilters((f) => ({ ...f, emp_code: e.target.value }))} placeholder="Search" />
          </div>
          <div className="penaltyField">
            <label>Month</label>
            <select className="input" value={filters.month} onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}>
              <option value="">All</option>
              {monthNames.map((m, i) => i && <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="penaltyField">
            <label>Year</label>
            <input type="number" className="input" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))} placeholder="Year" min={2020} max={2030} style={{ width: 90 }} />
          </div>
          <div className="penaltyField">
            <label>Date from</label>
            <input type="date" className="input" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div className="penaltyField">
            <label>Date to</label>
            <input type="date" className="input" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card tableCard">
        <div className="penaltyTableHeader">
          <h3 className="penaltyCardTitle">Penalty records</h3>
          <span className="penaltyTotal">Total (filtered): Rs {totalDeduction.toFixed(2)}</span>
        </div>
        {loading ? <p className="muted">Loading…</p> : (
          <table className="dataTable penaltyTable">
            <thead>
              <tr>
                <th>Emp code</th>
                <th>Date</th>
                <th>Type</th>
                <th>Came at</th>
                <th>Shift start</th>
                <th>Min late</th>
                <th>Amount (Rs)</th>
                <th>Rate</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={10} className="muted">No penalties match filters.</td></tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.emp_code}</strong></td>
                    <td>{row.date}</td>
                    <td>
                      {row.is_manual
                        ? <span className="badge badge-warn">Manual</span>
                        : <span className="badge badge-success">Automatic (Late)</span>}
                    </td>
                    <td>{row.punch_in_time || '—'}</td>
                    <td>{row.shift_start_time || '—'}</td>
                    <td>{row.minutes_late != null && row.minutes_late !== '' ? row.minutes_late : '—'}</td>
                    <td>{Number(row.deduction_amount).toFixed(2)}</td>
                    <td>{row.rate_used != null ? `${row.rate_used} Rs/min` : '—'}</td>
                    <td className="penaltyDesc">{row.description || '—'}</td>
                    <td><button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(row.id)}>Remove</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
