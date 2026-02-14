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
  const [empCode, setEmpCode] = useState('') // optional: export only this employee
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
      if (empCode.trim()) params.emp_code = empCode.trim()
      const { data } = await exportReport(params)
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      const baseName = empCode.trim() ? `${report}_${empCode.trim()}_export` : `${report}_export`
      a.download = `${baseName}.${type === 'csv' ? 'csv' : 'json'}`
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
      <header className="exportHero">
        <div className="exportHeroIcon" aria-hidden>↓</div>
        <h1 className="exportTitle">Export Center</h1>
        <p className="exportIntro">Download payroll Excel and raw CSV reports. Pick a report type and options below.</p>
      </header>

      <div className="exportGrid">
        {/* Payroll Excel card */}
        <section className="card exportCard exportCardPayroll">
          <div className="exportCardHead">
            <span className="exportCardBadge exportCardBadgeExcel" aria-hidden>📊</span>
            <h2 className="exportCardTitle">Payroll to Excel</h2>
          </div>
          <p className="exportCardDesc">
            Excel file with <strong>Department</strong>, <strong>Status</strong>, daily earnings per day, <strong>TOTAL</strong> per employee, and one sheet per department.
          </p>
          <div className="exportSection">
            <span className="exportLabel">Date range</span>
            <div className="exportRadioGroup">
              <label className="exportRadio">
                <input type="radio" name="payrollMode" value="all" checked={payrollMode === 'all'} onChange={() => setPayrollMode('all')} />
                <span>All dates</span>
              </label>
              <label className="exportRadio">
                <input type="radio" name="payrollMode" value="month" checked={payrollMode === 'month'} onChange={() => setPayrollMode('month')} />
                <span>Month & year</span>
              </label>
              <label className="exportRadio">
                <input type="radio" name="payrollMode" value="single" checked={payrollMode === 'single'} onChange={() => setPayrollMode('single')} />
                <span>Single day</span>
              </label>
              <label className="exportRadio">
                <input type="radio" name="payrollMode" value="range" checked={payrollMode === 'range'} onChange={() => setPayrollMode('range')} />
                <span>From – to</span>
              </label>
            </div>
            {(payrollMode === 'month' || payrollMode === 'single' || payrollMode === 'range') && (
              <div className="exportRow">
                {payrollMode === 'month' && (
                  <>
                    <div className="exportField">
                      <label className="exportFieldLabel">Month</label>
                      <select className="input exportInput" value={payrollMonth} onChange={(e) => setPayrollMonth(Number(e.target.value))}>
                        {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div className="exportField">
                      <label className="exportFieldLabel">Year</label>
                      <select className="input exportInput" value={payrollYear} onChange={(e) => setPayrollYear(Number(e.target.value))}>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {payrollMode === 'single' && (
                  <div className="exportField">
                    <label className="exportFieldLabel">Date</label>
                    <input type="date" className="input exportInput" value={payrollSingleDate} onChange={(e) => setPayrollSingleDate(e.target.value)} />
                  </div>
                )}
                {payrollMode === 'range' && (
                  <>
                    <div className="exportField">
                      <label className="exportFieldLabel">From</label>
                      <input type="date" className="input exportInput" value={payrollDateFrom} onChange={(e) => setPayrollDateFrom(e.target.value)} />
                    </div>
                    <div className="exportField">
                      <label className="exportFieldLabel">To</label>
                      <input type="date" className="input exportInput" value={payrollDateTo} onChange={(e) => setPayrollDateTo(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {payrollError && <p className="exportMessage exportError">{payrollError}</p>}
          {payrollSuccess && <p className="exportMessage exportSuccess">{payrollSuccess}</p>}
          <button type="button" className="btn btn-primary exportCardBtn" onClick={handlePayrollExcel} disabled={payrollLoading}>
            {payrollLoading ? 'Generating…' : 'Download Excel'}
          </button>

          <div className="exportDivider" />
          <div className="exportSubCard">
            <h3 className="exportSubCardTitle">Previous day</h3>
            <p className="exportSubCardDesc">Yesterday’s report; Total Salary = current month.</p>
            {prevDayError && <p className="exportMessage exportError">{prevDayError}</p>}
            {prevDaySuccess && <p className="exportMessage exportSuccess">{prevDaySuccess}</p>}
            <button type="button" className="btn btn-secondary exportCardBtn exportCardBtnSm" onClick={handlePreviousDayReport} disabled={prevDayLoading}>
              {prevDayLoading ? 'Generating…' : 'Download Previous Day'}
            </button>
          </div>
        </section>

        {/* CSV export card */}
        <section className="card exportCard exportCardCsv">
          <div className="exportCardHead">
            <span className="exportCardBadge exportCardBadgeCsv" aria-hidden>📄</span>
            <h2 className="exportCardTitle">Raw data to CSV</h2>
          </div>
          <p className="exportCardDesc">Employees or attendance as CSV. Optional date range and single-employee filter.</p>
          <div className="exportSection">
            <div className="exportRow">
              <div className="exportField">
                <label className="exportFieldLabel">Report</label>
                <select className="input exportInput" value={report} onChange={(e) => setReport(e.target.value)}>
                  <option value="employees">Employees</option>
                  <option value="attendance">Attendance</option>
                </select>
              </div>
              <div className="exportField">
                <label className="exportFieldLabel">Emp code (optional)</label>
                <input type="text" className="input exportInput" value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="e.g. EMP001" />
              </div>
            </div>
            {report === 'attendance' && (
              <div className="exportRow">
                <div className="exportField">
                  <label className="exportFieldLabel">Date from</label>
                  <input type="date" className="input exportInput" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="exportField">
                  <label className="exportFieldLabel">Date to</label>
                  <input type="date" className="input exportInput" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          {error && <p className="exportMessage exportError">{error}</p>}
          {successMsg && <p className="exportMessage exportSuccess">{successMsg}</p>}
          <button type="button" className="btn btn-secondary exportCardBtn" onClick={() => handleExport('csv')} disabled={loading}>
            {loading ? 'Exporting…' : 'Download CSV'}
          </button>
        </section>
      </div>
    </div>
  )
}
