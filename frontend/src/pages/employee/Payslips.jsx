import { useState, useMemo } from 'react'
import { employee } from '../../api'
import './Payslips.css'

const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1

function buildMonthOptions(count) {
  count = count || 24
  const out = []
  let y = currentYear
  let m = currentMonth
  for (let i = 0; i < count; i++) {
    const monthName = new Date(2000, m - 1).toLocaleString('default', { month: 'long' })
    const label = monthName + ' ' + y
    out.push({ year: y, month: m, label, monthName })
    m -= 1
    if (m < 1) { m = 12; y -= 1 }
  }
  return out
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const ALL_YEARS = 'all'

export default function Payslips() {
  const [downloading, setDownloading] = useState(null)
  const [yearFilter, setYearFilter] = useState(ALL_YEARS)
  const [monthSearch, setMonthSearch] = useState('')

  const allMonths = useMemo(() => buildMonthOptions(24), [])

  const filteredMonths = useMemo(() => {
    let list = allMonths
    if (yearFilter !== ALL_YEARS) {
      const y = parseInt(yearFilter, 10)
      list = list.filter((o) => o.year === y)
    }
    if (monthSearch.trim()) {
      const q = monthSearch.trim().toLowerCase()
      list = list.filter((o) => o.monthName.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
    }
    return list
  }, [allMonths, yearFilter, monthSearch])

  const years = useMemo(() => {
    const set = new Set(allMonths.map((o) => o.year))
    return Array.from(set).sort((a, b) => b - a)
  }, [allMonths])

  const handleDownload = async (year, month) => {
    const key = year + '-' + month
    setDownloading(key)
    try {
      const { data } = await employee.payslip({ month, year })
      downloadBlob(data, 'payslip_' + year + '_' + String(month).padStart(2, '0') + '.pdf')
    } catch (_) {
      setDownloading(null)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="payslipsPage">
      <h2 className="payslipsTitle">Payslips</h2>
      <p className="payslipsIntro">Download your payslip (PDF) for any month.</p>

      <div className="payslipsFilters">
        <div>
          <label className="label">Year</label>
          <select className="input" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value={ALL_YEARS}>All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Search month</label>
          <input
            type="text"
            className="input searchInput"
            placeholder="e.g. Feb, March"
            value={monthSearch}
            onChange={(e) => setMonthSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="payslipsList card">
        <table className="payslipsTable">
          <thead>
            <tr>
              <th>Month</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredMonths.map(({ year, month, label }) => (
              <tr key={year + '-' + month}>
                <td>{label}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary btnSm"
                    disabled={downloading !== null}
                    onClick={() => handleDownload(year, month)}
                  >
                    {downloading === (year + '-' + month) ? 'Downloading…' : 'Download PDF'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredMonths.length === 0 && <p className="muted" style={{ padding: '1rem' }}>No months match the filter.</p>}
      </div>
    </div>
  )
}
