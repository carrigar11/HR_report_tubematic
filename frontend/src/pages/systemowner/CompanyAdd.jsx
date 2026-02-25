import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { systemOwner } from '../../api'
import './SystemOwner.css'

function suggestCode(companyName) {
  if (!companyName || !companyName.trim()) return ''
  const words = companyName.trim().split(/\s+/)
  if (words.length >= 2) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
  return words[0].slice(0, 3).toUpperCase()
}

export default function SystemOwnerCompanyAdd() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromRequest = location.state?.fromRequest || null

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [isActive, setIsActive] = useState(true)

  const [createAdmin, setCreateAdmin] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  useEffect(() => {
    if (fromRequest) {
      setName(fromRequest.company_name || '')
      setCode(suggestCode(fromRequest.company_name))
      setContactEmail(fromRequest.contact_email || '')
      setContactPhone(fromRequest.contact_phone || '')
      setAddress(fromRequest.address || '')
      setCreateAdmin(true)
      setAdminName(fromRequest.company_name || '')
      setAdminEmail(fromRequest.contact_email || '')
    }
  }, [fromRequest])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    if (!name.trim() || !code.trim()) {
      setMessage('Name and code are required.')
      return
    }
    if (createAdmin && (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim())) {
      setMessage('To create an admin, fill name, email, and password.')
      return
    }
    setSaving(true)
    try {
      const created = await systemOwner.companies.create({
        name: name.trim(),
        code: code.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
        is_active: isActive
      })
      const companyId = created?.data?.id

      if (createAdmin && companyId && adminName.trim() && adminEmail.trim() && adminPassword.trim()) {
        await systemOwner.admins.create({
          name: adminName.trim(),
          email: adminEmail.trim(),
          password: adminPassword.trim(),
          role: 'super_admin',
          company_id: companyId,
          access: { dashboard: true, attendance: true, salary: true, leaderboard: true, export: true, adjustment: true, upload: true, employees: true, bonus: true, penalty: true, absentee_alert: true, holidays: true, settings: true, manage_admins: true }
        })
      }

      setMessage(createAdmin && companyId ? 'Company and admin created.' : 'Company added.')
      setTimeout(() => navigate(companyId ? `/system-owner/companies/${companyId}` : '/system-owner/companies'), 800)
    } catch (e) {
      const d = e.response?.data
      let msg = d?.error || e.message || 'Failed to add company'
      if (d && typeof d === 'object' && !d.error) {
        const firstKey = Object.keys(d)[0]
        const firstMsg = firstKey && Array.isArray(d[firstKey]) ? d[firstKey][0] : d[firstKey]
        if (firstMsg) msg = firstMsg
      }
      setMessage(msg)
      setSaving(false)
    }
  }

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <h2 className="pageSubtitle">Add company</h2>
        {fromRequest && (
          <>
            <p className="muted" style={{ marginBottom: '0.5rem' }}>Pre-filled from registration request. You can edit any field.</p>
            {(fromRequest.extra_data && Object.keys(fromRequest.extra_data).length > 0) && (
              <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--bgMuted, #f4f4f5)', border: '1px solid var(--border, #e2e8f0)' }}>
                <strong style={{ fontSize: '0.9rem' }}>Request details (verify)</strong>
                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--textMuted, #71717a)' }}>
                  {fromRequest.extra_data.company_url && <li>Company URL: <a href={fromRequest.extra_data.company_url.startsWith('http') ? fromRequest.extra_data.company_url : `https://${fromRequest.extra_data.company_url}`} target="_blank" rel="noopener noreferrer">{fromRequest.extra_data.company_url}</a></li>}
                  {fromRequest.extra_data.type_of_business && <li>Type of business: {fromRequest.extra_data.type_of_business}</li>}
                  {(fromRequest.extra_data.gstin || fromRequest.extra_data.gst_number) && <li>GSTIN / GST No: {[fromRequest.extra_data.gstin, fromRequest.extra_data.gst_number].filter(Boolean).join(' / ')}</li>}
                  {fromRequest.extra_data.pan && <li>PAN: {fromRequest.extra_data.pan}</li>}
                  {fromRequest.extra_data.business_name_gst && <li>Business name (GST/PAN): {fromRequest.extra_data.business_name_gst}</li>}
                  {fromRequest.extra_data.aadhar && <li>Aadhar: {fromRequest.extra_data.aadhar}</li>}
                </ul>
              </div>
            )}
          </>
        )}
        {message && <p className={message.includes('created') || message === 'Company added.' ? 'success' : 'error'}>{message}</p>}
        <form onSubmit={handleSubmit} className="formStack">
          <label className="label">Name</label>
          <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="label">Code (unique short code, e.g. HQ, BR1)</label>
          <input type="text" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. HQ" required />
          <label className="label">Contact email</label>
          <input type="email" className="input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="company@example.com" />
          <label className="label">Contact phone</label>
          <input type="text" className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 234 567 8900" />
          <label className="label">Address</label>
          <textarea className="input" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, country" />
          <label className="label">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
          </label>

          <hr className="formDivider" style={{ margin: '1.25rem 0', border: 'none', borderTop: '1px solid var(--border, #e2e8f0)' }} />

          <h3 className="pageSubtitle" style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Create company admin (super admin for this company)</h3>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>Optionally create an admin who will manage this company. They will have full access for this company.</p>
          <label className="label">
            <input type="checkbox" checked={createAdmin} onChange={(e) => setCreateAdmin(e.target.checked)} /> Create admin when adding company
          </label>
          {createAdmin && (
            <>
              <label className="label">Admin name</label>
              <input type="text" className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Admin full name" />
              <label className="label">Admin email (login)</label>
              <input type="email" className="input" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@company.com" />
              <label className="label">Admin password</label>
              <input type="password" className="input" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add company'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
