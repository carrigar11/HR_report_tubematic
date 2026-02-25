import { useState, useEffect } from 'react'
import { systemOwner } from '../../api'
import './SystemOwner.css'

export default function SystemOwnerSettings() {
  const [settings, setSettings] = useState(null)
  const [smtpList, setSmtpList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [companyRegistrationEmails, setCompanyRegistrationEmails] = useState('')

  // Add/Edit SMTP form (null = closed, {} = add new, { id, ... } = edit)
  const [smtpForm, setSmtpForm] = useState(null)
  const [smtpFormServer, setSmtpFormServer] = useState('smtp.gmail.com')
  const [smtpFormPort, setSmtpFormPort] = useState(587)
  const [smtpFormUsername, setSmtpFormUsername] = useState('')
  const [smtpFormPassword, setSmtpFormPassword] = useState('')
  const [smtpFormForceSender, setSmtpFormForceSender] = useState('')
  const [smtpFormPriority, setSmtpFormPriority] = useState(0)
  const [smtpFormActive, setSmtpFormActive] = useState(true)
  const [savingSmtp, setSavingSmtp] = useState(false)

  useEffect(() => {
    let cancelled = false
    systemOwner.settings.get()
      .then((settingsRes) => {
        if (cancelled) return
        setSettings(settingsRes.data)
        setCompanyRegistrationEmails(settingsRes.data.company_registration_emails || '')
      })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.error || e.message || 'Failed to load settings') })
      .finally(() => { if (!cancelled) setLoading(false) })

    systemOwner.smtp.list()
      .then((res) => { if (!cancelled) setSmtpList(Array.isArray(res.data) ? res.data : []) })
      .catch(() => { if (!cancelled) setSmtpList([]) })
    return () => { cancelled = true }
  }, [])

  const loadSmtpList = () => {
    systemOwner.smtp.list()
      .then((res) => setSmtpList(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSmtpList([]))
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setMessage('')
    setSavingSettings(true)
    try {
      await systemOwner.settings.update({ company_registration_emails: companyRegistrationEmails.trim() })
      setMessage('Notification emails saved.')
      setSettings((prev) => ({ ...prev, company_registration_emails: companyRegistrationEmails.trim() }))
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Failed to save')
    } finally {
      setSavingSettings(false)
    }
  }

  const openAddSmtp = () => {
    setSmtpForm({})
    setSmtpFormServer('smtp.gmail.com')
    setSmtpFormPort(587)
    setSmtpFormUsername('')
    setSmtpFormPassword('')
    setSmtpFormForceSender('')
    setSmtpFormPriority(smtpList.length > 0 ? Math.max(...smtpList.map((c) => c.priority ?? 0)) + 1 : 0)
    setSmtpFormActive(true)
  }

  const openEditSmtp = (config) => {
    setSmtpForm({ id: config.id })
    setSmtpFormServer(config.smtp_server || 'smtp.gmail.com')
    setSmtpFormPort(config.smtp_port ?? 587)
    setSmtpFormUsername(config.auth_username || '')
    setSmtpFormPassword(config.auth_password || '')
    setSmtpFormForceSender(config.force_sender || '')
    setSmtpFormPriority(config.priority ?? 0)
    setSmtpFormActive(config.is_active !== false)
  }

  const closeSmtpForm = () => {
    setSmtpForm(null)
    setSmtpFormPassword('')
  }

  const handleSaveSmtpForm = async (e) => {
    e.preventDefault()
    setMessage('')
    setSavingSmtp(true)
    try {
      const payload = {
        smtp_server: smtpFormServer.trim(),
        smtp_port: parseInt(smtpFormPort, 10) || 587,
        auth_username: smtpFormUsername.trim(),
        force_sender: smtpFormForceSender.trim(),
        priority: parseInt(smtpFormPriority, 10) >= 0 ? parseInt(smtpFormPriority, 10) : 0,
        is_active: smtpFormActive,
      }
      if (smtpFormPassword) payload.auth_password = smtpFormPassword
      if (smtpForm?.id) {
        await systemOwner.smtp.update(smtpForm.id, payload)
        setMessage('SMTP config updated.')
      } else {
        await systemOwner.smtp.create(payload)
        setMessage('SMTP config added.')
      }
      closeSmtpForm()
      loadSmtpList()
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Failed to save SMTP')
    } finally {
      setSavingSmtp(false)
    }
  }

  const handleDeleteSmtp = async (id) => {
    if (!window.confirm('Delete this SMTP config? This cannot be undone.')) return
    setMessage('')
    try {
      await systemOwner.smtp.delete(id)
      setMessage('SMTP config deleted.')
      loadSmtpList()
      if (smtpForm?.id === id) closeSmtpForm()
    } catch (e) {
      setMessage(e.response?.data?.error || e.message || 'Failed to delete')
    }
  }

  if (loading) return <div className="card"><p className="muted">Loading…</p></div>
  if (error) return <div className="card"><p className="error">{error}</p></div>

  return (
    <div className="systemOwnerPage">
      {message && <div className="card"><p className={message.includes('saved') || message.includes('added') || message.includes('deleted') ? 'success' : 'error'}>{message}</p></div>}

      <div className="card systemOwnerCardSection">
        <h2 className="pageSubtitle">Company registration notification emails</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          When someone submits &quot;Register your company&quot;, a notification is sent to these addresses (comma-separated). If you didn&apos;t receive emails, ensure at least one SMTP config below is active and has valid credentials.
        </p>
        <form onSubmit={handleSaveSettings} className="formStack">
          <label className="label">Email addresses (comma-separated)</label>
          <input
            type="text"
            className="input"
            value={companyRegistrationEmails}
            onChange={(e) => setCompanyRegistrationEmails(e.target.value)}
            placeholder="admin@example.com, other@example.com"
          />
          <button type="submit" className="btn btn-primary" disabled={savingSettings} style={{ marginTop: '0.5rem' }}>
            {savingSettings ? 'Saving…' : 'Save notification emails'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="pageSubtitle">SMTP configs (system emails)</h2>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Add multiple SMTP configs. The system tries them in <strong>priority order</strong> (lower number = tried first) until one successfully sends. Used for company registration, admin welcome emails, and all system emails. For Gmail, use an App Password.
        </p>

        <table className="table" style={{ marginBottom: '1rem' }}>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Server</th>
              <th>Port</th>
              <th>Username</th>
              <th>Active</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {smtpList.length === 0 ? (
              <tr><td colSpan={6} className="muted">No SMTP configs. Add one below.</td></tr>
            ) : (
              [...smtpList]
                .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || (a.id - b.id))
                .map((c) => (
                  <tr key={c.id}>
                    <td>{c.priority ?? 0}</td>
                    <td>{c.smtp_server}</td>
                    <td>{c.smtp_port}</td>
                    <td>{c.auth_username || '—'}</td>
                    <td>{c.is_active !== false ? 'Yes' : 'No'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btnSm" onClick={() => openEditSmtp(c)}>Edit</button>
                      {' '}
                      <button type="button" className="btn btn-secondary btnSm" onClick={() => handleDeleteSmtp(c.id)}>Delete</button>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>

        {!smtpForm ? (
          <button type="button" className="btn btn-primary" onClick={openAddSmtp}>Add SMTP config</button>
        ) : (
          <form onSubmit={handleSaveSmtpForm} className="formStack" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border, #e2e8f0)' }}>
            <h3 className="pageSubtitle" style={{ fontSize: '1rem' }}>{smtpForm.id ? 'Edit SMTP config' : 'New SMTP config'}</h3>
            <label className="label">Priority (try order: 0 = first)</label>
            <input type="number" min={0} className="input" value={smtpFormPriority} onChange={(e) => setSmtpFormPriority(e.target.value)} />
            <label className="label">SMTP server</label>
            <input type="text" className="input" value={smtpFormServer} onChange={(e) => setSmtpFormServer(e.target.value)} placeholder="smtp.gmail.com" />
            <label className="label">Port</label>
            <input type="number" className="input" value={smtpFormPort} onChange={(e) => setSmtpFormPort(e.target.value)} placeholder="587" />
            <label className="label">Username (email)</label>
            <input type="text" className="input" value={smtpFormUsername} onChange={(e) => setSmtpFormUsername(e.target.value)} placeholder="your@gmail.com" />
            <label className="label">Password (leave blank to keep current)</label>
            <input type="password" className="input" value={smtpFormPassword} onChange={(e) => setSmtpFormPassword(e.target.value)} placeholder={smtpForm.id ? '••••••••' : 'App password'} autoComplete="new-password" />
            <label className="label">From address (optional)</label>
            <input type="text" className="input" value={smtpFormForceSender} onChange={(e) => setSmtpFormForceSender(e.target.value)} placeholder="noreply@yourdomain.com" />
            <label className="label">
              <input type="checkbox" checked={smtpFormActive} onChange={(e) => setSmtpFormActive(e.target.checked)} /> Active (include in try list)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={savingSmtp}>{savingSmtp ? 'Saving…' : (smtpForm.id ? 'Update' : 'Add')}</button>
              <button type="button" className="btn btn-secondary" onClick={closeSmtpForm}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
