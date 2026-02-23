import { useState } from 'react'
import { employee as employeeApi } from '../../api'
import './Settings.css'

export default function EmployeeSettings() {
  const [pwForm, setPwForm] = useState({ current: '', new: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMessage, setPwMessage] = useState('')

  let employee = { name: '', email: '', emp_code: '', company: '' }
  try {
    const stored = localStorage.getItem('hr_employee')
    if (stored) employee = { ...employee, ...JSON.parse(stored) }
  } catch (_) {}

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwMessage('')
    if (pwForm.new !== pwForm.confirm) {
      setPwMessage('New password and confirm do not match.')
      return
    }
    if (pwForm.new.length < 6) {
      setPwMessage('New password must be at least 6 characters.')
      return
    }
    setPwSaving(true)
    try {
      await employeeApi.changePassword(pwForm.current, pwForm.new)
      setPwForm({ current: '', new: '', confirm: '' })
      setPwMessage('Password updated successfully.')
    } catch (err) {
      setPwMessage(err.response?.data?.error || 'Failed to update password.')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="employeeSettingsPage">
      <section className="settingsSection card">
        <h3 className="settingsSectionTitle">Account</h3>
        <dl className="settingsDl">
          <div>
            <dt>Name</dt>
            <dd>{employee.name || '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{employee.email || '—'}</dd>
          </div>
          <div>
            <dt>Employee code</dt>
            <dd>{employee.emp_code || '—'}</dd>
          </div>
          {employee.company && (
            <div>
              <dt>Company</dt>
              <dd>{employee.company}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="settingsSection card">
        <h3 className="settingsSectionTitle">Change password</h3>
        <form onSubmit={handleChangePassword} className="settingsPasswordForm">
          <div className="formGroup">
            <label className="label">Current password</label>
            <input
              type="password"
              className="input"
              value={pwForm.current}
              onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="formGroup">
            <label className="label">New password</label>
            <input
              type="password"
              className="input"
              value={pwForm.new}
              onChange={(e) => setPwForm((f) => ({ ...f, new: e.target.value }))}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="formGroup">
            <label className="label">Confirm new password</label>
            <input
              type="password"
              className="input"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={pwSaving}>
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
          {pwMessage && <p className={`settingsMessage ${pwMessage.includes('success') ? 'success' : 'error'}`}>{pwMessage}</p>}
        </form>
      </section>
    </div>
  )
}
