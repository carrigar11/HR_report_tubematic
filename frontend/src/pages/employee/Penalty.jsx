import { useState, useEffect } from 'react'
import { employee } from '../../api'
import '../Table.css'

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()

export default function EmployeePenalty() {
  const [list, setList] = useState([])
  const [totalFine, setTotalFine] = useState('0')
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [inquiryModal, setInquiryModal] = useState({ open: false, penaltyId: null, message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const load = () => {
    setLoading(true)
    employee.penalties({ month, year })
      .then((r) => {
        setList(r.data.list || [])
        setTotalFine(r.data.total_fine_month || '0')
      })
      .catch(() => { setList([]); setTotalFine('0') })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [month, year])

  const openInquiry = (penaltyId) => setInquiryModal({ open: true, penaltyId, message: '' })
  const closeInquiry = () => setInquiryModal({ open: false, penaltyId: null, message: '' })

  const submitInquiry = async () => {
    if (!inquiryModal.penaltyId) return
    setSubmitting(true)
    setMessage('')
    try {
      await employee.penaltyInquiryCreate(inquiryModal.penaltyId, inquiryModal.message)
      closeInquiry()
      load()
      setMessage('Inquiry submitted.')
    } catch (err) {
      setMessage(err.response?.data?.error || err.message || 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pageContent">
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Total fine this month: ₹ {totalFine}</h3>
      </div>
      <div className="filters card" style={{ marginBottom: '1rem' }}>
        <div>
          <label className="label">Month</label>
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ minWidth: 120 }}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
              <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <input type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 90 }} />
        </div>
      </div>
      <div className="card tableCard">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Minutes late</th>
                <th>Amount (₹)</th>
                <th>Description</th>
                <th>Inquiry</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.minutes_late ?? '—'}</td>
                  <td>{row.deduction_amount}</td>
                  <td>{row.description || '—'}</td>
                  <td>{row.inquiry_status ? <span className="statusBadge">{row.inquiry_status}</span> : '—'}</td>
                  <td>
                    {(!row.inquiry_status || row.inquiry_status !== 'open') && (
                      <button type="button" className="btn btn-secondary btnSmall" onClick={() => openInquiry(row.id)}>Create inquiry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && list.length === 0 && <p className="muted">No penalties for this month.</p>}
      </div>
      {message && <p style={{ marginTop: '1rem', color: 'var(--accent)' }}>{message}</p>}

      {inquiryModal.open && (
        <div className="modalOverlay" onClick={closeInquiry}>
          <div className="card modalContent" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Create inquiry</h3>
            <p className="muted">Explain why you think this penalty is incorrect. HR will review.</p>
            <textarea
              className="input"
              rows={3}
              value={inquiryModal.message}
              onChange={(e) => setInquiryModal((m) => ({ ...m, message: e.target.value }))}
              placeholder="Your message (optional)"
              style={{ width: '100%', marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={submitInquiry}>{submitting ? 'Submitting…' : 'Submit'}</button>
              <button type="button" className="btn btn-secondary" onClick={closeInquiry}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
