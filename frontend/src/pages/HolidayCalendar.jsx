import { useState, useEffect } from 'react'
import { holidays, leaveRequests } from '../api'
import './Table.css'

export default function HolidayCalendar() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())
  const [form, setForm] = useState({ date: '', name: '', year: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [leaveList, setLeaveList] = useState([])
  const [leaveLoading, setLeaveLoading] = useState(true)
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('')
  const [leaveMessage, setLeaveMessage] = useState('')

  const POLL_MS = 45000

  const load = (silent = false) => {
    if (!silent) setLoading(true)
    holidays.list(yearFilter ? { year: yearFilter } : {})
      .then((r) => setList(r.data.results ?? r.data ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [yearFilter])

  useEffect(() => {
    const t = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(t)
  }, [yearFilter])

  const loadLeaveRequests = (silent = false) => {
    if (!silent) setLeaveLoading(true)
    leaveRequests.list(leaveStatusFilter ? { status: leaveStatusFilter } : {})
      .then((r) => setLeaveList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setLeaveList([]))
      .finally(() => setLeaveLoading(false))
  }

  useEffect(() => { loadLeaveRequests() }, [leaveStatusFilter])

  useEffect(() => {
    const t = setInterval(() => loadLeaveRequests(true), POLL_MS)
    return () => clearInterval(t)
  }, [leaveStatusFilter])

  const handleLeaveAction = async (id, status) => {
    setLeaveMessage('')
    try {
      await leaveRequests.patch(id, { status })
      loadLeaveRequests()
      setLeaveMessage(`Request ${status}.`)
    } catch (err) {
      setLeaveMessage(err.response?.data?.error || 'Failed')
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.date || !form.name) {
      setMessage('Date and name required')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await holidays.create({
        date: form.date,
        name: form.name,
        year: form.year ? parseInt(form.year, 10) : new Date(form.date).getFullYear(),
      })
      setForm({ date: '', name: '', year: '' })
      load()
      setMessage('Holiday added.')
    } catch (err) {
      setMessage(err.response?.data?.detail || err.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this holiday?')) return
    try {
      await holidays.delete(id)
      load()
    } catch (err) {
      setMessage(err.response?.data?.detail || err.message || 'Failed')
    }
  }

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Holidays and leave</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>Manage public holidays so absentee logic does not flag them.</p>
      <div className="filters card">
        <div>
          <label className="label">Year</label>
          <input type="number" className="input" value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))} style={{ maxWidth: 100 }} />
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Add holiday</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Name</label>
            <input type="text" className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Christmas" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
        </form>
        {message && <p style={{ margin: '0.5rem 0 0', color: 'var(--accent)' }}>{message}</p>}
      </div>
      <div className="card tableCard">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Year</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(list) ? list : []).map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.name}</td>
                  <td>{row.year || '—'}</td>
                  <td>{row.id != null ? <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleDelete(row.id)}>Delete</button> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && Array.isArray(list) && list.length === 0 && <p className="muted">No holidays for this year.</p>}
      </div>

      <h2 className="sectionTitle" style={{ marginTop: '2rem' }}>Leave requests</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>Employee leave requests. Approve or decline.</p>
      <div className="filters card" style={{ marginBottom: '1rem' }}>
        <div>
          <label className="label">Status</label>
          <select className="input" value={leaveStatusFilter} onChange={(e) => setLeaveStatusFilter(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </div>
      </div>
      <div className="card tableCard">
        {leaveLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Leave type</th>
                <th>Days</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>Dept</th>
                <th>Can give</th>
                <th>Status</th>
                <th>Requested at</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leaveList.map((row) => (
                <tr key={row.id}>
                  <td>{row.employee_name || row.emp_code}</td>
                  <td>{row.leave_type === 'casual' ? 'Casual' : row.leave_type === 'sick' ? 'Sick' : row.leave_type === 'earned' ? 'Earned' : row.leave_type || '—'}</td>
                  <td>{row.days_requested != null ? row.days_requested : '—'}</td>
                  <td>{row.from_date}</td>
                  <td>{row.to_date}</td>
                  <td>{row.reason || '—'}</td>
                  <td>{row.dept_name || '—'}</td>
                  <td title={row.leave_balance != null ? `${row.leave_balance} of ${row.leave_allowance} left (${row.leave_taken} used)` : ''}>{row.leave_balance != null ? `${row.leave_balance} left` : '—'}</td>
                  <td><span className={`statusBadge status${row.status}`}>{row.status}</span></td>
                  <td>{row.requested_at ? new Date(row.requested_at).toLocaleString() : '—'}</td>
                  <td>
                    {row.status === 'pending' && (
                      <>
                        <button type="button" className="btn btn-primary btnSmall" style={{ marginRight: 6 }} onClick={() => handleLeaveAction(row.id, 'approved')}>Approve</button>
                        <button type="button" className="btn btn-secondary btnSmall" onClick={() => handleLeaveAction(row.id, 'declined')}>Decline</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!leaveLoading && leaveList.length === 0 && <p className="muted">No leave requests.</p>}
      </div>
      {leaveMessage && <p style={{ marginTop: '0.5rem', color: 'var(--accent)' }}>{leaveMessage}</p>}
    </div>
  )
}
