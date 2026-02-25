import { Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout'

class ErrorBoundary extends Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: 'system-ui' }}>
          <h1 style={{ color: '#ef4444' }}>Something went wrong</h1>
          <p style={{ color: '#71717a' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button type="button" onClick={() => window.location.href = '/login'} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
            Go to login
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
import LayoutEmployee from './LayoutEmployee'
import LayoutSystemOwner from './LayoutSystemOwner'
import Login from './pages/Login'
import RegisterCompany from './pages/RegisterCompany'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import AttendanceTable from './pages/AttendanceTable'
import EmployeeMaster from './pages/EmployeeMaster'
import SalaryReport from './pages/SalaryReport'
import EmployeeSalaryDetail from './pages/EmployeeSalaryDetail'
import Advance from './pages/Advance'
import Leaderboard from './pages/Leaderboard'
import BonusManagement from './pages/BonusManagement'
import AbsenteeAlert from './pages/AbsenteeAlert'
import AdjustmentPanel from './pages/AdjustmentPanel'
import PenaltyPage from './pages/PenaltyPage'
import HolidayCalendar from './pages/HolidayCalendar'
import EmployeeProfile from './pages/EmployeeProfile'
import SystemSettings from './pages/SystemSettings'
import ExportCenter from './pages/ExportCenter'
import ManageAdmins from './pages/ManageAdmins'
import ActivityLog from './pages/ActivityLog'
import EmployeeDashboard from './pages/employee/Dashboard'
import EmployeeAttendance from './pages/employee/Attendance'
import EmployeeMyDetails from './pages/employee/MyDetails'
import EmployeeSalarySummary from './pages/employee/SalarySummary'
import EmployeePenalty from './pages/employee/Penalty'
import EmployeeSettings from './pages/employee/Settings'
import EmployeeLeave from './pages/employee/Leave'
import EmployeePayslips from './pages/employee/Payslips'
import EmployeeMyShift from './pages/employee/MyShift'
import EmployeeMyRewards from './pages/employee/MyRewards'
import SystemOwnerDashboard from './pages/systemowner/Dashboard'
import SystemOwnerCompanies from './pages/systemowner/Companies'
import SystemOwnerCompanyAdd from './pages/systemowner/CompanyAdd'
import SystemOwnerCompanyEdit from './pages/systemowner/CompanyEdit'
import SystemOwnerEmployees from './pages/systemowner/Employees'
import SystemOwnerEmployeeEdit from './pages/systemowner/EmployeeEdit'
import SystemOwnerAdmins from './pages/systemowner/Admins'
import SystemOwnerCompanyRequests from './pages/systemowner/CompanyRequests'
import SystemOwnerCompanyRequestDecline from './pages/systemowner/CompanyRequestDecline'
import SystemOwnerProfile from './pages/systemowner/Profile'
import SystemOwnerSettings from './pages/systemowner/Settings'

function PrivateRoute({ children }) {
  try {
    const stored = localStorage.getItem('hr_admin')
    if (!stored) return <Navigate to="/login" replace />
    const admin = JSON.parse(stored)
    if (admin && admin.is_system_owner === true) return <Navigate to="/system-owner" replace />
  } catch (_) {
    return <Navigate to="/login" replace />
  }
  return children
}

function SystemOwnerPrivateRoute({ children }) {
  try {
    const stored = localStorage.getItem('hr_admin')
    if (!stored) return <Navigate to="/login" replace />
    const admin = JSON.parse(stored)
    if (!admin || admin.is_system_owner !== true) return <Navigate to="/" replace />
  } catch (_) {
    return <Navigate to="/login" replace />
  }
  return children
}

function EmployeePrivateRoute({ children }) {
  const employee = localStorage.getItem('hr_employee')
  if (!employee) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        {/* system-owner and employee before "/" so they match correctly */}
        <Route path="system-owner" element={<SystemOwnerPrivateRoute><LayoutSystemOwner /></SystemOwnerPrivateRoute>}>
          <Route index element={<SystemOwnerDashboard />} />
          <Route path="profile" element={<SystemOwnerProfile />} />
          <Route path="settings" element={<SystemOwnerSettings />} />
          <Route path="companies" element={<SystemOwnerCompanies />} />
          <Route path="companies/add" element={<SystemOwnerCompanyAdd />} />
          <Route path="companies/:id" element={<SystemOwnerCompanyEdit />} />
          <Route path="company-requests" element={<SystemOwnerCompanyRequests />} />
          <Route path="company-requests/:id/decline" element={<SystemOwnerCompanyRequestDecline />} />
          <Route path="employees" element={<SystemOwnerEmployees />} />
          <Route path="employees/:id" element={<SystemOwnerEmployeeEdit />} />
          <Route path="admins" element={<SystemOwnerAdmins />} />
        </Route>
        <Route path="employee" element={<EmployeePrivateRoute><LayoutEmployee /></EmployeePrivateRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<EmployeeDashboard />} />
          <Route path="attendance" element={<EmployeeAttendance />} />
          <Route path="leave" element={<EmployeeLeave />} />
          <Route path="holiday-request" element={<Navigate to="/employee/leave" replace />} />
          <Route path="leave-balance" element={<Navigate to="/employee/leave" replace />} />
          <Route path="details" element={<EmployeeMyDetails />} />
          <Route path="salary-summary" element={<EmployeeSalarySummary />} />
          <Route path="payslips" element={<EmployeePayslips />} />
          <Route path="shift" element={<EmployeeMyShift />} />
          <Route path="rewards" element={<EmployeeMyRewards />} />
          <Route path="penalty" element={<EmployeePenalty />} />
          <Route path="settings" element={<EmployeeSettings />} />
        </Route>
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="upload" element={<Upload />} />
          <Route path="attendance" element={<AttendanceTable />} />
          <Route path="employees" element={<EmployeeMaster />} />
          <Route path="employees/:empCode/profile" element={<EmployeeProfile />} />
          <Route path="salary" element={<SalaryReport />} />
          <Route path="salary/employee/:empCode" element={<EmployeeSalaryDetail />} />
          <Route path="advance" element={<Advance />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="bonus" element={<BonusManagement />} />
          <Route path="absentee-alert" element={<AbsenteeAlert />} />
          <Route path="adjustments" element={<AdjustmentPanel />} />
          <Route path="penalty" element={<PenaltyPage />} />
          <Route path="holidays" element={<HolidayCalendar />} />
          <Route path="settings" element={<SystemSettings />} />
          <Route path="export" element={<ExportCenter />} />
          <Route path="manage-admins" element={<ManageAdmins />} />
          <Route path="activity-log" element={<ActivityLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
