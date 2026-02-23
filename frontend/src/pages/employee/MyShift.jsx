import { useState, useEffect, useCallback } from 'react'
import { employee } from '../../api'
import './MyShift.css'

function formatTime(t) {
  if (!t) return '—'
  if (typeof t === 'string' && t.length >= 5) return t.slice(0, 5)
  return String(t)
}

export default function MyShift() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadProfile = useCallback(() => {
    setError('')
    setLoading(true)
    employee.profile()
      .then((r) => {
        setData(r.data)
      })
      .catch((err) => {
        setData(null)
        const msg = err.response?.data?.error || err.response?.data?.message || err.message
        setError(msg || 'Failed to load shift details.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  if (loading && !data) return <p className="myShiftLoading">Loading…</p>
  if (!data) {
    return (
      <div className="myShiftPage">
        <h2 className="myShiftTitle">My shift</h2>
        <p className="myShiftError">{error || 'Failed to load shift details.'}</p>
        <p className="myShiftErrorHint">If you just signed in, try again. Otherwise sign out and sign in again.</p>
        <button type="button" className="btn btn-primary" onClick={loadProfile}>Retry</button>
      </div>
    )
  }

  const shiftName = data.shift || '—'
  const fromTime = formatTime(data.shift_from)
  const toTime = formatTime(data.shift_to)

  return (
    <div className="myShiftPage">
      <h2 className="myShiftTitle">My shift</h2>
      <div className="myShiftCard card">
        <div className="myShiftRow">
          <span className="myShiftLabel">Shift</span>
          <span className="myShiftValue">{shiftName}</span>
        </div>
        <div className="myShiftRow">
          <span className="myShiftLabel">Time in</span>
          <span className="myShiftValue">{fromTime}</span>
        </div>
        <div className="myShiftRow">
          <span className="myShiftLabel">Time out</span>
          <span className="myShiftValue">{toTime}</span>
        </div>
      </div>
      {(!shiftName || shiftName === '—') && (
        <p className="myShiftNote muted">Your shift details are set by HR. Contact admin if this is missing.</p>
      )}
    </div>
  )
}
