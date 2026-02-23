import { useState, useEffect } from 'react'
import { employee } from '../../api'
import './SalarySummary.css'

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export default function EmployeeSalarySummary() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)

  useEffect(() => {
    setLoading(true)
    employee.salarySummary({ month, year })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <p className="salSummaryLoading">Loading…</p>
  if (!data) return <p className="salSummaryError">No data for this period.</p>

  const advance = parseFloat(data.advance_total) || 0
  const penalty = parseFloat(data.penalty_total) || 0
  const gross = parseFloat(data.gross_salary) || 0
  const amountToBePaid = parseFloat(data.amount_to_be_paid) ?? (gross - advance - penalty)
  const monthName = new Date(2000, data.month - 1).toLocaleString('default', { month: 'long' })
  const isHourly = (data.salary_type || '').toLowerCase() === 'hourly'

  return (
    <div className="salSummaryPage">
      <div className="salSummaryTop">
        <div className="salSummaryFilters">
          <div className="salSummaryFilterGroup">
            <label className="label">Month</label>
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div className="salSummaryFilterGroup">
            <label className="label">Year</label>
            <input
              type="number"
              className="input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || currentYear)}
              min={2020}
              max={2100}
            />
          </div>
        </div>
        <h2 className="salSummaryMonthHeading">{monthName} {data.year}</h2>
      </div>

      <div className="salSummaryCards">
      <div className="salSummaryCard card">
        <h3 className="salSummaryCardTitle">Attendance</h3>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Days present</span>
          <span className="salSummaryRowValue">{data.days_present ?? 0}</span>
        </div>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Total working hours</span>
          <span className="salSummaryRowValue">{Number(data.total_working_hours ?? 0).toFixed(2)} h</span>
        </div>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Overtime hours</span>
          <span className="salSummaryRowValue">{Number(data.overtime_hours ?? 0).toFixed(2)} h</span>
        </div>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Bonus (hours)</span>
          <span className="salSummaryRowValue">{Number(data.bonus ?? 0).toFixed(2)} h</span>
        </div>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Bonus (₹)</span>
          <span className="salSummaryRowValue">₹ {Number(data.bonus_rs ?? 0).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="salSummaryCard card">
        <h3 className="salSummaryCardTitle">Salary & deductions</h3>
        {isHourly && (
          <div className="salSummaryRow">
            <span className="salSummaryRowLabel">Rate (per hour)</span>
            <span className="salSummaryRowValue">₹ {Number(data.base_salary ?? 0).toLocaleString('en-IN')}</span>
          </div>
        )}
        {!isHourly && (
          <div className="salSummaryRow">
            <span className="salSummaryRowLabel">Base salary</span>
            <span className="salSummaryRowValue">₹ {Number(data.base_salary ?? 0).toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Earned (from hours)</span>
          <span className="salSummaryRowValue">₹ {Number(data.earned_before_bonus ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Bonus (₹)</span>
          <span className="salSummaryRowValue">₹ {Number(data.bonus_rs ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="salSummaryRow salSummarySubtotal">
          <span className="salSummaryRowLabel">Total gross (after bonus)</span>
          <span className="salSummaryRowValue">₹ {Number(data.gross_salary ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Advance (deduction)</span>
          <span className="salSummaryRowValue deduction">− ₹ {Number(data.advance_total ?? 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="salSummaryRow">
          <span className="salSummaryRowLabel">Penalty (deduction)</span>
          <span className="salSummaryRowValue deduction">− ₹ {Number(data.penalty_total ?? 0).toLocaleString('en-IN')}</span>
        </div>
        <div className="salSummaryRow salSummaryNetRow">
          <span className="salSummaryRowLabel">Amount to be paid (final)</span>
          <span className="salSummaryRowValue highlight">₹ {Number(amountToBePaid).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      </div>
    </div>
  )
}
