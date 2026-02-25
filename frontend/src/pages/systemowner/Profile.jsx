import { useState, useEffect } from 'react'
import { systemOwner } from '../../api'
import './SystemOwner.css'

export default function SystemOwnerProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  useEffect(() => {
    systemOwner.profile.get()
      .then((r) => {
        const p = r.data
        setProfile(p)
        setName(p.name || '')
        setEmail(p.email || '')
        setPhone(p.phone || '')
      })
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    if (password && password !== passwordConfirm) {
      setMessage('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      const payload = { name: name.trim(), email: email.trim(), phone: phone.trim() }
      if (password.trim()) payload.password = password.trim()
      const { data } = await systemOwner.profile.update(payload)
      setProfile(data)
      setMessage('Profile updated.')
      setPassword('')
      setPasswordConfirm('')
      const stored = JSON.parse(localStorage.getItem('hr_admin') || '{}')
      localStorage.setItem('hr_admin', JSON.stringify({ ...stored, name: data.name, email: data.email }))
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>
  if (!profile) return null

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <h2 className="pageSubtitle">Profile</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>Update your name, login email, and password. You sign in with your email.</p>
        {message && <p className={message === 'Profile updated.' ? 'success' : 'error'}>{message}</p>}
        <form onSubmit={handleSubmit} className="formStack">
          <label className="label">Name</label>
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="label">Email (login)</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="label">Phone</label>
          <input type="text" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
          <label className="label">New password (leave blank to keep current)</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          <label className="label">Confirm new password</label>
          <input type="password" className="input" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
