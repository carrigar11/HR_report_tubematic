import { useState, useEffect } from 'react'
import { settings, runRewardEngine, admins, smtpConfig } from '../api'
import { IconUser, IconSettings, IconTrophy, IconMail } from '../components/Icons'
import './Table.css'
import './SystemSettings.css'

const KEY_LABELS = {
  streak_days: 'Consecutive present days for streak reward',
  weekly_overtime_threshold_hours: 'Min weekly OT hours for reward',
  absent_streak_days: 'Consecutive absent days for red flag',
}

export default function SystemSettings() {
  const [admin, setAdmin] = useState(null)
  const [adminLoading, setAdminLoading] = useState(true)
  const [adminEdit, setAdminEdit] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminSaveLoading, setAdminSaveLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState({})
  const [runLoading, setRunLoading] = useState(false)
  const [runResult, setRunResult] = useState('')

  const [smtp, setSmtp] = useState(null)
  const [smtpLoading, setSmtpLoading] = useState(true)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpMessage, setSmtpMessage] = useState('')
  const [smtpForm, setSmtpForm] = useState({
    smtp_server: '',
    smtp_port: 587,
    auth_username: '',
    auth_password: '',
    force_sender: '',
    error_logfile: '',
    debug_logfile: '',
    is_active: true,
  })

  const adminId = (() => {
    try {
      const s = localStorage.getItem('hr_admin')
      if (!s) return null
      const a = JSON.parse(s)
      return a.id
    } catch (_) {
      return null
    }
  })()

  useEffect(() => {
    if (!adminId) {
      setAdminLoading(false)
      return
    }
    admins.get(adminId)
      .then((r) => {
        setAdmin(r.data)
        setAdminName(r.data.name || '')
        setAdminEmail(r.data.email || '')
        setAdminPassword('')
      })
      .catch(() => setAdmin(null))
      .finally(() => setAdminLoading(false))
  }, [adminId])

  useEffect(() => {
    settings.list()
      .then((r) => setList(r.data.results ?? r.data ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    smtpConfig.get()
      .then((r) => {
        const d = r.data
        setSmtp(d)
        setSmtpForm({
          smtp_server: d.smtp_server || '',
          smtp_port: d.smtp_port ?? 587,
          auth_username: d.auth_username || '',
          auth_password: d.auth_password || '',
          force_sender: d.force_sender || '',
          error_logfile: d.error_logfile || '',
          debug_logfile: d.debug_logfile || '',
          is_active: d.is_active !== false,
        })
      })
      .catch(() => setSmtp(null))
      .finally(() => setSmtpLoading(false))
  }, [])

  const handleSaveProfile = async () => {
    if (!adminId) return
    setAdminSaveLoading(true)
    setAdminMessage('')
    try {
      const payload = { name: adminName.trim() }
      if (adminEmail.trim()) payload.email = adminEmail.trim()
      if (adminPassword) payload.password = adminPassword
      const { data } = await admins.update(adminId, payload)
      setAdmin(data)
      setAdminEdit(false)
      setAdminPassword('')
      const stored = JSON.parse(localStorage.getItem('hr_admin') || '{}')
      stored.name = data.name
      stored.email = data.email
      localStorage.setItem('hr_admin', JSON.stringify(stored))
      setAdminMessage('Profile updated.')
    } catch (err) {
      setAdminMessage(err.response?.data?.detail || err.message || 'Failed to update')
    } finally {
      setAdminSaveLoading(false)
    }
  }

  const handleCancelEdit = () => {
    setAdminEdit(false)
    setAdminName(admin?.name || '')
    setAdminEmail(admin?.email || '')
    setAdminPassword('')
  }

  const handleSave = async (key) => {
    const value = editing[key]
    if (value === undefined) return
    try {
      await settings.update(key, { value: String(value) })
      setEditing((e) => ({ ...e, [key]: undefined }))
      const { data } = await settings.list()
      setList(data.results ?? data ?? [])
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Failed')
    }
  }

  const handleRunEngine = async () => {
    setRunLoading(true)
    setRunResult('')
    try {
      const { data } = await runRewardEngine()
      setRunResult(`Created: streak=${data.created?.streak ?? 0}, overtime=${data.created?.overtime ?? 0}, absentee=${data.created?.absentee ?? 0}`)
    } catch (err) {
      setRunResult('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
      setRunLoading(false)
    }
  }

  const handleSaveSmtp = async (e) => {
    e.preventDefault()
    if (!smtp?.id) {
      setSmtpMessage('No SMTP config to update. Add one in Django Admin first.')
      return
    }
    setSmtpSaving(true)
    setSmtpMessage('')
    try {
      const payload = {
        id: smtp.id,
        smtp_server: smtpForm.smtp_server.trim() || 'smtp.gmail.com',
        smtp_port: Number(smtpForm.smtp_port) || 587,
        auth_username: smtpForm.auth_username.trim(),
        force_sender: smtpForm.force_sender.trim(),
        error_logfile: smtpForm.error_logfile.trim(),
        debug_logfile: smtpForm.debug_logfile.trim(),
        is_active: smtpForm.is_active,
      }
      if (smtpForm.auth_password) payload.auth_password = smtpForm.auth_password
      const { data } = await smtpConfig.update(payload)
      setSmtp(data)
      setSmtpForm((f) => ({ ...f, auth_password: '' }))
      setSmtpMessage('SMTP config saved.')
    } catch (err) {
      setSmtpMessage(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to save')
    } finally {
      setSmtpSaving(false)
    }
  }

  return (
    <div className="pageContent settingsPage">
      <div className="settingsPageHeader">
        <h2 className="settingsPageTitle">Settings</h2>
        <p className="settingsPageTagline">Manage your account, system options, and reward rules.</p>
      </div>

      {/* Admin profile */}
      <section className="settingsSection card settingsSectionProfile">
        <div className="profileSectionHead">
          <div className="settingsSectionTitleRow">
            <span className="settingsSectionIcon settingsSectionIconProfile"><IconUser /></span>
            <div>
                <h3 className="settingsSectionTitle">Admin profile</h3>
              <p className="muted settingsSectionDesc">Your account details. Click Edit to change name, email or password.</p>
            </div>
          </div>
          {!adminLoading && admin && !adminEdit && (
            <button type="button" className="btn btn-secondary btnEdit" onClick={() => setAdminEdit(true)}>
              Edit
            </button>
          )}
        </div>
        {adminLoading ? (
          <p className="muted">Loading…</p>
        ) : admin ? (
          <div className="profileForm">
            <div className="profileField">
              <label className="label">Name</label>
              {adminEdit ? (
                <input
                  type="text"
                  className="input"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  style={{ maxWidth: 320 }}
                />
              ) : (
                <div className="profileFieldRead">
                  <span className="profileValue">{admin.name || '—'}</span>
                </div>
              )}
            </div>
            <div className="profileField">
              <label className="label">Email</label>
              {adminEdit ? (
                <input
                  type="email"
                  className="input"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  style={{ maxWidth: 320 }}
                />
              ) : (
                <div className="profileFieldRead">
                  <span className="profileValue profileValueReadOnly">{admin.email || '—'}</span>
                </div>
              )}
            </div>
            <div className="profileField">
              <label className="label">Password</label>
              {adminEdit ? (
                <input
                  type="password"
                  className="input"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  style={{ maxWidth: 320 }}
                />
              ) : (
                <div className="profileFieldRead">
                  <span className="profileValue profileValueReadOnly">{admin.password ? '••••••••' : '—'}</span>
                </div>
              )}
            </div>
            {adminEdit && (
              <div className="profileFormActions">
                <button type="button" className="btn btn-primary" onClick={handleSaveProfile} disabled={adminSaveLoading}>
                  {adminSaveLoading ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">Could not load profile. Log in again.</p>
        )}
        {adminMessage && <p className={`profileMessage ${adminMessage.includes('Failed') ? 'error' : 'success'}`}>{adminMessage}</p>}
      </section>

      {/* System settings */}
      <section className="settingsSection card settingsSectionSystem">
        <div className="settingsSectionTitleRow">
          <span className="settingsSectionIcon settingsSectionIconSystem"><IconSettings /></span>
          <div>
            <h3 className="settingsSectionTitle">System settings</h3>
            <p className="muted settingsSectionDesc">Configure auto-reward thresholds (e.g. 4-day streak).</p>
          </div>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="systemSettingsTableWrap">
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Description</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(list) ? list : []).map((row) => (
                  <tr key={row.id}>
                    <td><code>{row.key}</code></td>
                    <td>{KEY_LABELS[row.key] || row.description || '—'}</td>
                    <td>
                      {editing[row.key] !== undefined ? (
                        <input
                          type="text"
                          className="input"
                          value={editing[row.key]}
                          onChange={(e) => setEditing((e2) => ({ ...e2, [row.key]: e.target.value }))}
                          style={{ width: 120 }}
                        />
                      ) : (
                        row.value
                      )}
                    </td>
                    <td>
                      {editing[row.key] !== undefined ? (
                        <button type="button" className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => handleSave(row.key)}>Save</button>
                      ) : (
                        <button type="button" className="btn btn-secondary" onClick={() => setEditing((e) => ({ ...e, [row.key]: row.value }))}>Edit</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Email SMTP config */}
      <section className="settingsSection card settingsSectionSmtp">
        <div className="settingsSectionTitleRow">
          <span className="settingsSectionIcon settingsSectionIconSmtp"><IconMail /></span>
          <div>
            <h3 className="settingsSectionTitle">Email SMTP (send mail)</h3>
            <p className="muted settingsSectionDesc">SMTP credentials used to push email. Change and save below.</p>
          </div>
        </div>
        {smtpLoading ? (
          <p className="muted">Loading…</p>
        ) : !smtp ? (
          <p className="muted">No SMTP config found. Add one in Django Admin (Core → Email SMTP configs) or run migrations.</p>
        ) : (
          <form onSubmit={handleSaveSmtp} className="smtpForm">
            <div className="smtpFormRow">
              <div className="profileField">
                <label className="label">SMTP server</label>
                <input type="text" className="input" value={smtpForm.smtp_server} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_server: e.target.value }))} placeholder="smtp.gmail.com" />
              </div>
              <div className="profileField" style={{ maxWidth: 100 }}>
                <label className="label">Port</label>
                <input type="number" className="input" value={smtpForm.smtp_port} onChange={(e) => setSmtpForm((f) => ({ ...f, smtp_port: e.target.value }))} min={1} max={65535} />
              </div>
            </div>
            <div className="profileField">
              <label className="label">Auth username (email)</label>
              <input type="text" className="input" value={smtpForm.auth_username} onChange={(e) => setSmtpForm((f) => ({ ...f, auth_username: e.target.value }))} placeholder="your@gmail.com" />
            </div>
            <div className="profileField">
              <label className="label">Auth password</label>
              <input type="password" className="input" value={smtpForm.auth_password} onChange={(e) => setSmtpForm((f) => ({ ...f, auth_password: e.target.value }))} placeholder="Leave blank to keep current" />
            </div>
            <div className="profileField">
              <label className="label">Force sender (optional)</label>
              <input type="text" className="input" value={smtpForm.force_sender} onChange={(e) => setSmtpForm((f) => ({ ...f, force_sender: e.target.value }))} placeholder="From address" />
            </div>
            <div className="smtpFormRow">
              <div className="profileField">
                <label className="label">Error log file</label>
                <input type="text" className="input" value={smtpForm.error_logfile} onChange={(e) => setSmtpForm((f) => ({ ...f, error_logfile: e.target.value }))} placeholder="error.log" />
              </div>
              <div className="profileField">
                <label className="label">Debug log file</label>
                <input type="text" className="input" value={smtpForm.debug_logfile} onChange={(e) => setSmtpForm((f) => ({ ...f, debug_logfile: e.target.value }))} placeholder="debug.log" />
              </div>
            </div>
            <div className="profileField smtpFormActive">
              <label className="label checkboxLabel">
                <input type="checkbox" checked={smtpForm.is_active} onChange={(e) => setSmtpForm((f) => ({ ...f, is_active: e.target.checked }))} />
                <span>Use this config when sending email</span>
              </label>
            </div>
            <div className="profileFormActions">
              <button type="submit" className="btn btn-primary" disabled={smtpSaving}>{smtpSaving ? 'Saving…' : 'Save SMTP config'}</button>
            </div>
            {smtpMessage && <p className={`profileMessage ${smtpMessage.includes('Failed') || smtpMessage.includes('No SMTP') ? 'error' : 'success'}`}>{smtpMessage}</p>}
          </form>
        )}
      </section>

      <section className="settingsSection card settingsSectionReward">
        <div className="settingsSectionTitleRow">
          <span className="settingsSectionIcon settingsSectionIconReward"><IconTrophy /></span>
          <div>
            <h3 className="settingsSectionTitle">Reward engine</h3>
            <p className="muted settingsSectionDesc">Run the automation manually (streak, weekly OT, absentee flags).</p>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleRunEngine} disabled={runLoading}>
          {runLoading ? 'Running…' : 'Run reward engine now'}
        </button>
        {runResult && <p className="runResult">{runResult}</p>}
      </section>
    </div>
  )
}
