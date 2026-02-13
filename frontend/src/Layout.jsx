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
} from './components/Icons'
import './Layout.css'

const nav = [
  { to: '/', label: 'Dashboard', icon: IconDashboard },
  { to: '/upload', label: 'Upload', icon: IconUpload },
  { to: '/attendance', label: 'Attendance', icon: IconCalendar },
  { to: '/employees', label: 'Employee Master', icon: IconUsers },
  { to: '/salary', label: 'Salary Report', icon: IconMoney },
  { to: '/leaderboard', label: 'Leaderboard', icon: IconTrophy },
  { to: '/bonus', label: 'Bonus Manager', icon: IconGift },
  { to: '/absentee-alert', label: 'Absentee Alert', icon: IconAlert },
  { to: '/adjustments', label: 'Adjustments', icon: IconEdit },
  { to: '/holidays', label: 'Holidays', icon: IconHoliday },
  { to: '/settings', label: 'Settings', icon: IconSettings },
  { to: '/export', label: 'Export', icon: IconExport },
]

const pathToTitle = {
  '/': 'Dashboard',
  '/upload': 'Upload',
  '/attendance': 'Attendance',
  '/employees': 'Employee Master',
  '/salary': 'Salary Report',
  '/leaderboard': 'Leaderboard',
  '/bonus': 'Bonus Manager',
  '/absentee-alert': 'Absentee Alert',
  '/adjustments': 'Adjustments',
  '/holidays': 'Holidays',
  '/settings': 'Settings',
  '/export': 'Export',
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

  let admin = { name: 'Admin', email: '' }
  try {
    const stored = localStorage.getItem('hr_admin')
    if (stored) admin = { ...admin, ...JSON.parse(stored) }
  } catch (_) {}

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
          {nav.map(({ to, label, icon: Icon }) => (
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
