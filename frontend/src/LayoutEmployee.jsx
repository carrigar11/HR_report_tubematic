import { useState, useRef, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  IconDashboard,
  IconCalendar,
  IconHoliday,
  IconUser,
  IconMoney,
  IconAlert,
  IconLogout,
  IconSettings,
  IconChevronDown,
  IconMenu,
  IconClock,
  IconTrophy,
  IconExport,
} from './components/Icons'
import './Layout.css'
import './LayoutEmployee.css'

const nav = [
  { to: '/employee/dashboard', label: 'Dashboard', icon: IconDashboard },
  { to: '/employee/attendance', label: 'Attendance', icon: IconCalendar },
  { to: '/employee/leave', label: 'Leave', icon: IconHoliday },
  { to: '/employee/details', label: 'My details', icon: IconUser },
  { to: '/employee/salary-summary', label: 'Salary summary', icon: IconMoney },
  { to: '/employee/payslips', label: 'Payslips', icon: IconExport },
  { to: '/employee/shift', label: 'My shift', icon: IconClock },
  { to: '/employee/rewards', label: 'My rewards', icon: IconTrophy },
  { to: '/employee/penalty', label: 'Penalty', icon: IconAlert },
  { to: '/employee/settings', label: 'Settings', icon: IconSettings },
]

const pathToTitle = {
  '/employee/dashboard': 'Dashboard',
  '/employee/attendance': 'Attendance',
  '/employee/leave': 'Leave',
  '/employee/details': 'My details',
  '/employee/salary-summary': 'Salary summary',
  '/employee/payslips': 'Payslips',
  '/employee/shift': 'My shift',
  '/employee/rewards': 'My rewards',
  '/employee/penalty': 'Penalty',
  '/employee/settings': 'Settings',
}

function getPageTitle(pathname) {
  for (const path of Object.keys(pathToTitle)) {
    if (pathname === path || pathname.startsWith(path + '/')) return pathToTitle[path]
  }
  return 'Employee'
}

export default function LayoutEmployee() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const hoverTimer = useRef(null)
  const pinned = useRef(false)

  const sidebarExpanded = sidebarOpen
  const pageTitle = getPageTitle(location.pathname)

  const handleMouseEnter = useCallback(() => {
    if (pinned.current) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setSidebarOpen(true), 100)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (pinned.current) return
    clearTimeout(hoverTimer.current)
    setSidebarOpen(false)
  }, [])

  const handleToggleClick = useCallback(() => {
    clearTimeout(hoverTimer.current)
    if (sidebarOpen) {
      pinned.current = false
      setSidebarOpen(false)
    } else {
      pinned.current = true
      setSidebarOpen(true)
    }
  }, [sidebarOpen])

  let employee = { name: 'Employee', emp_code: '', email: '', company: '' }
  try {
    const stored = localStorage.getItem('hr_employee')
    if (stored) employee = { ...employee, ...JSON.parse(stored) }
  } catch (_) {}

  const logout = () => {
    localStorage.removeItem('hr_employee')
    localStorage.removeItem('hr_access_token')
    localStorage.removeItem('hr_refresh_token')
    navigate('/login')
  }

  return (
    <div className={`appShell layoutEmployee ${sidebarExpanded ? 'sidebarExpanded' : ''}`}>
      <aside
        className="sidebar"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="sidebarHeader">
          <button
            type="button"
            className="sidebarToggle"
            onClick={handleToggleClick}
            aria-label={sidebarExpanded ? 'Collapse menu' : 'Expand menu'}
          >
            <IconMenu />
          </button>
          <div className="sidebarBrand">
            <span className="sidebarLogo">HR</span>
            <span className="sidebarRole">Employee</span>
          </div>
        </div>
        <nav className="sidebarNav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebarLink ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <span className="sidebarLinkIcon">{item.icon && <item.icon />}</span>
              <span className="sidebarLinkLabel">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebarFooter">
          <button type="button" className="sidebarLink logoutBtn" onClick={logout}>
            <span className="sidebarLinkIcon"><IconLogout /></span>
            <span className="sidebarLinkLabel">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="mainWrap">
        <header className="topbar">
          <h1 className="topbarTitle">{pageTitle}</h1>
          <div className="topbarRight">
            <div className="userProfileWrap">
              <button
                type="button"
                className="userProfileBtn"
                onClick={() => setProfileOpen((v) => !v)}
                aria-expanded={profileOpen}
              >
                <span className="userAvatar">{employee.name?.charAt(0)?.toUpperCase() || 'E'}</span>
                <span className="userName">{employee.name || 'Employee'}</span>
                <IconChevronDown />
              </button>
              {profileOpen && (
                <>
                  <div className="profileBackdrop" onClick={() => setProfileOpen(false)} aria-hidden />
                  <div className="profileDropdown card">
                    <div className="profileDropdownHead">
                      <span className="userAvatar large">{employee.name?.charAt(0)?.toUpperCase() || 'E'}</span>
                      <div>
                        <div className="profileName">{employee.name || 'Employee'}</div>
                        <div className="profileEmail">{employee.email || employee.emp_code || '—'}</div>
                        {employee.company && <span className="profileRole">{employee.company}</span>}
                      </div>
                    </div>
                    <NavLink to="/employee/settings" className="profileDropdownItem" onClick={() => setProfileOpen(false)}>
                      <IconSettings />
                      Settings
                    </NavLink>
                    <button type="button" className="profileDropdownItem profileDropdownItemSignOut" onClick={() => { setProfileOpen(false); logout(); }}>
                      <IconLogout />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
