import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Send X-Admin-Id so backend can filter by department for dept admins
api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('hr_admin')
    if (stored) {
      const admin = JSON.parse(stored)
      if (admin && admin.id != null) config.headers['X-Admin-Id'] = String(admin.id)
    }

  } catch (_) {}
  return config
})

export const auth = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
}

export const departments = {
  list: () => api.get('/departments/'),
}

export const admins = {
  get: (id) => api.get(`/admins/${id}/`),
  update: (id, data) => api.patch(`/admins/${id}/`, data),
  list: () => api.get('/admins/'),
  create: (data) => api.post('/admins/', data),
  delete: (id) => api.delete(`/admins/${id}/`),
  updateAccess: (id, data) => api.patch(`/admins/${id}/access/`, data),
}

export const auditLog = {
  list: (params) => api.get('/audit-log/', { params }),
}

export const upload = {
  employees: (file, preview = false) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('preview', preview ? 'true' : 'false')
    return api.post('/upload/employees/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  attendance: (file, preview = false) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('preview', preview ? 'true' : 'false')
    return api.post('/upload/attendance/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  shift: (file, preview = false) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('preview', preview ? 'true' : 'false')
    return api.post('/upload/shift/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  forcePunch: (file, preview = false) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('preview', preview ? 'true' : 'false')
    return api.post('/upload/force-punch/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

export const dashboard = () => api.get('/dashboard/')

export const employees = {
  list: (params) => api.get('/employees/', { params }),
  get: (id) => api.get(`/employees/${id}/`),
  profile: (empCode) => api.get(`/employees/${empCode}/profile/`),
  create: (data) => api.post('/employees/', data),
  update: (id, data) => api.patch(`/employees/${id}/`, data),
  getNextEmpCode: () => api.get('/employees/next_emp_code/'),
}

export const attendance = {
  list: (params) => api.get('/attendance/', { params }),
  adjust: (payload) => api.post('/attendance/adjust/', payload),
}

export const salary = {
  monthly: (month, year, search = '', empCode = '') => api.get('/salary/monthly/', {
    params: { month, year, ...(search ? { search } : {}), ...(empCode ? { emp_code: empCode } : {}) },
  }),
  list: (params) => api.get('/salary/', { params }),
}

export const advance = {
  list: (month, year) => api.get('/advance/', { params: { month, year } }),
  /** List all advances for one employee (optional month, year to filter). */
  byEmployee: (empCode, month, year) => api.get('/advance/', { params: { emp_code: empCode, ...(month && year ? { month, year } : {}) } }),
  create: (data) => api.post('/advance/', data),
  delete: (id) => api.delete(`/advance/${id}/`),
}

export const rewards = () => api.get('/rewards/')
export const leaderboard = (params) => api.get('/leaderboard/', { params: params || {} })
export const giveBonus = (emp_code, bonus_hours) => api.post('/leaderboard/bonus/', { emp_code, bonus_hours })
export const bonus = {
  overview: (month, year, search = '') => api.get('/bonus/overview/', { params: { month, year, ...(search ? { search } : {}) } }),
  employeeDetails: (emp_code, month, year) => api.get('/bonus/employee-details/', { params: { emp_code, month, year } }),
  give: (emp_code, bonus_hours, month, year) => api.post('/leaderboard/bonus/', { emp_code, bonus_hours, ...(month != null && year != null ? { month, year } : {}) }),
  set: (emp_code, bonus_hours, month, year) => api.post('/bonus/set/', { emp_code, bonus_hours, ...(month != null && year != null ? { month, year } : {}) }),
  hideGrant: (emp_code, month, year, hours, given_at) => api.post('/bonus/hide-grant/', { emp_code, month, year, hours, given_at }),
}
export const absenteeAlert = () => api.get('/absentee-alert/')

export const adjustments = {
  list: (params) => api.get('/adjustments/', { params }),
}

export const penalty = {
  list: (params) => api.get('/penalty/', { params }),
  create: (data) => api.post('/penalty/create/', data),
  get: (id) => api.get(`/penalty/${id}/`),
  update: (id, data) => api.patch(`/penalty/${id}/`, data),
  delete: (id) => api.delete(`/penalty/${id}/`),
}

export const holidays = {
  list: (params) => api.get('/holidays/', { params }),
  create: (data) => api.post('/holidays/', data),
  update: (id, data) => api.patch(`/holidays/${id}/`, data),
  delete: (id) => api.delete(`/holidays/${id}/`),
}

export const settings = {
  list: () => api.get('/settings/'),
  update: (key, data) => api.patch(`/settings/${key}/`, data),
}

export const smtpConfig = {
  get: () => api.get('/settings/smtp/'),
  update: (data) => api.patch('/settings/smtp/', data),
}

export const googleSheet = {
  getConfig: () => api.get('/settings/google-sheet/'),
  updateConfig: (data) => api.patch('/settings/google-sheet/', data),
  sync: () => api.post('/settings/google-sheet/sync/'),
}

export const exportReport = (params) => api.get('/export/', { params, responseType: 'blob' })

/** Payroll Excel: params = { month, year } or { date } or { date_from, date_to } or { emp_code } or {} for all */
export const exportPayrollExcel = (params) => api.get('/export/payroll-excel/', { params, responseType: 'blob' })

/** Full salary history for one employee (CSV). params = { emp_code } */
export const exportEmployeeSalaryHistory = (params) => api.get('/export/employee-salary-history/', { params, responseType: 'blob' })

/** Previous day report: daily data = yesterday, Total Salary = current month */
export const exportPayrollPreviousDay = () => api.get('/export/payroll-excel/', { params: { previous_day: '1' }, responseType: 'blob' })

export const runRewardEngine = () => api.post('/reward-engine/run/')

export default api
