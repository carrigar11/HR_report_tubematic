import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { auth, employeeAuth, config } from '../api'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('admin') // 'admin' | 'employee'
  const [employeeLoginEnabled, setEmployeeLoginEnabled] = useState(true)
  const [email, setEmail] = useState('admin@gmail.com')
  const [password, setPassword] = useState('123456789')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [companyChoice, setCompanyChoice] = useState(null) // { requires_company_choice: true, employees: [...] }

  useEffect(() => {
    config.get()
      .then((r) => setEmployeeLoginEnabled(r.data.employee_login_enabled !== false))
      .catch(() => setEmployeeLoginEnabled(false))
      .finally(() => setConfigLoading(false))
  }, [])

  const handleEmployeeLoginSuccess = (data) => {
    localStorage.removeItem('hr_admin')
    localStorage.setItem('hr_employee', JSON.stringify(data.employee))
    if (data.access) localStorage.setItem('hr_access_token', data.access)
    if (data.refresh) localStorage.setItem('hr_refresh_token', data.refresh)
    navigate('/employee/dashboard')
  }

  const handleSelectCompany = async (empCode) => {
    setError('')
    setLoading(true)
    try {
      const identifier = email.trim()
      const { data } = await employeeAuth.selectCompany(identifier, password, empCode)
      if (data.success && data.employee) {
        setCompanyChoice(null)
        handleEmployeeLoginSuccess(data)
      } else {
        setError(data.message || 'Failed to sign in')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setCompanyChoice(null)
    setLoading(true)
    try {
      if (mode === 'employee') {
        const { data } = await employeeAuth.login(email.trim(), password)
        if (data.success && data.requires_company_choice && data.employees?.length) {
          setCompanyChoice({ employees: data.employees })
        } else if (data.success && data.employee) {
          handleEmployeeLoginSuccess(data)
        } else {
          setError(data.message || 'Login failed')
        }
      } else {
        const { data } = await auth.login(email, password)
        if (data.success && data.admin) {
          localStorage.removeItem('hr_employee')
          const admin = { ...data.admin, is_system_owner: Boolean(data.admin.is_system_owner) }
          localStorage.setItem('hr_admin', JSON.stringify(admin))
          if (data.access) localStorage.setItem('hr_access_token', data.access)
          if (data.refresh) localStorage.setItem('hr_refresh_token', data.refresh)
          if (admin.is_system_owner) {
            navigate('/system-owner', { replace: true })
          } else {
            navigate('/', { replace: true })
          }
        } else {
          setError(data.message || 'Login failed')
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="loginPage">
      <div className="loginCard card">
        <h1 className="loginTitle">HR Attendance</h1>
        {!configLoading && employeeLoginEnabled && (
          <div className="loginToggleWrap">
            <button
              type="button"
              className={`loginToggleBtn ${mode === 'employee' ? 'active' : ''}`}
              onClick={() => { setMode('employee'); setError('') }}
            >
              Employee
            </button>
            <button
              type="button"
              className={`loginToggleBtn ${mode === 'admin' ? 'active' : ''}`}
              onClick={() => { setMode('admin'); setError('') }}
            >
              Admin
            </button>
          </div>
        )}
        <p className="loginSub">{mode === 'employee' ? 'Employee sign in' : 'Admin sign in'}</p>
        <form onSubmit={handleSubmit} className="loginForm">
          {error && <div className="loginError">{error}</div>}
          {mode === 'employee' ? (
            <>
              <label className="label">Email or phone number</label>
              <input
                type="text"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com or 9876543210"
                autoComplete="username"
                required
              />
            </>
          ) : (
            <>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </>
          )}
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary loginBtn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {mode === 'admin' && (
          <p className="loginRegisterLink">
            <Link to="/register-company">Register your company</Link>
          </p>
        )}

        {mode === 'employee' && companyChoice && companyChoice.employees?.length > 0 && (
          <div className="loginCompanyChoiceOverlay" onClick={() => !loading && setCompanyChoice(null)}>
            <div className="loginCompanyChoiceCard" onClick={(ev) => ev.stopPropagation()}>
              <div className="loginCompanyChoiceHeader">
                <span className="loginCompanyChoiceIcon" aria-hidden>🏢</span>
                <h3 className="loginCompanyChoiceTitle">Select company</h3>
                <p className="loginCompanyChoiceSub">
                  You work in more than one company. Choose which one to view.
                </p>
              </div>
              <ul className="loginCompanyChoiceList">
                {companyChoice.employees.map((emp) => (
                  <li key={emp.emp_code}>
                    <button
                      type="button"
                      className="loginCompanyChoiceBtn"
                      onClick={() => handleSelectCompany(emp.emp_code)}
                      disabled={loading}
                    >
                      <span className="loginCompanyChoiceBtnName">{emp.company_name}</span>
                      {emp.company_code !== '—' && (
                        <span className="loginCompanyChoiceBtnCode">{emp.company_code}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="loginCompanyChoiceFooter">
                <button type="button" className="loginCompanyChoiceCancel" onClick={() => setCompanyChoice(null)} disabled={loading}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
