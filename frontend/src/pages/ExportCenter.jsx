import { useState } from 'react'
import { exportReport, exportPayrollExcel, exportPayrollPreviousDay } from '../api'
import './Table.css'
import './ExportCenter.css'

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i)

export default function ExportCenter() {
  const [report, setReport] = useState('attendance')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Payroll Excel options
  const [payrollMode, setPayrollMode] = useState('all') // 'all' | 'month' | 'single' | 'range'
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() + 1)
  const [payrollYear, setPayrollYear] = useState(currentYear)
  const [payrollSingleDate, setPayrollSingleDate] = useState('')
  const [payrollDateFrom, setPayrollDateFrom] = useState('')
  const [payrollDateTo, setPayrollDateTo] = useState('')
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [payrollError, setPayrollError] = useState('')
  const [payrollSuccess, setPayrollSuccess] = useState('')
  const [prevDayLoading, setPrevDayLoading] = useState(false)
  const [prevDayError, setPrevDayError] = useState('')
  const [prevDaySuccess, setPrevDaySuccess] = useState('')

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

  const handlePayrollExcel = async () => {
    setPayrollLoading(true)
    setPayrollError('')
    setPayrollSuccess('')
    try {
      const params = {}
      if (payrollMode === 'month') {
        params.month = payrollMonth
        params.year = payrollYear
      } else if (payrollMode === 'single' && payrollSingleDate) {
        params.date = payrollSingleDate
      } else if (payrollMode === 'range') {
        if (payrollDateFrom) params.date_from = payrollDateFrom
        if (payrollDateTo) params.date_to = payrollDateTo
      }
      const { data } = await exportPayrollExcel(params)
      let filename = 'payroll_export.xlsx'
      if (payrollMode === 'month') filename = `payroll_${payrollYear}_${String(payrollMonth).padStart(2, '0')}.xlsx`
      else if (payrollMode === 'single' && payrollSingleDate) filename = `payroll_${payrollSingleDate}.xlsx`
      else if (payrollMode === 'range' && (payrollDateFrom || payrollDateTo)) filename = 'payroll_range.xlsx'
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setPayrollSuccess('Payroll Excel downloaded. Check your Downloads folder.')
    } catch (err) {
      setPayrollError(err.response?.data?.error || err.message || 'Export failed')
    } finally {
      setPayrollLoading(false)
    }
  }

  const handlePreviousDayReport = async () => {
    setPrevDayLoading(true)
    setPrevDayError('')
    setPrevDaySuccess('')
    setPayrollError('')
    setPayrollSuccess('')
    try {
      const { data } = await exportPayrollPreviousDay()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const filename = `payroll_previous_day_${yesterday.toISOString().slice(0, 10)}.xlsx`
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setPrevDaySuccess('Previous day report downloaded. Daily data = yesterday; Total Salary = current month.')
    } catch (err) {
      setPrevDayError(err.response?.data?.error || err.message || 'Export failed')
    } finally {
      setPrevDayLoading(false)
    }
  }

  return (
    <div className="pageContent exportPage">
      <h2 className="exportTitle">Export Center</h2>
      <p className="exportIntro">Download reports and payroll data. Choose the type and date range below.</p>

      {/* Payroll Excel section */}
      <div className="card exportCard exportCardPayroll">
        <h3 className="exportCardTitle">Export Payroll to Excel</h3>
        <p className="exportCardDesc">
          Download an Excel file with <strong>Department</strong>, <strong>Status</strong>, and one column per day showing <strong>daily earnings</strong> (rate × hours worked). Includes <strong>TOTAL</strong> per employee and a <strong>Total</strong> row at the bottom. One main sheet + one sheet per department.
        </p>
        <div className="exportPayrollOptions">
          <label className="exportLabel">What dates do you want?</label>
          <div className="exportRadioGroup">
            <label className="exportRadio">
              <input type="radio" name="payrollMode" value="all" checked={payrollMode === 'all'} onChange={() => setPayrollMode('all')} />
              <span>All dates (full data)</span>
            </label>
            <label className="exportRadio">
              <input type="radio" name="payrollMode" value="month" checked={payrollMode === 'month'} onChange={() => setPayrollMode('month')} />
              <span>By month & year</span>
            </label>
            <label className="exportRadio">
              <input type="radio" name="payrollMode" value="single" checked={payrollMode === 'single'} onChange={() => setPayrollMode('single')} />
              <span>Single day</span>
            </label>
            <label className="exportRadio">
              <input type="radio" name="payrollMode" value="range" checked={payrollMode === 'range'} onChange={() => setPayrollMode('range')} />
              <span>Date range (from – to)</span>
            </label>
          </div>
          {payrollMode === 'month' && (
            <div className="exportPayrollFields">
              <div className="exportField">
                <label className="exportLabel">Month</label>
                <select className="input exportInput" value={payrollMonth} onChange={(e) => setPayrollMonth(Number(e.target.value))}>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="exportField">
                <label className="exportLabel">Year</label>
                <select className="input exportInput" value={payrollYear} onChange={(e) => setPayrollYear(Number(e.target.value))}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          )}
          {payrollMode === 'single' && (
            <div className="exportPayrollFields">
              <div className="exportField">
                <label className="exportLabel">Select date</label>
                <input type="date" className="input exportInput" value={payrollSingleDate} onChange={(e) => setPayrollSingleDate(e.target.value)} />
              </div>
            </div>
          )}
          {payrollMode === 'range' && (
            <div className="exportPayrollFields">
              <div className="exportField">
                <label className="exportLabel">From date</label>
                <input type="date" className="input exportInput" value={payrollDateFrom} onChange={(e) => setPayrollDateFrom(e.target.value)} />
              </div>
              <div className="exportField">
                <label className="exportLabel">To date</label>
                <input type="date" className="input exportInput" value={payrollDateTo} onChange={(e) => setPayrollDateTo(e.target.value)} />
              </div>
            </div>
          )}
        </div>
        {payrollError && <p className="exportError">{payrollError}</p>}
        {payrollSuccess && <p className="exportSuccess">{payrollSuccess}</p>}
        <button type="button" className="btn btn-primary exportBtn" onClick={handlePayrollExcel} disabled={payrollLoading}>
          {payrollLoading ? 'Generating…' : 'Download Payroll Excel'}
        </button>

        <p className="exportCardDesc" style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
          <strong>Previous day report:</strong> Same report for yesterday only. Daily columns and metrics are for that day; <strong>Total Salary</strong> is for the current month.
        </p>
        {prevDayError && <p className="exportError">{prevDayError}</p>}
        {prevDaySuccess && <p className="exportSuccess">{prevDaySuccess}</p>}
        <button type="button" className="btn btn-secondary exportBtn" onClick={handlePreviousDayReport} disabled={prevDayLoading}>
          {prevDayLoading ? 'Generating…' : 'Download Previous Day Report'}
        </button>
      </div>

      {/* CSV export section */}
      <div className="card exportCard">
        <h3 className="exportCardTitle">Export to CSV</h3>
        <p className="exportCardDesc">Download raw data as CSV. For attendance, use the date range below or leave empty for all records.</p>
        <div style={{ marginBottom: '1rem' }}>
          <label className="exportLabel">Report</label>
          <select className="input exportInput" value={report} onChange={(e) => setReport(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="employees">Employees</option>
            <option value="attendance">Attendance</option>
          </select>
        </div>
        {report === 'attendance' && (
          <div className="exportPayrollFields">
            <div className="exportField">
              <label className="exportLabel">Date from (optional)</label>
              <input type="date" className="input exportInput" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="exportField">
              <label className="exportLabel">Date to (optional)</label>
              <input type="date" className="input exportInput" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        )}
        {error && <p className="exportError">{error}</p>}
        {successMsg && <p className="exportSuccess">{successMsg}</p>}
        <button type="button" className="btn btn-secondary exportBtn" onClick={() => handleExport('csv')} disabled={loading}>
          {loading ? 'Exporting…' : 'Download CSV'}
        </button>
      </div>
    </div>
  )
}
