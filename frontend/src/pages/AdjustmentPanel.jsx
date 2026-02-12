import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { adjustments, attendance, employees } from '../api'
import './Table.css'
import './AdjustmentPanel.css'

function timeToInputValue(t) {
  if (!t) return ''
  const s = typeof t === 'string' ? t : t.toString()
  return s.slice(0, 5)
}

export default function AdjustmentPanel() {
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listFilters, setListFilters] = useState({ emp_code: '', date_from: '', date_to: '' })

  const [form, setForm] = useState({ emp_code: '', date: '', punch_in: '', punch_out: '', over_time: '', reason: '', created_by_admin: 'admin' })
  const [submitLoading, setSubmitLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [empSuggestions, setEmpSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestRef = useRef(null)

  const [currentRecord, setCurrentRecord] = useState(null)
  const [currentRecordLoading, setCurrentRecordLoading] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggestions(false)
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
          setShowSuggestions(true)
        })
        .catch(() => setEmpSuggestions([]))
    }, 200)
    return () => clearTimeout(t)
  }, [empSearch])

  // Fetch current attendance when emp_code + date are set
  useEffect(() => {
    if (!form.emp_code || !form.date) {
      setCurrentRecord(null)
      return
    }
    setCurrentRecordLoading(true)
    setCurrentRecord(null)
    attendance.list({ emp_code: form.emp_code, date: form.date, page_size: 1 })
      .then((r) => {
        const results = r.data.results ?? r.data ?? []
        const record = Array.isArray(results) && results.length ? results[0] : null
        setCurrentRecord(record)
        if (record) {
          setForm((f) => ({
            ...f,
            punch_in: timeToInputValue(record.punch_in),
            punch_out: timeToInputValue(record.punch_out),
            over_time: record.over_time != null ? String(record.over_time) : '',
          }))
        } else {
          setForm((f) => ({ ...f, punch_in: '', punch_out: '', over_time: '' }))
        }
      })
      .catch(() => {
        setCurrentRecord(null)
        setForm((f) => ({ ...f, punch_in: '', punch_out: '', over_time: '' }))
      })
      .finally(() => setCurrentRecordLoading(false))
  }, [form.emp_code, form.date])

  const loadList = () => {
    setListLoading(true)
    const params = {}
    if (listFilters.emp_code) params.emp_code = listFilters.emp_code
    if (listFilters.date_from) params.date_from = listFilters.date_from
    if (listFilters.date_to) params.date_to = listFilters.date_to
    adjustments.list(params)
      .then((r) => setList(r.data.results ?? r.data ?? []))
      .catch(() => setList([]))
      .finally(() => setListLoading(false))
  }

  useEffect(() => {
    loadList()
  }, [])

  const selectEmployee = (emp) => {
    setForm((f) => ({ ...f, emp_code: emp.emp_code }))
    setEmpSearch(`${emp.emp_code} - ${emp.name || ''}`)
    setShowSuggestions(false)
    setEmpSuggestions([])
  }

  const handleAdjust = async (e) => {
    e.preventDefault()
    if (!form.emp_code || !form.date) {
      setMessage('Select employee and date first')
      return
    }
    setSubmitLoading(true)
    setMessage('')
    try {
      const payload = {
        emp_code: form.emp_code,
        date: form.date,
        reason: form.reason,
        created_by_admin: form.created_by_admin,
      }
      if (form.punch_in) payload.punch_in = form.punch_in + (form.punch_in.length === 5 ? ':00' : '')
      if (form.punch_out) payload.punch_out = form.punch_out + (form.punch_out.length === 5 ? ':00' : '')
      if (form.over_time !== '') payload.over_time = form.over_time
      await attendance.adjust(payload)
      setMessage('Attendance adjusted and logged.')
      loadList()
      setCurrentRecord(null)
      attendance.list({ emp_code: form.emp_code, date: form.date, page_size: 1 })
        .then((r) => {
          const results = r.data.results ?? r.data ?? []
          const record = Array.isArray(results) && results.length ? results[0] : null
          setCurrentRecord(record)
        })
        .catch(() => {})
    } catch (err) {
      setMessage(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed')
    } finally {
      setSubmitLoading(false)
    }
  }

  const applyListFilters = () => {
    setListLoading(true)
    const params = {}
    if (listFilters.emp_code) params.emp_code = listFilters.emp_code
    if (listFilters.date_from) params.date_from = listFilters.date_from
    if (listFilters.date_to) params.date_to = listFilters.date_to
    adjustments.list(params)
      .then((r) => setList(r.data.results ?? r.data ?? []))
      .catch(() => setList([]))
      .finally(() => setListLoading(false))
  }

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Adjustment Panel</h2>
      <p className="muted adjustmentIntro">Select employee and date to load existing attendance, then edit and save. All changes are logged below.</p>

      {/* Step 1: Filter — Emp + Date */}
      <div className="card adjustmentFilterCard">
        <h3 className="adjustmentCardTitle">1. Find record</h3>
        <div className="adjustmentFilterRow">
          <div className="adjustmentFilterGroup" ref={suggestRef}>
            <label className="label">Employee (Code or Name)</label>
            <input
              type="text"
              className="input"
              placeholder="Type to search..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              onFocus={() => empSuggestions.length > 0 && setShowSuggestions(true)}
            />
            {showSuggestions && empSuggestions.length > 0 && (
              <ul className="suggestionsList">
                {empSuggestions.map((emp) => (
                  <li key={emp.id}>
                    <button type="button" className="suggestionItem" onClick={() => selectEmployee(emp)}>
                      <strong>{emp.emp_code}</strong> — {emp.name || '—'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="adjustmentFilterGroup">
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>
        {currentRecordLoading && <p className="muted adjustmentLoadStatus">Loading record…</p>}
      </div>

      {/* Current record display */}
      {form.emp_code && form.date && !currentRecordLoading && (
        <div className="card adjustmentCurrentCard">
          <h3 className="adjustmentCardTitle">Current record for this date</h3>
          {currentRecord ? (
            <div className="currentRecordGrid">
              <div className="currentRecordItem">
                <span className="currentRecordLabel">Punch In</span>
                <span className="currentRecordValue">{currentRecord.punch_in ? timeToInputValue(currentRecord.punch_in) : '—'}</span>
              </div>
              <div className="currentRecordItem">
                <span className="currentRecordLabel">Punch Out</span>
                <span className="currentRecordValue">{currentRecord.punch_out ? timeToInputValue(currentRecord.punch_out) : '—'}</span>
              </div>
              <div className="currentRecordItem">
                <span className="currentRecordLabel">Working Hrs</span>
                <span className="currentRecordValue">{Number(currentRecord.total_working_hours || 0).toFixed(2)}</span>
              </div>
              <div className="currentRecordItem">
                <span className="currentRecordLabel">Break</span>
                <span className="currentRecordValue">{Number(currentRecord.total_break || 0).toFixed(2)}</span>
              </div>
              <div className="currentRecordItem">
                <span className="currentRecordLabel">Status</span>
                <span className="currentRecordValue"><span className={`badge badge-${currentRecord.status === 'Present' ? 'success' : currentRecord.status === 'Absent' ? 'danger' : 'warn'}`}>{currentRecord.status}</span></span>
              </div>
              <div className="currentRecordItem">
                <span className="currentRecordLabel">Overtime</span>
                <span className="currentRecordValue">{Number(currentRecord.over_time || 0).toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <p className="muted">No attendance record for this date. You can still enter values below and save to create or update.</p>
          )}
        </div>
      )}

      {/* Step 2: Edit and save */}
      <div className="card adjustmentFormCard">
        <h3 className="adjustmentCardTitle">2. Edit and save</h3>
        <form onSubmit={handleAdjust} className="adjustmentForm">
          <div className="adjustmentField">
            <label className="label">Punch In</label>
            <input type="time" className="input" value={form.punch_in} onChange={(e) => setForm((f) => ({ ...f, punch_in: e.target.value }))} />
          </div>
          <div className="adjustmentField">
            <label className="label">Punch Out</label>
            <input type="time" className="input" value={form.punch_out} onChange={(e) => setForm((f) => ({ ...f, punch_out: e.target.value }))} />
          </div>
          <div className="adjustmentField">
            <label className="label">Overtime</label>
            <input type="number" step="0.5" className="input" value={form.over_time} onChange={(e) => setForm((f) => ({ ...f, over_time: e.target.value }))} style={{ width: 90 }} />
          </div>
          <div className="adjustmentField adjustmentFieldWide">
            <label className="label">Reason</label>
            <input className="input" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Manual correction" />
          </div>
          <div className="adjustmentField">
            <label className="label">Admin</label>
            <input className="input" value={form.created_by_admin} onChange={(e) => setForm((f) => ({ ...f, created_by_admin: e.target.value }))} style={{ width: 120 }} />
          </div>
          <div className="adjustmentField adjustmentSubmit">
            <button type="submit" className="btn btn-primary" disabled={submitLoading || !form.emp_code || !form.date}>
              {submitLoading ? 'Saving…' : 'Save adjustment'}
            </button>
          </div>
        </form>
        {message && <p className={`adjustmentMessage ${message.includes('Failed') || message.includes('Error') ? 'error' : 'success'}`}>{message}</p>}
      </div>

      {/* Adjustment log with filters */}
      <div className="card adjustmentLogCard">
        <h3 className="adjustmentCardTitle">Adjustment log</h3>
        <div className="adjustmentLogFilters">
          <div className="filterGroup">
            <label className="label">Emp Code</label>
            <input
              type="text"
              className="input"
              placeholder="Filter by code"
              value={listFilters.emp_code}
              onChange={(e) => setListFilters((f) => ({ ...f, emp_code: e.target.value }))}
              style={{ width: 120 }}
            />
          </div>
          <div className="filterGroup">
            <label className="label">Date from</label>
            <input
              type="date"
              className="input"
              value={listFilters.date_from}
              onChange={(e) => setListFilters((f) => ({ ...f, date_from: e.target.value }))}
              style={{ width: 140 }}
            />
          </div>
          <div className="filterGroup">
            <label className="label">Date to</label>
            <input
              type="date"
              className="input"
              value={listFilters.date_to}
              onChange={(e) => setListFilters((f) => ({ ...f, date_to: e.target.value }))}
              style={{ width: 140 }}
            />
          </div>
          <button type="button" className="btn btn-secondary" onClick={applyListFilters}>Apply filters</button>
        </div>
        {listLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="tableCard">
            <table>
              <thead>
                <tr>
                  <th>Emp Code</th>
                  <th>Date</th>
                  <th>Prev Punch In</th>
                  <th>Prev Punch Out</th>
                  <th>Prev OT</th>
                  <th>Reason</th>
                  <th>By</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(list) ? list : []).map((row) => (
                  <tr key={row.id}>
                    <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                    <td>{row.adj_date}</td>
                    <td>{row.adj_punch_in || '—'}</td>
                    <td>{row.adj_punch_out || '—'}</td>
                    <td>{row.adj_overtime != null ? Number(row.adj_overtime).toFixed(2) : '—'}</td>
                    <td>{row.reason || '—'}</td>
                    <td>{row.created_by_admin || '—'}</td>
                    <td>{row.created_at?.slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!listLoading && Array.isArray(list) && list.length === 0 && <p className="muted">No adjustments match the filters.</p>}
      </div>
    </div>
  )
}
