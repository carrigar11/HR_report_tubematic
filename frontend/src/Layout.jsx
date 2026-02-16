import { useState, useRef, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  IconDashboard,
  IconUpload,
  IconCalendar,
  IconUsers,
  IconMoney,
  IconTrophy,
  IconAlert,
  IconEdit,
  IconHoliday,
  IconSettings,
  IconExport,
  IconMenu,
  IconUser,
  IconChevronDown,
  IconGift,
  IconClock,
} from './components/Icons'
import './Layout.css'

const nav = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, access: 'dashboard' },
  { to: '/upload', label: 'Upload', icon: IconUpload, access: 'upload' },
  { to: '/attendance', label: 'Attendance', icon: IconCalendar, access: 'attendance' },
  { to: '/employees', label: 'Employee Master', icon: IconUsers, access: 'employees' },
  { to: '/salary', label: 'Salary Report', icon: IconMoney, access: 'salary' },
  { to: '/advance', label: 'Advance', icon: IconMoney, access: 'salary' },
  { to: '/leaderboard', label: 'Leaderboard', icon: IconTrophy, access: 'leaderboard' },
  { to: '/bonus', label: 'Bonus Manager', icon: IconGift, access: 'bonus' },
  { to: '/penalty', label: 'Penalty', icon: IconAlert, access: 'penalty' },
  { to: '/absentee-alert', label: 'Absentee Alert', icon: IconAlert, access: 'absentee_alert' },
  { to: '/adjustments', label: 'Adjustments', icon: IconEdit, access: 'adjustment' },
  { to: '/holidays', label: 'Holidays', icon: IconHoliday, access: 'holidays' },
  { to: '/settings', label: 'Settings', icon: IconSettings, access: 'settings' },
  { to: '/export', label: 'Export', icon: IconExport, access: 'export' },
  { to: '/manage-admins', label: 'Manage Admins', icon: IconUser, access: 'manage_admins' },
  { to: '/activity-log', label: 'Activity Log', icon: IconClock, access: 'manage_admins' },
]

const pathToTitle = {
  '/': 'Dashboard',
  '/upload': 'Upload',
  '/attendance': 'Attendance',
  '/employees': 'Employee Master',
  '/salary': 'Salary Report',
  '/advance': 'Advance',
  '/leaderboard': 'Leaderboard',
  '/bonus': 'Bonus Manager',
  '/penalty': 'Penalty',
  '/absentee-alert': 'Absentee Alert',
  '/adjustments': 'Adjustments',
  '/holidays': 'Holidays',
  '/settings': 'Settings',
  '/export': 'Export',
  '/manage-admins': 'Manage Admins',
  '/activity-log': 'Activity Log',
}

function getPageTitle(pathname) {
  if (pathname === '/' || pathname === '') return 'Dashboard'
  for (const path of Object.keys(pathToTitle)) {
    if (pathname === path || pathname.startsWith(path + '/')) return pathToTitle[path]
  }
  if (pathname.includes('/profile')) return 'Employee Profile'
  return 'HR Attendance'
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const hoverTimer = useRef(null)
  const pinned = useRef(false)  // true when opened via click

  const sidebarExpanded = sidebarOpen

  const handleMouseEnter = useCallback(() => {
    if (pinned.current) return  // already open via click, don't interfere
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setSidebarOpen(true), 100)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (pinned.current) return  // keep open if clicked
    clearTimeout(hoverTimer.current)
    setSidebarOpen(false)
  }, [])

  const handleToggleClick = useCallback(() => {
    clearTimeout(hoverTimer.current)
    if (sidebarOpen) {
      // Close
      pinned.current = false
      setSidebarOpen(false)
    } else {
      // Open via click — stays open until clicked again
      pinned.current = true
      setSidebarOpen(true)
    }
  }, [sidebarOpen])
  const navigate = useNavigate()
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  let admin = { name: 'Admin', email: '', role: 'super_admin', access: {} }
  try {
    const stored = localStorage.getItem('hr_admin')
    if (stored) admin = { ...admin, ...JSON.parse(stored) }
  } catch (_) {}
  const canAccess = (key) => admin.role === 'super_admin' || admin.access?.[key] === true

  const logout = () => {
    localStorage.removeItem('hr_admin')
    navigate('/login')
  }

  return (
    <div className={`appShell ${sidebarExpanded ? 'sidebarExpanded' : ''}`}>
      <aside
        className="sidebar"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="sidebarHead">
          <button
            type="button"
            className="sidebarToggle"
            onClick={handleToggleClick}
            aria-label="Close menu"
          >
            <IconMenu />
          </button>
          <div className="sidebarBrand">
            <span className="brandIcon">HR</span>
            <span className="brandText">HR Attendance</span>
          </div>
        </div>
        <nav className="sidebarNav">
          {nav.filter(({ access }) => canAccess(access)).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => 'navLink' + (isActive ? ' active' : '')}
              title={label}
            >
              <span className="navIcon"><Icon /></span>
              <span className="navLabel">{label}</span>
            </NavLink>
          ))}
        </nav>
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
                <span className="userAvatar">{admin.name?.charAt(0)?.toUpperCase() || 'A'}</span>
                <span className="userName">{admin.name || 'Admin'}</span>
                <IconChevronDown />
              </button>
              {profileOpen && (
                <>
                  <div className="profileBackdrop" onClick={() => setProfileOpen(false)} aria-hidden />
                  <div className="profileDropdown card">
                    <div className="profileDropdownHead">
                      <span className="userAvatar large">{admin.name?.charAt(0)?.toUpperCase() || 'A'}</span>
                      <div>
                        <div className="profileName">{admin.name || 'Admin'}</div>
                        <div className="profileEmail">{admin.email || 'admin@hr.com'}</div>
                        {admin.role === 'super_admin' ? (
                          <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>Super Admin</div>
                        ) : admin.department ? (
                          <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>Dept: {admin.department}</div>
                        ) : null}
                      </div>
                    </div>
                    <NavLink to="/settings" className="profileDropdownItem" onClick={() => setProfileOpen(false)}>
                      <IconSettings />
                      Settings
                    </NavLink>
                    <button type="button" className="profileDropdownItem" onClick={() => { setProfileOpen(false); logout(); }}>
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
