import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout'
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

function PrivateRoute({ children }) {
  const admin = localStorage.getItem('hr_admin')
  if (!admin) return <Navigate to="/login" replace />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
