import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { systemOwner } from '../../api'
import './SystemOwner.css'

const DECLINE_REASONS = [
  'Incomplete or invalid documentation',
  'Business type not eligible at this time',
  'Duplicate or similar company already registered',
  'Information provided could not be verified',
  'Does not meet current onboarding criteria',
  'Other (please specify below)',
]

const OWNER_CONTACT = 'divyamdharod@tubematic.in / deveshgoswami191@gmail.com'

export default function SystemOwnerCompanyRequestDecline() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!id) return
    systemOwner.companyRequests.get(id)
      .then((r) => setRequest(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  const effectiveReason = (reason === 'Other (please specify below)' ? customReason.trim() : reason) || reason

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!effectiveReason.trim()) {
      setMessage('Please select or type a reason for declining.')
      return
    }
    setMessage('')
    setSending(true)
    try {
      await systemOwner.companyRequests.decline(id, { reason: effectiveReason.trim() })
      setMessage('Decline email sent to the requester.')
      setTimeout(() => navigate('/system-owner/company-requests'), 1500)
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Failed to send decline email')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p><button type="button" className="btn btn-secondary" onClick={() => navigate('/system-owner/company-requests')}>Back to requests</button></div>
  if (!request) return null

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <h2 className="pageSubtitle">Decline company registration request</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Request from <strong>{request.company_name}</strong> ({request.contact_email}). An email will be sent to them with the reason and owner contact for further notice.
        </p>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Owner contact (included in email): <strong>{OWNER_CONTACT}</strong>
        </p>
        <form onSubmit={handleSubmit} className="formStack">
          <label className="label">Reason for decline (select or type)</label>
          <select
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Select a reason…</option>
            {DECLINE_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {reason === 'Other (please specify below)' && (
            <>
              <label className="label">Your reason</label>
              <textarea
                className="input"
                rows={3}
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Type the decline reason…"
              />
            </>
          )}
          {reason && reason !== 'Other (please specify below)' && (
            <p className="muted" style={{ marginTop: '0.25rem' }}>Reason to be sent: {reason}</p>
          )}
          {message && <p className={message.includes('sent') ? 'success' : 'error'}>{message}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={sending || !effectiveReason.trim()}>
              {sending ? 'Sending…' : 'Send decline email'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/system-owner/company-requests')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
