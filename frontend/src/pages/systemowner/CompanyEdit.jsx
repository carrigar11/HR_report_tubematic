import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { systemOwner } from '../../api'
import './SystemOwner.css'

export default function SystemOwnerCompanyEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    systemOwner.companies.get(id)
      .then((r) => {
        const c = r.data
        setCompany(c)
        setName(c.name || '')
        setCode(c.code || '')
        setContactEmail(c.contact_email || '')
        setContactPhone(c.contact_phone || '')
        setAddress(c.address || '')
        setIsActive(c.is_active !== false)
      })
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async (e) => {
    e.preventDefault()
    setMessage('')
    setSaving(true)
    try {
      await systemOwner.companies.update(id, {
        name: name.trim(),
        code: code.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
        is_active: isActive
      })
      setMessage('Saved.')
      setCompany((prev) => ({
        ...prev,
        name: name.trim(),
        code: code.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
        is_active: isActive
      }))
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>
  if (!company) return null

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <h2 className="pageSubtitle">Edit company</h2>
        {message && <p className={message === 'Saved.' ? 'success' : 'error'}>{message}</p>}
        <form onSubmit={handleSave} className="formStack">
          <label className="label">Name</label>
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="label">Code</label>
          <input type="text" className="input" value={code} onChange={(e) => setCode(e.target.value)} required />
          <label className="label">Contact email</label>
          <input type="email" className="input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="company@example.com" />
          <label className="label">Contact phone</label>
          <input type="text" className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 234 567 8900" />
          <label className="label">Address</label>
          <textarea className="input" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, country" />
          <label className="label">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>
          <p className="muted" style={{ fontSize: '0.9rem' }}>To change login credentials, edit the company&apos;s Admins from the Admins page.</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/system-owner/companies')}>Back</button>
          </div>
        </form>
      </div>
    </div>
  )
}
