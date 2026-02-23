import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { employee } from '../../api'
import '../Table.css'

export default function EmployeeHolidayRequest() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = () => {
    setLoading(true)
    employee.leaveRequests.list()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.from_date || !form.to_date) {
      setMessage('From date and To date required')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await employee.leaveRequests.create({
        leave_type: form.leave_type || 'casual',
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason || '',
      })
      setForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' })
      load()
      setMessage('Request submitted.')
    } catch (err) {
      setMessage(err.response?.data?.error || err.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pageContent">
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Request leave</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label className="label">Leave type</label>
            <select className="input" value={form.leave_type} onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="earned">Earned</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="label">From date</label>
            <input type="date" className="input" value={form.from_date} onChange={(e) => setForm((f) => ({ ...f, from_date: e.target.value }))} required />
          </div>
          <div>
            <label className="label">To date</label>
            <input type="date" className="input" value={form.to_date} onChange={(e) => setForm((f) => ({ ...f, to_date: e.target.value }))} required />
          </div>
          <div style={{ minWidth: 200 }}>
            <label className="label">Reason (optional)</label>
            <input type="text" className="input" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Reason" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button>
        </form>
        {message && <p style={{ margin: '0.5rem 0 0', color: 'var(--accent)' }}>{message}</p>}
      </div>
      <div className="card tableCard">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>My leave requests</h3>
          <Link to="/employee/leave-balance" className="btn btn-secondary" style={{ fontSize: '0.9rem' }}>Leave balance & history</Link>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Requested at</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id}>
                  <td>{row.leave_type === 'casual' ? 'Casual' : row.leave_type === 'sick' ? 'Sick' : row.leave_type === 'earned' ? 'Earned' : row.leave_type || '—'}</td>
                  <td>{row.from_date}</td>
                  <td>{row.to_date}</td>
                  <td>{row.reason || '—'}</td>
                  <td><span className={`statusBadge status${row.status}`}>{row.status}</span></td>
                  <td>{row.requested_at ? new Date(row.requested_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && list.length === 0 && <p className="muted">No leave requests yet.</p>}
      </div>
    </div>
  )
}
