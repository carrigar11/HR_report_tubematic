import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { employee } from '../../api'
import './LeaveBalance.css'

const LEAVE_TYPE_LABELS = { casual: 'Casual', sick: 'Sick', earned: 'Earned', other: 'Other' }

export default function LeaveBalance() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    employee.leaveBalance()
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="leaveBalanceLoading">Loading…</p>
  if (!data) return <p className="leaveBalanceError">Failed to load leave data.</p>

  const { balance, history } = data

  return (
    <div className="leaveBalancePage">
      <div className="leaveBalanceHeader">
        <h2 className="leaveBalanceTitle">Leave balance & history</h2>
        <Link to="/employee/holiday-request" className="btn btn-primary">Request leave</Link>
      </div>

      <section className="leaveBalanceCards card">
        <h3 className="leaveBalanceSectionTitle">Balance (this year)</h3>
        <div className="leaveBalanceGrid">
          {['casual', 'sick', 'earned'].map((key) => {
            const b = balance?.[key] || { allowance: 0, taken: 0, balance: 0 }
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

      <section className="leaveHistorySection card">
        <h3 className="leaveBalanceSectionTitle">Leave history</h3>
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
            {(history || []).map((row) => (
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
        {(!history || history.length === 0) && <p className="muted">No leave requests yet.</p>}
      </section>
    </div>
  )
}
