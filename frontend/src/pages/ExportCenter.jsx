import { useState, useEffect, useRef } from 'react'
import { exportReport, exportPayrollExcel, exportPayrollPreviousDay, employees } from '../api'
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
  const [empCode, setEmpCode] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [empSuggestions, setEmpSuggestions] = useState([])
  const [showEmpSuggestions, setShowEmpSuggestions] = useState(false)
  const csvEmpRef = useRef(null)
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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (csvEmpRef.current && !csvEmpRef.current.contains(e.target)) setShowEmpSuggestions(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!empSearch.trim()) {
      setEmpSuggestions([])
      return
    }
    const t = setTimeout(() => {
      employees.list({ search: empSearch.trim(), page_size: 20 })
        .then((r) => {
          const data = r.data.results ?? r.data ?? []
          setEmpSuggestions(Array.isArray(data) ? data : [])
          setShowEmpSuggestions(true)
        })
        .catch(() => setEmpSuggestions([]))
    }, 200)
    return () => clearTimeout(t)
  }, [empSearch])

  const selectCsvEmployee = (emp) => {
    setEmpCode(emp.emp_code)
    setEmpSearch(`${emp.emp_code} — ${emp.name || ''}`)
    setShowEmpSuggestions(false)
    setEmpSuggestions([])
  }

  const clearCsvEmployee = () => {
    setEmpCode('')
    setEmpSearch('')
    setShowEmpSuggestions(false)
    setEmpSuggestions([])
  }

  const getBlobError = async (blob) => {
    try {
      const text = await blob.text()
      const j = JSON.parse(text)
      return j.error || j.detail || text || 'Export failed'
    } catch {
      return 'Export failed (server error)'
    }
  }

  const handlePayrollExcel = async () => {
    setPayrollLoading(true)
    setPayrollError('')
    setPayrollSuccess('')
    try {
      const params = {}
      if (payrollMode === 'month') {
        params.month = Number(payrollMonth)
        params.year = Number(payrollYear)
      } else if (payrollMode === 'single' && payrollSingleDate) {
        params.date = payrollSingleDate
      } else if (payrollMode === 'range') {
        if (payrollDateFrom) params.date_from = payrollDateFrom
        if (payrollDateTo) params.date_to = payrollDateTo
      }
      const res = await exportPayrollExcel(params)
      const data = res.data
      if (data instanceof Blob && data.type && data.type.toLowerCase().includes('json')) {
        const msg = await getBlobError(data)
        setPayrollError(msg)
        return
      }
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
      if (err.response?.data instanceof Blob) {
        const msg = await getBlobError(err.response.data)
        setPayrollError(msg)
      } else {
        setPayrollError(err.response?.data?.error || err.response?.data?.detail || err.message || 'Export failed')
      }
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

      <details className="exportHowWhereCard">
        <summary className="exportHowWhereSummary">How it works & where data comes from</summary>
        <div className="exportHowWhereBody">
          <p><strong>Data in this app</strong></p>
          <ul>
            <li><strong>Employee</strong> — Master data (emp_code, name, dept, salary_type, base_salary, shift). Table: <code>employee</code>.</li>
            <li><strong>Attendance</strong> — Daily punch-in/out, total_working_hours, status, overtime. Table: <code>attendance</code>.</li>
            <li><strong>Salary</strong> — Monthly computed salary (gross, OT, bonus, advance, penalty). Table: <code>salary</code>.</li>
            <li><strong>Salary advance</strong> — Advances taken per month. Table: <code>salary_advance</code>.</li>
          </ul>
          <p><strong>Exports</strong></p>
          <ul>
            <li><strong>Payroll Excel</strong> — Built from Employee + Attendance (for chosen dates) + SalaryAdvance. Daily columns = rate × hours per day; TOTAL includes bonus when you pick Month & year. API: <code>GET /api/export/payroll-excel/</code>.</li>
            <li><strong>Previous day</strong> — Same Excel layout: daily data = yesterday only; Total Salary = full month (1st–yesterday) including bonus. Same API with <code>previous_day=1</code>.</li>
            <li><strong>Raw CSV</strong> — Direct dump from <code>employee</code> or <code>attendance</code> table. API: <code>GET /api/export/?type=csv&report=employees|attendance</code>.</li>
          </ul>
        </div>
      </details>

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
          <details className="exportDataDetails">
            <summary>What’s in this file & where it comes from</summary>
            <ul>
              <li><strong>Rows:</strong> One per employee (from <code>employee</code> table).</li>
              <li><strong>Daily columns:</strong> Earnings per day = hourly rate × <code>total_working_hours</code> from <code>attendance</code> for that date.</li>
              <li><strong>TOTAL:</strong> Sum of daily earnings. If you chose <strong>Month & year</strong>, bonus (from <code>salary</code>) is added so it matches Salary report gross.</li>
              <li><strong>Advance:</strong> From <code>salary_advance</code> for the period (month or date range).</li>
              <li><strong>Sheets:</strong> One sheet per department; plus a Plant summary sheet.</li>
              <li><strong>Backend:</strong> <code>backend/core/export_excel.py</code> → <code>generate_payroll_excel()</code>.</li>
            </ul>
          </details>
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
            <details className="exportDataDetails exportDataDetailsSm">
              <summary>How & where</summary>
              <ul>
                <li><strong>Daily columns:</strong> Only yesterday’s date (from <code>attendance</code>).</li>
                <li><strong>Total Salary:</strong> Full month (1st through yesterday): daily sum + bonus from <code>salary</code>, so it matches Salary report gross.</li>
                <li><strong>Backend:</strong> <code>export_excel.py</code> → <code>generate_payroll_excel_previous_day()</code>. API: <code>GET /api/export/payroll-excel/?previous_day=1</code>.</li>
              </ul>
            </details>
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
          <details className="exportDataDetails">
            <summary>What’s in the CSV & where it comes from</summary>
            <ul>
              <li><strong>Report = Employees:</strong> One row per employee. Columns: emp_code, name, mobile, email, gender, dept_name, designation, status, employment_type, salary_type, base_salary. <strong>Source:</strong> <code>employee</code> table. No date filter.</li>
              <li><strong>Report = Attendance:</strong> One row per attendance record. Columns: emp_code, name, date, shift, shift_from, shift_to, punch_in, punch_out, total_working_hours, total_break, status, over_time. <strong>Source:</strong> <code>attendance</code> table. Use Date from / to to limit range.</li>
              <li><strong>Optional Emp code:</strong> Exports only that employee (both report types).</li>
              <li><strong>Backend:</strong> <code>views.py</code> → <code>ExportView</code>. API: <code>GET /api/export/?type=csv&report=employees|attendance</code>.</li>
            </ul>
          </details>
          <div className="exportSection">
            <div className="exportRow">
              <div className="exportField">
                <label className="exportFieldLabel">Report</label>
                <select className="input exportInput" value={report} onChange={(e) => setReport(e.target.value)}>
                  <option value="employees">Employees</option>
                  <option value="attendance">Attendance</option>
                </select>
              </div>
              <div className="exportField exportFieldEmployee" ref={csvEmpRef}>
                <label className="exportFieldLabel">Employee (optional)</label>
                <div className="exportEmployeeWrap">
                  <input
                    type="text"
                    className="input exportInput"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    onFocus={() => empSuggestions.length > 0 && setShowEmpSuggestions(true)}
                    placeholder="Type name or emp code to search..."
                  />
                  {empCode && (
                    <button type="button" className="exportEmployeeClear" onClick={clearCsvEmployee} title="Clear selection">×</button>
                  )}
                </div>
                {showEmpSuggestions && empSuggestions.length > 0 && (
                  <ul className="exportSuggestionsList">
                    {empSuggestions.map((emp) => (
                      <li key={emp.id}>
                        <button type="button" className="exportSuggestionItem" onClick={() => selectCsvEmployee(emp)}>
                          <strong>{emp.emp_code}</strong> — {emp.name || '—'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
