import { useState } from 'react'
import { exportReport } from '../api'
import './Table.css'

export default function ExportCenter() {
  const [report, setReport] = useState('attendance')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleExport = async (type) => {
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      const params = { type, report }
      if (report === 'attendance') {
        if (dateFrom) params.date_from = dateFrom
        if (dateTo) params.date_to = dateTo
      }
      const { data } = await exportReport(params)
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report}_export.${type === 'csv' ? 'csv' : 'json'}`
      a.click()
      URL.revokeObjectURL(url)
      setSuccessMsg('Download started. If the file has only headers, upload data first or adjust filters.')
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Export Center</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>Generate and download CSV reports. For attendance, leave date range empty to export all records.</p>
      <div className="card" style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: '1rem' }}>
          <label className="label">Report</label>
          <select className="input" value={report} onChange={(e) => setReport(e.target.value)}>
            <option value="employees">Employees</option>
            <option value="attendance">Attendance</option>
          </select>
        </div>
        {report === 'attendance' && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Date from (optional — leave empty for all)</label>
              <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="label">Date to (optional)</label>
              <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </>
        )}
        {error && <p style={{ color: 'var(--danger)', marginBottom: '0.75rem' }}>{error}</p>}
        {successMsg && <p style={{ color: 'var(--accent)', marginBottom: '0.75rem' }}>{successMsg}</p>}
        <button type="button" className="btn btn-primary" onClick={() => handleExport('csv')} disabled={loading}>
          {loading ? 'Exporting…' : 'Download CSV'}
        </button>
      </div>
    </div>
  )
}
