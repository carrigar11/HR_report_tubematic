import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { employees, advance, exportPayrollExcel, exportEmployeeSalaryHistory } from '../api'
import './Table.css'
import './SalaryReport.css'
import './EmployeeSalaryDetail.css'

const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const formatCurrency = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

function downloadBlob(blob, defaultFilename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultFilename
  a.click()
  URL.revokeObjectURL(url)
}

export default function EmployeeSalaryDetail() {
  const { empCode } = useParams()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [downloadRangeLoading, setDownloadRangeLoading] = useState(false)
  const [downloadFullLoading, setDownloadFullLoading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [showAdvances, setShowAdvances] = useState(false)
  const [advancesList, setAdvancesList] = useState([])
  const [advancesLoading, setAdvancesLoading] = useState(false)

  const highlightMonth = searchParams.get('month') ? parseInt(searchParams.get('month'), 10) : null
  const highlightYear = searchParams.get('year') ? parseInt(searchParams.get('year'), 10) : null

  useEffect(() => {
    if (!empCode) return
    setLoading(true)
    employees.profile(empCode)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Not found'))
      .finally(() => setLoading(false))
  }, [empCode])

  const handleDownloadRange = async () => {
    if (!dateFrom && !dateTo) {
      setDownloadError('Select at least From date or To date.')
      return
    }
    setDownloadError('')
    setDownloadRangeLoading(true)
    try {
      const params = { emp_code: empCode }
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const { data: blob } = await exportPayrollExcel(params)
      const name = dateFrom && dateTo ? `payroll_${empCode}_${dateFrom}_${dateTo}.xlsx` : `payroll_${empCode}_range.xlsx`
      downloadBlob(blob, name)
    } catch (err) {
      setDownloadError(err.response?.data?.error || err.message || 'Download failed')
    } finally {
      setDownloadRangeLoading(false)
    }
  }

  const handleViewAdvances = () => {
    setShowAdvances(true)
    setAdvancesLoading(true)
    advance.byEmployee(empCode)
      .then((r) => setAdvancesList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAdvancesList([]))
      .finally(() => setAdvancesLoading(false))
  }

  const handleDownloadFull = async () => {
    setDownloadError('')
    setDownloadFullLoading(true)
    try {
      const { data: blob } = await exportEmployeeSalaryHistory({ emp_code: empCode })
      downloadBlob(blob, `salary_history_${empCode}.csv`)
    } catch (err) {
      setDownloadError(err.response?.data?.error || err.message || 'Download failed')
    } finally {
      setDownloadFullLoading(false)
    }
  }

  if (loading) return <div className="pageContent"><p className="muted">Loading…</p></div>
  if (error) return <div className="pageContent"><p className="muted" style={{ color: 'var(--danger)' }}>Error: {error}</p></div>
  if (!data) return null

  const emp = data.employee
  const salaries = data.salaries || []

  return (
    <div className="pageContent empSalaryDetailPage">
      <div className="empSalHeader">
        <Link to="/salary" className="empSalBack">← Back to Salary Report</Link>
        <div className="empSalTitleRow">
          <h1 className="empSalTitle">Salary details</h1>
          <span className="empSalCode">{emp?.emp_code}</span>
          <span className="empSalName">{emp?.name || '—'}</span>
        </div>
      </div>

      <div className="empSalGrid">
        <section className="card empSalCard empSalDetailsCard">
          <h2 className="empSalCardTitle">Salary history (all months)</h2>
          <div className="empSalTableWrap">
            <table className="salTable empSalTable">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Year</th>
                  <th>Type</th>
                  <th>Base</th>
                  <th>Days</th>
                  <th>Total Hrs</th>
                  <th>OT Hrs</th>
                  <th>Bonus</th>
                  <th>Advance</th>
                  <th>Penalty</th>
                  <th>Gross</th>
                  <th>Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((row) => {
                  const isHighlight = highlightMonth != null && highlightYear != null && row.month === highlightMonth && row.year === highlightYear
                  return (
                    <tr key={row.id || `${row.year}-${row.month}`} className={isHighlight ? 'empSalRowHighlight' : ''}>
                      <td>{monthNames[row.month] || row.month}</td>
                      <td>{row.year}</td>
                      <td>{row.salary_type}</td>
                      <td>{formatCurrency(row.base_salary)}</td>
                      <td>{row.days_present ?? 0}</td>
                      <td>{Number(row.total_working_hours || 0).toFixed(2)}</td>
                      <td>{Number(row.overtime_hours || 0).toFixed(2)}</td>
                      <td title="Bonus hours × hourly rate = bonus money">{(Number(row.bonus || 0)).toFixed(2)} h</td>
                      <td>{formatCurrency(row.advance_total)}</td>
                      <td>{formatCurrency(row.penalty_deduction)}</td>
                      <td>{formatCurrency(row.gross_salary)}</td>
                      <td className="salNetPay">{formatCurrency(row.net_pay)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {salaries.length === 0 && <p className="muted">No salary records yet.</p>}
        </section>

        <section className="card empSalCard empSalDownloadCard">
          <h2 className="empSalCardTitle">Download data</h2>
          <p className="empSalDownloadDesc">Export payroll or full salary history for this employee.</p>
          <div className="empSalDownloadSection">
            <h3 className="empSalDownloadSub">From date – To date (payroll Excel)</h3>
            <div className="empSalDateRow">
              <div className="empSalField">
                <label className="label">From</label>
                <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="empSalField">
                <label className="label">To</label>
                <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleDownloadRange} disabled={downloadRangeLoading}>
              {downloadRangeLoading ? 'Downloading…' : 'Download payroll (Excel)'}
            </button>
          </div>
          <div className="empSalDownloadSection empSalDownloadFull">
            <h3 className="empSalDownloadSub">Full salary history (CSV)</h3>
            <button type="button" className="btn btn-secondary" onClick={handleDownloadFull} disabled={downloadFullLoading}>
              {downloadFullLoading ? 'Downloading…' : 'Download full data'}
            </button>
          </div>
          {downloadError && <p className="salModalError">{downloadError}</p>}
          <div className="empSalDownloadSection empSalAdvances">
            <h3 className="empSalDownloadSub">Advance history</h3>
            <button type="button" className="btn btn-secondary" onClick={handleViewAdvances}>
              View advances (date, amount, note)
            </button>
          </div>
          <Link to={`/employees/${empCode}/profile`} className="empSalProfileLink">Open employee profile →</Link>
        </section>
      </div>

      {showAdvances && (
        <div className="salModalOverlay" onClick={() => setShowAdvances(false)}>
          <div className="salModal empSalAdvancesModal" onClick={(e) => e.stopPropagation()}>
            <h3 className="salModalTitle">Advance history — {emp?.emp_code} {emp?.name || ''}</h3>
            <p className="salModalDesc">All advances taken by this employee (deducted from salary of the month shown).</p>
            {advancesLoading ? (
              <p className="muted">Loading…</p>
            ) : (
              <div className="empSalAdvancesTableWrap">
                <table className="salTable empSalTable">
                  <thead>
                    <tr>
                      <th>Date given</th>
                      <th>For month</th>
                      <th>Amount</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advancesList.map((a) => (
                      <tr key={a.id}>
                        <td>{a.date_given || (a.created_at ? a.created_at.slice(0, 10) : '—')}</td>
                        <td>{monthNames[a.month] || a.month} {a.year}</td>
                        <td>{formatCurrency(a.amount)}</td>
                        <td>{a.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!advancesLoading && advancesList.length === 0 && <p className="muted">No advances recorded.</p>}
            <div className="salModalActions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAdvances(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
