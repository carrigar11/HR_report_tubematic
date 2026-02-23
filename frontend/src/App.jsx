import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout'
import LayoutEmployee from './LayoutEmployee'
import Login from './pages/Login'
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

function PrivateRoute({ children }) {
  const admin = localStorage.getItem('hr_admin')
  if (!admin) return <Navigate to="/login" replace />
  return children
}

function EmployeePrivateRoute({ children }) {
  const employee = localStorage.getItem('hr_employee')
  if (!employee) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
