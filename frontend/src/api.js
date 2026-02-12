import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export const auth = {
  login: (email, password) => api.post('/auth/login/', { email, password }),
}

export const admins = {
  get: (id) => api.get(`/admins/${id}/`),
  update: (id, data) => api.patch(`/admins/${id}/`, data),
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
}

export const attendance = {
  list: (params) => api.get('/attendance/', { params }),
  adjust: (payload) => api.post('/attendance/adjust/', payload),
}

export const salary = {
  monthly: (month, year, search = '') => api.get('/salary/monthly/', { params: { month, year, ...(search ? { search } : {}) } }),
  list: (params) => api.get('/salary/', { params }),
}

export const rewards = () => api.get('/rewards/')
export const leaderboard = () => api.get('/leaderboard/')
export const absenteeAlert = () => api.get('/absentee-alert/')

export const adjustments = {
  list: (params) => api.get('/adjustments/', { params }),
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

export const exportReport = (params) => api.get('/export/', { params, responseType: 'blob' })

export const runRewardEngine = () => api.post('/reward-engine/run/')

export default api
