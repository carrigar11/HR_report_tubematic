import { useState, useEffect } from 'react'
import { settings, runRewardEngine, admins } from '../api'
import { IconUser, IconSettings, IconTrophy } from '../components/Icons'
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
