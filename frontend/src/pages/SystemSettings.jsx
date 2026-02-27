import { useState, useEffect } from 'react'
import { settings, runRewardEngine, admins, smtpConfig, googleSheet, plantReportEmail } from '../api'
import { IconUser, IconSettings, IconTrophy, IconMail, IconExport } from '../components/Icons'
import './Table.css'
import './SystemSettings.css'

const KEY_LABELS = {
  streak_days: 'Consecutive present days for streak reward',
  weekly_overtime_threshold_hours: 'Min weekly OT hours for reward',
  absent_streak_days: 'Consecutive absent days for red flag',
  penalty_rate_per_minute_rs: 'Rs per minute late (until monthly threshold)',
  penalty_monthly_threshold_rs: 'Monthly penalty threshold (Rs); after this, higher rate applies',
  penalty_rate_after_threshold_rs: 'Rs per minute late after monthly threshold',
  shift_ot_min_hours: 'Min work hours in a day before shift OT bonus applies',
  shift_ot_extra_hours_for_1_bonus: 'Every X extra hours = 1 bonus hour (e.g. 2)',
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

  const [googleSheetId, setGoogleSheetId] = useState('')
  const [googleSheetLastSync, setGoogleSheetLastSync] = useState(null)
  const [googleSheetLoading, setGoogleSheetLoading] = useState(true)
  const [googleSheetSaving, setGoogleSheetSaving] = useState(false)
  const [googleSheetSyncing, setGoogleSheetSyncing] = useState(false)
  const [googleSheetMessage, setGoogleSheetMessage] = useState('')

  const [plantReportLoading, setPlantReportLoading] = useState(true)
  const [plantReportRecipients, setPlantReportRecipients] = useState([])
  const [plantReportSendTime, setPlantReportSendTime] = useState('06:00')
  const [plantReportEnabled, setPlantReportEnabled] = useState(true)
  const [plantReportLastSent, setPlantReportLastSent] = useState(null)
  const [plantReportMaamAmount, setPlantReportMaamAmount] = useState('')
  const [plantReportNewEmail, setPlantReportNewEmail] = useState('')
  const [plantReportSaving, setPlantReportSaving] = useState(false)
  const [plantReportSendNowLoading, setPlantReportSendNowLoading] = useState(false)
  const [plantReportMessage, setPlantReportMessage] = useState('')
  const [plantReportActionOpen, setPlantReportActionOpen] = useState(null)

  useEffect(() => {
    if (plantReportActionOpen == null) return
    const close = (e) => {
      if (e.target.closest('.plantReportRecipientActionsWrap')) return
      setPlantReportActionOpen(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [plantReportActionOpen])

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

  // Full access: super_admin or (manage_admins + settings). Use fetched admin; fallback to localStorage (login response has role/access).
  const storedAdmin = (() => {
    try {
      const s = localStorage.getItem('hr_admin')
      return s ? JSON.parse(s) : null
    } catch (_) { return null }
  })()
  const effectiveAdmin = admin || storedAdmin
  const hasFullAccess = effectiveAdmin && (effectiveAdmin.role === 'super_admin' || (effectiveAdmin.access?.manage_admins && effectiveAdmin.access?.settings))

  useEffect(() => {
    if (!hasFullAccess) {
      setLoading(false)
      return
    }
    settings.list()
      .then((r) => setList(r.data.results ?? r.data ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [hasFullAccess])

  // Email SMTP section hidden — skip fetch to avoid unnecessary API call
  useEffect(() => {
    setSmtpLoading(false)
  }, [])

  useEffect(() => {
    if (!hasFullAccess) {
      setGoogleSheetLoading(false)
      return
    }
    googleSheet.getConfig()
      .then((r) => {
        setGoogleSheetId(r.data.google_sheet_id || '')
        setGoogleSheetLastSync(r.data.last_sync || null)
      })
      .catch(() => {})
      .finally(() => setGoogleSheetLoading(false))
  }, [hasFullAccess])

  useEffect(() => {
    plantReportEmail.getConfig()
      .then((r) => {
        const d = r.data
        setPlantReportRecipients(d.recipients || [])
        setPlantReportSendTime(d.send_time || '06:00')
        setPlantReportEnabled(d.enabled !== false)
        setPlantReportLastSent(d.last_sent || null)
        setPlantReportMaamAmount(d.maam_amount != null && d.maam_amount !== '' ? String(d.maam_amount) : '')
      })
      .catch(() => {})
      .finally(() => setPlantReportLoading(false))
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

  const handleSaveGoogleSheetConfig = async (e) => {
    e.preventDefault()
    setGoogleSheetSaving(true)
    setGoogleSheetMessage('')
    try {
      const { data } = await googleSheet.updateConfig({ google_sheet_id: googleSheetId.trim() })
      setGoogleSheetId(data.google_sheet_id || '')
      setGoogleSheetMessage('Google Sheet ID saved.')
    } catch (err) {
      setGoogleSheetMessage(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to save')
    } finally {
      setGoogleSheetSaving(false)
    }
  }

  const handleSyncGoogleSheet = async () => {
    setGoogleSheetSyncing(true)
    setGoogleSheetMessage('')
    try {
      const { data } = await googleSheet.sync()
      setGoogleSheetLastSync(data.last_sync || null)
      setGoogleSheetMessage(data.message || 'Sync completed.')
    } catch (err) {
      const res = err.response?.data
      setGoogleSheetMessage(res?.message || res?.error || res?.detail || err.message || 'Sync failed')
    } finally {
      setGoogleSheetSyncing(false)
    }
  }

  const handleSavePlantReportConfig = async (e) => {
    e.preventDefault()
    setPlantReportSaving(true)
    setPlantReportMessage('')
    try {
      const { data } = await plantReportEmail.updateConfig({
        send_time: plantReportSendTime.trim() || '06:00',
        enabled: plantReportEnabled,
        maam_amount: plantReportMaamAmount.trim() === '' ? '' : plantReportMaamAmount.trim(),
      })
      setPlantReportRecipients(data.recipients || [])
      setPlantReportSendTime(data.send_time || '06:00')
      setPlantReportEnabled(data.enabled !== false)
      setPlantReportLastSent(data.last_sent || null)
      setPlantReportMaamAmount(data.maam_amount != null && data.maam_amount !== '' ? String(data.maam_amount) : '')
      setPlantReportMessage('Time and options saved.')
    } catch (err) {
      setPlantReportMessage(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to save')
    } finally {
      setPlantReportSaving(false)
    }
  }

  const handleAddPlantReportRecipient = async (e) => {
    e.preventDefault()
    const email = plantReportNewEmail.trim().toLowerCase()
    if (!email) return
    setPlantReportSaving(true)
    setPlantReportMessage('')
    try {
      const { data } = await plantReportEmail.addRecipient(email)
      setPlantReportRecipients((prev) => [...prev.filter((r) => r.email !== data.email), data].sort((a, b) => (a.email || '').localeCompare(b.email || '')))
      setPlantReportNewEmail('')
      setPlantReportMessage('Recipient added.')
    } catch (err) {
      setPlantReportMessage(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to add')
    } finally {
      setPlantReportSaving(false)
    }
  }

  const handleTogglePlantReportSend = async (r) => {
    const next = !(r.is_active !== false)
    setPlantReportSaving(true)
    setPlantReportMessage('')
    try {
      const { data } = await plantReportEmail.updateRecipient(r.id, { is_active: next })
      setPlantReportRecipients((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: data.is_active } : x)))
      setPlantReportMessage(next ? 'Recipient will receive daily email.' : 'Recipient excluded from daily email.')
    } catch (err) {
      setPlantReportMessage(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to update')
    } finally {
      setPlantReportSaving(false)
    }
  }

  const handleRemovePlantReportRecipient = async (id) => {
    setPlantReportSaving(true)
    setPlantReportMessage('')
    try {
      await plantReportEmail.removeRecipient(id)
      setPlantReportRecipients((prev) => prev.filter((r) => r.id !== id))
      setPlantReportMessage('Recipient removed.')
    } catch (err) {
      setPlantReportMessage(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to remove')
    } finally {
      setPlantReportSaving(false)
    }
  }

  const handlePlantReportSendNow = async () => {
    setPlantReportSendNowLoading(true)
    setPlantReportMessage('')
    try {
      // Always send current Ma'am amount so it is saved in DB and used for difference in email
      const payload = { maam_amount: plantReportMaamAmount.trim() || '' }
      const { data } = await plantReportEmail.sendNow(payload)
      if (data.last_sent) setPlantReportLastSent(data.last_sent)
      setPlantReportMessage(data.message || (data.success ? 'Email sent.' : 'Send failed.'))
    } catch (err) {
      const res = err.response?.data
      setPlantReportMessage(res?.message || res?.error || res?.detail || err.message || 'Send failed')
    } finally {
      setPlantReportSendNowLoading(false)
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

      {/* System settings — full access only (super_admin or manage_admins + settings) */}
      {hasFullAccess && (
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
      )}

      {/* Email SMTP (send mail) — hidden from admin Settings UI */}

      {/* Google Sheet live sync — full access only */}
      {hasFullAccess && (
      <section className="settingsSection card settingsSectionGoogleSheet">
        <div className="settingsSectionTitleRow">
          <span className="settingsSectionIcon settingsSectionIconSmtp"><IconExport /></span>
          <div>
            <h3 className="settingsSectionTitle">Google Sheet live sync</h3>
            <p className="muted settingsSectionDesc">Push reports to a Google Sheet (5 sheets: all dates by month, current year, previous day plant report, employees, department payroll). Set Sheet ID and share the sheet with your service account as Editor.</p>
          </div>
        </div>
        {googleSheetLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <form onSubmit={handleSaveGoogleSheetConfig} className="smtpForm">
            <div className="profileField">
              <label className="label">Google Sheet ID</label>
              <input
                type="text"
                className="input"
                value={googleSheetId}
                onChange={(e) => setGoogleSheetId(e.target.value)}
                placeholder="e.g. 1iASMoxgrQosow9_l566HweLauU7"
                style={{ maxWidth: 420 }}
              />
              <p className="muted" style={{ marginTop: 6 }}>From the sheet URL: https://docs.google.com/spreadsheets/d/<strong>SHEET_ID</strong>/edit</p>
            </div>
            <div className="profileFormActions">
              <button type="submit" className="btn btn-primary" disabled={googleSheetSaving}>
                {googleSheetSaving ? 'Saving…' : 'Save Sheet ID'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleSyncGoogleSheet} disabled={googleSheetSyncing}>
                {googleSheetSyncing ? 'Syncing…' : 'Push to Google Sheet now'}
              </button>
            </div>
            {googleSheetLastSync && <p className="muted">Last sync: {new Date(googleSheetLastSync).toLocaleString()}</p>}
            {googleSheetMessage && <p className={`profileMessage ${googleSheetMessage.includes('Failed') || googleSheetMessage.includes('Error') ? 'error' : 'success'}`}>{googleSheetMessage}</p>}
          </form>
        )}
      </section>
      )}

      {/* Plant Report (Previous day) daily email */}
      <section className="settingsSection card settingsSectionGoogleSheet">
        <div className="settingsSectionTitleRow">
          <span className="settingsSectionIcon settingsSectionIconSmtp"><IconMail /></span>
          <div>
            <h3 className="settingsSectionTitle">Plant Report daily email</h3>
            <p className="muted settingsSectionDesc">Send the Plant Report (Previous day) Excel every day at the set time. Add emails below; use the checkbox to choose whom to send to (uncheck to keep in list but exclude from daily send). Requires SMTP configured above.</p>
          </div>
        </div>
        {plantReportLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="profileField plantReportRecipientsBlock">
              <label className="label">Recipients</label>
              <p className="muted plantReportRecipientsHint">Use the action menu on each row to include in daily send or remove from list.</p>
              <div className="plantReportRecipientListWrap">
                {(plantReportRecipients || []).length === 0 ? (
                  <div className="plantReportRecipientEmpty">No recipients yet. Add an email below.</div>
                ) : (
                  <>
                    <div className="plantReportRecipientHeader">
                      <span className="plantReportRecipientColEmail">Email</span>
                      <span className="plantReportRecipientColAction" />
                    </div>
                    <ul className="plantReportRecipientList">
                      {(plantReportRecipients || []).map((r) => (
                        <li key={r.id} className={r.is_active !== false ? '' : 'plantReportRecipientExcluded'}>
                          <span className="plantReportRecipientColEmail">{r.email}</span>
                          <span className="plantReportRecipientColAction">
                            <div className="plantReportRecipientActionsWrap">
                              <button
                                type="button"
                                className="plantReportRecipientActionBtn"
                                onClick={() => setPlantReportActionOpen(plantReportActionOpen === r.id ? null : r.id)}
                                disabled={plantReportSaving}
                                title="Actions"
                              >
                                {r.is_active !== false ? '✓ Send' : 'Send'}
                                <span className="plantReportRecipientActionArrow">▾</span>
                              </button>
                              {plantReportActionOpen === r.id && (
                                <div className="plantReportRecipientDropdown">
                                  <button
                                    type="button"
                                    className="plantReportRecipientDropdownItem"
                                    onClick={() => { handleTogglePlantReportSend(r); setPlantReportActionOpen(null) }}
                                    disabled={plantReportSaving}
                                  >
                                    {r.is_active !== false ? '✓ Send daily' : 'Send daily'}
                                  </button>
                                  <button
                                    type="button"
                                    className="plantReportRecipientDropdownItem plantReportRecipientDropdownItemDanger"
                                    onClick={() => { handleRemovePlantReportRecipient(r.id); setPlantReportActionOpen(null) }}
                                    disabled={plantReportSaving}
                                  >
                                    Remove from list
                                  </button>
                                </div>
                              )}
                            </div>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <form onSubmit={handleAddPlantReportRecipient} className="plantReportRecipientAddForm">
                <input
                  type="email"
                  className="input"
                  value={plantReportNewEmail}
                  onChange={(e) => setPlantReportNewEmail(e.target.value)}
                  placeholder="Email address"
                />
                <button type="submit" className="btn btn-primary" disabled={plantReportSaving}>Add recipient</button>
              </form>
            </div>
            <form onSubmit={handleSavePlantReportConfig} className="smtpForm">
              <div className="smtpFormRow">
                <div className="profileField">
                  <label className="label">Send time (24h)</label>
                  <input
                    type="time"
                    className="input"
                    value={plantReportSendTime}
                    onChange={(e) => setPlantReportSendTime(e.target.value)}
                    style={{ width: 120 }}
                  />
                </div>
                <div className="profileField smtpFormActive">
                  <label className="label checkboxLabel">
                    <input type="checkbox" checked={plantReportEnabled} onChange={(e) => setPlantReportEnabled(e.target.checked)} />
                    <span>Send daily at this time</span>
                  </label>
                </div>
              </div>
              <div className="profileFormActions" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
                <div className="profileField" style={{ marginBottom: 0 }}>
                  <label className="label">Ma'am amount (for difference)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={plantReportMaamAmount}
                    onChange={(e) => setPlantReportMaamAmount(e.target.value)}
                    placeholder="Final total as per Ma'am"
                    style={{ width: 180 }}
                    title="Email will include: Ma'am amount − (Total Salary + OT bonus (rs))"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={plantReportSaving}>
                  {plantReportSaving ? 'Saving…' : 'Save time & options'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handlePlantReportSendNow} disabled={plantReportSendNowLoading}>
                  {plantReportSendNowLoading ? 'Sending…' : 'Send now'}
                </button>
              </div>
              <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>Difference in email = Ma'am amount − (Total Salary + OT bonus (rs)) from Plant Report. Send now uses the amount in the box and includes the difference (no need to Save first).</p>
            </form>
            {plantReportLastSent && (
              <p className="muted">
                Last sent: {plantReportLastSent.length >= 10
                  ? new Date(plantReportLastSent + (plantReportLastSent.includes('T') ? '' : 'T12:00:00')).toLocaleString()
                  : plantReportLastSent}
              </p>
            )}
            {plantReportMessage && <p className={`profileMessage ${plantReportMessage.includes('Failed') || plantReportMessage.includes('Error') ? 'error' : 'success'}`}>{plantReportMessage}</p>}
          </>
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
