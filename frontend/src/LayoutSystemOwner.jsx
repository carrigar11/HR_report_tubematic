import { useState, useRef, useCallback, useEffect } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  IconDashboard,
  IconUsers,
  IconUser,
  IconMenu,
  IconChevronDown,
  IconLogout,
  IconAlert,
  IconSettings,
  IconBell,
} from './components/Icons'
import { systemOwner } from './api'
import './Layout.css'
import './pages/systemowner/SystemOwner.css'

const nav = [
  { to: '/system-owner', label: 'Dashboard', icon: IconDashboard },
  { to: '/system-owner/settings', label: 'Settings', icon: IconSettings },
  { to: '/system-owner/companies', label: 'Companies', icon: IconUsers },
  { to: '/system-owner/company-requests', label: 'Company requests', icon: IconAlert },
  { to: '/system-owner/employees', label: 'Employees', icon: IconUsers },
  { to: '/system-owner/admins', label: 'Admins', icon: IconUser },
]

function getPageTitle(pathname) {
  if (pathname === '/system-owner' || pathname === '/system-owner/') return 'System Owner'
  if (pathname.startsWith('/system-owner/profile')) return 'Profile'
  if (pathname.startsWith('/system-owner/settings')) return 'Settings'
  if (pathname.startsWith('/system-owner/companies')) return 'Companies'
  if (pathname.startsWith('/system-owner/company-requests')) return 'Company requests'
  if (pathname.startsWith('/system-owner/employees')) return 'Employees'
  if (pathname.startsWith('/system-owner/admins')) return 'Admins'
  return 'System Owner'
}

function formatNotifTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return d.toLocaleDateString(undefined, { dateStyle: 'short' })
  } catch (_) {
    return ''
  }
}

export default function LayoutSystemOwner() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState({ count: 0, items: [] })
  const hoverTimer = useRef(null)
  const pinned = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  const loadNotifications = useCallback(() => {
    systemOwner.notifications()
      .then((r) => setNotifications({ count: r.data.count ?? 0, items: r.data.items ?? [] }))
      .catch(() => setNotifications({ count: 0, items: [] }))
  }, [])

  useEffect(() => {
    loadNotifications()
    const t = setInterval(loadNotifications, 60000)
    return () => clearInterval(t)
  }, [loadNotifications])

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
    pinned.current = !sidebarOpen
    setSidebarOpen(!sidebarOpen)
  }, [sidebarOpen])

  let admin = { name: 'System Owner', email: '' }
  try {
    const stored = localStorage.getItem('hr_admin')
    if (stored) admin = { ...admin, ...JSON.parse(stored) }
  } catch (_) {}

  const logout = () => {
    localStorage.removeItem('hr_admin')
    localStorage.removeItem('hr_access_token')
    localStorage.removeItem('hr_refresh_token')
    navigate('/login')
  }

  return (
    <div className={`appShell systemOwnerShell ${sidebarOpen ? 'sidebarExpanded' : ''}`}>
      <aside className="sidebar" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        <div className="sidebarHead">
          <button type="button" className="sidebarToggle" onClick={handleToggleClick} aria-label="Toggle menu">
            <IconMenu />
          </button>
          <div className="sidebarBrand">
            <span className="brandIcon">SO</span>
            <span className="brandText">System Owner</span>
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
            <div className="notificationBellWrap">
              <button
                type="button"
                className="notificationBellBtn"
                onClick={() => {
                  setProfileOpen(false)
                  setNotificationOpen((v) => {
                    if (!v) setNotifications((prev) => ({ ...prev, count: 0 }))
                    return !v
                  })
                }}
                aria-label="Notifications"
              >
                <IconBell />
                {!notificationOpen && notifications.count > 0 && (
                  <span className="notificationBellBadge">
                    {notifications.count > 99 ? '99+' : notifications.count}
                  </span>
                )}
              </button>
              {notificationOpen && (
                <>
                  <div className="profileBackdrop" onClick={() => setNotificationOpen(false)} aria-hidden />
                  <div className="card notificationDropdown">
                    <div className="notificationDropdownHead">Notifications</div>
                    {notifications.items.length === 0 ? (
                      <div className="notificationDropdownEmpty">No new notifications</div>
                    ) : (
                      <>
                        {notifications.items.map((n) => (
                          <Link
                            key={`${n.type}-${n.id}`}
                            to={n.link}
                            className="notificationDropdownItem"
                            onClick={() => setNotificationOpen(false)}
                          >
                            <span className="notificationDropdownItemTitle">{n.title}</span>
                            {n.subtitle && <span className="notificationDropdownItemSub">{n.subtitle}</span>}
                            <span className="notificationDropdownItemSub">{formatNotifTime(n.created_at)}</span>
                          </Link>
                        ))}
                        <Link
                          to="/system-owner/company-requests"
                          className="notificationDropdownItem"
                          onClick={() => setNotificationOpen(false)}
                          style={{ textAlign: 'center', fontWeight: 500 }}
                        >
                          View all requests
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="userProfileWrap">
              <button
                type="button"
                className="userProfileBtn"
                onClick={() => setProfileOpen((v) => !v)}
                aria-expanded={profileOpen}
              >
                <span className="userAvatar">{admin.name?.charAt(0)?.toUpperCase() || 'S'}</span>
                <span className="userName">{admin.name || 'System Owner'}</span>
                <IconChevronDown />
              </button>
              {profileOpen && (
                <>
                  <div className="profileBackdrop" onClick={() => setProfileOpen(false)} aria-hidden />
                  <div className="profileDropdown card">
                    <div className="profileDropdownHead">
                      <span className="userAvatar large">{admin.name?.charAt(0)?.toUpperCase() || 'S'}</span>
                      <div>
                        <div className="profileName">{admin.name || 'System Owner'}</div>
                        <div className="profileEmail">{admin.email || ''}</div>
                        <span className="profileRole">System Owner</span>
                      </div>
                    </div>
                    <NavLink to="/system-owner/profile" className="profileDropdownItem" onClick={() => setProfileOpen(false)}>
                      <IconUser />
                      Profile
                    </NavLink>
                    <NavLink to="/system-owner/settings" className="profileDropdownItem" onClick={() => setProfileOpen(false)}>
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
        <main className="main systemOwnerMain">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
