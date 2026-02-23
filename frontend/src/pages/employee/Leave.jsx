import { useState, useEffect } from 'react'
import { employee } from '../../api'
import './LeaveBalance.css'
import '../Table.css'

const LEAVE_TYPE_LABELS = { casual: 'Casual', sick: 'Sick', earned: 'Earned', other: 'Other' }

export default function Leave() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const POLL_MS = 45000

  const load = (silent = false) => {
    if (!silent) setLoading(true)
    employee.leaveBalance()
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const t = setInterval(() => load(true), POLL_MS)
    return () => clearInterval(t)
  }, [])

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

  const balance = data?.balance || {}
  const history = data?.history || []

  return (
    <div className="leaveBalancePage leavePageCombined">
      <h2 className="leaveBalanceTitle">Leave</h2>

      {/* Balance */}
      <section className="leaveBalanceCards card">
        <h3 className="leaveBalanceSectionTitle">Balance (this year)</h3>
        <div className="leaveBalanceGrid">
          {['casual', 'sick', 'earned'].map((key) => {
            const b = balance[key] || { allowance: 0, taken: 0, balance: 0 }
            return (
              <div key={key} className="leaveBalanceCard">
                <span className="leaveBalanceCardLabel">{LEAVE_TYPE_LABELS[key] || key}</span>
                <span className="leaveBalanceCardValue">{b.balance}</span>
                <span className="leaveBalanceCardSub">of {b.allowance} (used {b.taken})</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Request leave */}
      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 className="leaveBalanceSectionTitle">Request leave</h3>
        <form onSubmit={handleSubmit} className="leaveRequestForm">
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
          <div className="leaveRequestReason">
            <label className="label">Reason (optional)</label>
            <input type="text" className="input" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Reason" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button>
        </form>
        {message && <p className={`leaveRequestMessage ${message.includes('submitted') ? 'success' : 'error'}`}>{message}</p>}
      </section>

      {/* History */}
      <section className="leaveHistorySection card">
        <h3 className="leaveBalanceSectionTitle">Leave history</h3>
        {loading && !data ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <table className="leaveHistoryTable">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{LEAVE_TYPE_LABELS[row.leave_type] || row.leave_type || '—'}</td>
                    <td>{row.from_date}</td>
                    <td>{row.to_date}</td>
                    <td>{row.reason || '—'}</td>
                    <td><span className={`statusBadge status${row.status}`}>{row.status}</span></td>
                    <td>{row.requested_at ? new Date(row.requested_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && <p className="muted">No leave requests yet.</p>}
          </>
        )}
      </section>
    </div>
  )
}
