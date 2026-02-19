import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { adjustments, attendance, employees, penalty as penaltyApi, bonus, advance, salary } from '../api'
import './Table.css'
import './AdjustmentPanel.css'

const ADJUST_TABS = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'bonus', label: 'Bonus' },
  { id: 'penalty', label: 'Penalty' },
  { id: 'advance', label: 'Advance' },
]
const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Week off', label: 'Week off' },
  { value: 'Holiday', label: 'Holiday' },
]
const SALARY_TYPE_OPTIONS = [
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Hourly', label: 'Hourly' },
  { value: 'Fixed', label: 'Fixed' },
]

/** Per-hour rate: Hourly = base_salary; Monthly/Fixed = base_salary / 208 (26 days × 8 h, same as backend). */
function perHourFromBase(baseSalary, salaryType) {
  if (baseSalary == null || baseSalary === '') return null
  const base = Number(baseSalary)
  if (Number.isNaN(base) || base < 0) return null
  const st = (salaryType || 'Monthly').toLowerCase()
  if (st === 'hourly') return base
  return base / 208
}
const MONTHS = [
  { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' }, { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' },
]
const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const YEARS = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i)

function timeToInputValue(t) {
  if (!t) return ''
  const s = typeof t === 'string' ? t : t.toString()
  return s.slice(0, 5)
}

/** Parse "HH:MM" or "HH:MM:SS" to decimal hours */
function timeToHours(t) {
  if (!t) return null
  const s = typeof t === 'string' ? t : t.toString()
  const parts = s.split(':').map(Number)
  if (parts.length < 2) return null
  return parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600
}

/** Expected shift duration (handles next-day e.g. 22:00→06:00) */
function shiftDurationHours(from, to) {
  const f = timeToHours(from)
  const t = timeToHours(to)
  if (f == null || t == null) return null
  let diff = t - f
  if (diff <= 0) diff += 24
  return diff
}

/** OT = working_hours - expected_shift (whole hours only) */
function calcOvertime(punchIn, punchOut, shiftFrom, shiftTo) {
  const inH = timeToHours(punchIn)
  const outH = timeToHours(punchOut)
  if (inH == null || outH == null) return 0
  let diff = outH - inH
  if (diff < 0) diff += 24
  const totalWorking = diff
  const expected = shiftDurationHours(shiftFrom, shiftTo)
  if (expected == null || expected <= 0) return 0
  const ot = totalWorking - expected
  return ot > 0 ? Math.floor(ot) : 0
}

export default function AdjustmentPanel() {
  const [activeTab, setActiveTab] = useState('attendance')
  const [list, setList] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listFilters, setListFilters] = useState({ emp_code: '', date_from: '', date_to: '' })

  const [form, setForm] = useState({ emp_code: '', date: '', punch_in: '', punch_out: '', reason: '', created_by_admin: 'admin' })
  const [noPunchOut, setNoPunchOut] = useState(false) // true = no punch out yet, carry forward to next day
  const [submitLoading, setSubmitLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [empSearch, setEmpSearch] = useState('')
  const [empSuggestions, setEmpSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestRef = useRef(null)

  const [currentRecord, setCurrentRecord] = useState(null)
  const [currentRecordLoading, setCurrentRecordLoading] = useState(false)

  // Bonus tab (uses form.emp_code)
  const [bonusMonth, setBonusMonth] = useState(currentMonth)
  const [bonusYear, setBonusYear] = useState(currentYear)
  const [bonusHours, setBonusHours] = useState('')
  const [bonusMode, setBonusMode] = useState('give') // 'give' = add, 'set' = set exact
  const [bonusLoading, setBonusLoading] = useState(false)
  const [bonusCurrent, setBonusCurrent] = useState(null)
  const [bonusMessage, setBonusMessage] = useState('')
  const [bonusDetails, setBonusDetails] = useState(null) // history: shift_ot_bonus, manual_bonus_grants
  const [bonusDetailsLoading, setBonusDetailsLoading] = useState(false)

  // Penalty tab (uses form.emp_code)
  const [penaltyList, setPenaltyList] = useState([])
  const [penaltyAmount, setPenaltyAmount] = useState('')
  const [penaltyDesc, setPenaltyDesc] = useState('')
  const [penaltyDate, setPenaltyDate] = useState(new Date().toISOString().slice(0, 10))
  const [penaltyLoading, setPenaltyLoading] = useState(false)
  const [penaltyMessage, setPenaltyMessage] = useState('')

  // Advance tab (uses form.emp_code)
  const [advanceMonth, setAdvanceMonth] = useState(currentMonth)
  const [advanceYear, setAdvanceYear] = useState(currentYear)
  const [advanceList, setAdvanceList] = useState([])
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceNote, setAdvanceNote] = useState('')
  const [advanceLoading, setAdvanceLoading] = useState(false)
  const [advanceMessage, setAdvanceMessage] = useState('')

  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [statusUpdateLoading, setStatusUpdateLoading] = useState(false)
  const [salaryEdit, setSalaryEdit] = useState({ base_salary: '', salary_type: 'Monthly' })
  const [salarySaving, setSalarySaving] = useState(false)
  const [deptDesignationEdit, setDeptDesignationEdit] = useState({ dept_name: '', designation: '' })
  const [deptDesignationSaving, setDeptDesignationSaving] = useState(false)
  const [filterOptions, setFilterOptions] = useState({ departments: [], designations: [] })

  useEffect(() => {
    employees.list({ include_filters: 'true', page_size: 1 })
      .then((r) => setFilterOptions(r.data?.filters || { departments: [], designations: [] }))
      .catch(() => {})
  }, [])

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
          const hasNoPunchOut = !record.punch_out
          setForm((f) => ({
            ...f,
            punch_in: timeToInputValue(record.punch_in),
            punch_out: hasNoPunchOut ? '' : timeToInputValue(record.punch_out),
          }))
          setNoPunchOut(hasNoPunchOut)
        } else {
          setForm((f) => ({ ...f, punch_in: '', punch_out: '' }))
          setNoPunchOut(false)
        }
      })
      .catch(() => {
        setCurrentRecord(null)
        setForm((f) => ({ ...f, punch_in: '', punch_out: '' }))
        setNoPunchOut(false)
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
    setSelectedEmployee(emp)
    setSalaryEdit({
      base_salary: emp.base_salary != null ? String(emp.base_salary) : '',
      salary_type: emp.salary_type || 'Monthly',
    })
    setDeptDesignationEdit({
      dept_name: emp.dept_name || '',
      designation: emp.designation || '',
    })
  }

  const saveDeptDesignation = () => {
    if (!selectedEmployee?.id) return
    setDeptDesignationSaving(true)
    employees.update(selectedEmployee.id, {
      dept_name: (deptDesignationEdit.dept_name || '').trim() || null,
      designation: (deptDesignationEdit.designation || '').trim() || null,
    })
      .then(() => setSelectedEmployee((prev) => prev ? { ...prev, dept_name: deptDesignationEdit.dept_name, designation: deptDesignationEdit.designation } : null))
      .catch(() => {})
      .finally(() => setDeptDesignationSaving(false))
  }

  const saveSalary = () => {
    if (!selectedEmployee?.id) return
    const baseVal = salaryEdit.base_salary.trim()
    const baseNum = baseVal === '' ? null : parseFloat(baseVal)
    if (baseVal !== '' && (Number.isNaN(baseNum) || baseNum < 0)) return
    const payload = {
      base_salary: baseVal === '' ? null : baseNum,
      salary_type: salaryEdit.salary_type,
    }
    setSalarySaving(true)
    employees.update(selectedEmployee.id, payload)
      .then(() => {
        setSelectedEmployee((prev) => prev ? { ...prev, base_salary: payload.base_salary, salary_type: payload.salary_type } : null)
      })
      .catch(() => {})
      .finally(() => setSalarySaving(false))
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
      if (noPunchOut) {
        payload.punch_out = null
      } else if (form.punch_out) {
        payload.punch_out = form.punch_out + (form.punch_out.length === 5 ? ':00' : '')
      }
      // OT is auto-calculated by backend from punch times + shift
      const res = await attendance.adjust(payload)
      const penaltyNote = res.data?.penalty_note
      setMessage(penaltyNote ? `Attendance adjusted and logged. ${penaltyNote}` : 'Attendance adjusted and logged.')
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

  // Load current bonus for selected emp + month/year
  useEffect(() => {
    if (!form.emp_code || !bonusMonth || !bonusYear || activeTab !== 'bonus') {
      setBonusCurrent(null)
      return
    }
    salary.monthly(bonusMonth, bonusYear, '', form.emp_code)
      .then((r) => {
        const rows = Array.isArray(r.data) ? r.data : (r.data?.rows ?? [])
        const row = rows.find((x) => (x.emp_code || '').toString().toLowerCase() === (form.emp_code || '').toString().toLowerCase())
        setBonusCurrent(row ? { bonus: row.bonus, emp_code: row.emp_code } : null)
      })
      .catch(() => setBonusCurrent(null))
  }, [form.emp_code, bonusMonth, bonusYear, activeTab])

  // Load bonus history (shift OT + manual grants) for selected emp + month/year
  useEffect(() => {
    if (!form.emp_code || !bonusMonth || !bonusYear || activeTab !== 'bonus') {
      setBonusDetails(null)
      return
    }
    setBonusDetailsLoading(true)
    bonus.employeeDetails(form.emp_code, bonusMonth, bonusYear)
      .then((r) => setBonusDetails(r.data || null))
      .catch(() => setBonusDetails(null))
      .finally(() => setBonusDetailsLoading(false))
  }, [form.emp_code, bonusMonth, bonusYear, activeTab])

  const refreshBonusData = () => {
    if (!form.emp_code || !bonusMonth || !bonusYear) return Promise.resolve()
    return Promise.all([
      salary.monthly(bonusMonth, bonusYear, '', form.emp_code).then((r) => {
        const rows = Array.isArray(r.data) ? r.data : (r.data?.rows ?? [])
        const row = rows.find((x) => (x.emp_code || '').toString().toLowerCase() === (form.emp_code || '').toString().toLowerCase())
        setBonusCurrent(row ? { bonus: row.bonus, emp_code: row.emp_code } : null)
      }).catch(() => {}),
      bonus.employeeDetails(form.emp_code, bonusMonth, bonusYear).then((r) => setBonusDetails(r.data || null)).catch(() => {}),
    ])
  }

  const handleBonusSubmit = async (e) => {
    e.preventDefault()
    const hrs = parseFloat(bonusHours)
    if (!form.emp_code || (bonusMode === 'give' ? (hrs <= 0 || isNaN(hrs)) : (isNaN(hrs) || hrs < 0))) {
      setBonusMessage('Select employee and enter valid bonus hours.')
      return
    }
    setBonusLoading(true)
    setBonusMessage('')
    try {
      if (bonusMode === 'give') {
        await bonus.give(form.emp_code, hrs, bonusMonth, bonusYear)
        setBonusMessage(`Added ${hrs}h bonus.`)
      } else {
        await bonus.set(form.emp_code, hrs, bonusMonth, bonusYear)
        setBonusMessage(`Bonus set to ${hrs}h.`)
      }
      setBonusHours('')
      refreshBonusData()
    } catch (err) {
      setBonusMessage(err.response?.data?.error || err.message || 'Failed')
    } finally {
      setBonusLoading(false)
    }
  }

  const handleBonusClear = async () => {
    if (!form.emp_code || !window.confirm(`Set bonus to 0 for this employee for ${bonusMonth}/${bonusYear}?`)) return
    setBonusLoading(true)
    setBonusMessage('')
    try {
      await bonus.set(form.emp_code, 0, bonusMonth, bonusYear)
      setBonusMessage('Bonus cleared (set to 0).')
      refreshBonusData()
    } catch (err) {
      setBonusMessage(err.response?.data?.error || err.message || 'Failed')
    } finally {
      setBonusLoading(false)
    }
  }

  const handleBonusRemoveGrant = async (row) => {
    const hours = row.hours != null ? parseFloat(String(row.hours)) : 0
    if (!form.emp_code || isNaN(hours) || hours <= 0) return
    const current = bonusCurrent && bonusCurrent.bonus != null ? parseFloat(String(bonusCurrent.bonus)) : 0
    const newTotal = Math.max(0, current - hours)
    if (!window.confirm(`Remove ${hours}h from bonus? New total will be ${newTotal}h.`)) return
    const month = parseInt(bonusMonth, 10)
    const year = parseInt(bonusYear, 10)
    if (isNaN(month) || isNaN(year)) {
      setBonusMessage('Invalid month/year.')
      return
    }
    setBonusLoading(true)
    setBonusMessage('')
    try {
      await bonus.set(form.emp_code, newTotal, month, year)
      await bonus.hideGrant(form.emp_code, month, year, row.hours, row.given_at || '')
      setBonusMessage(`Removed ${hours}h.`)
      await refreshBonusData()
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed'
      setBonusMessage(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setBonusLoading(false)
    }
  }

  // Load penalties for selected employee
  useEffect(() => {
    if (!form.emp_code || activeTab !== 'penalty') {
      setPenaltyList([])
      return
    }
    penaltyApi.list({ emp_code: form.emp_code }).then((r) => setPenaltyList(r.data?.results ?? r.data ?? [])).catch(() => setPenaltyList([]))
  }, [form.emp_code, activeTab])

  const handlePenaltyCreate = async (e) => {
    e.preventDefault()
    const amt = parseFloat(penaltyAmount)
    if (!form.emp_code || isNaN(amt) || amt < 0) {
      setPenaltyMessage('Select employee and enter valid amount.')
      return
    }
    setPenaltyLoading(true)
    setPenaltyMessage('')
    try {
      await penaltyApi.create({ emp_code: form.emp_code, deduction_amount: amt, description: penaltyDesc || 'Manual penalty', date: penaltyDate })
      setPenaltyMessage('Penalty added.')
      setPenaltyAmount('')
      setPenaltyDesc('')
      penaltyApi.list({ emp_code: form.emp_code }).then((r) => setPenaltyList(r.data?.results ?? r.data ?? [])).catch(() => {})
    } catch (err) {
      setPenaltyMessage(err.response?.data?.error || err.message || 'Failed')
    } finally {
      setPenaltyLoading(false)
    }
  }

  const loadAdvanceList = () => {
    if (!form.emp_code || !advanceMonth || !advanceYear) {
      setAdvanceList([])
      return
    }
    advance.list(advanceMonth, advanceYear).then((r) => {
      const data = r.data?.results ?? r.data ?? []
      setAdvanceList(Array.isArray(data) ? data.filter((a) => (a.emp_code || '').toString().toLowerCase() === (form.emp_code || '').toString().toLowerCase()) : [])
    }).catch(() => setAdvanceList([]))
  }

  useEffect(() => {
    if (activeTab === 'advance') loadAdvanceList()
  }, [form.emp_code, advanceMonth, advanceYear, activeTab])

  const handleAdvanceCreate = async (e) => {
    e.preventDefault()
    const amt = parseFloat(advanceAmount)
    if (!form.emp_code || isNaN(amt) || amt <= 0) {
      setAdvanceMessage('Select employee and enter valid amount.')
      return
    }
    setAdvanceLoading(true)
    setAdvanceMessage('')
    try {
      await advance.create({ emp_code: form.emp_code, amount: amt, month: advanceMonth, year: advanceYear, note: advanceNote })
      setAdvanceMessage('Advance added.')
      setAdvanceAmount('')
      setAdvanceNote('')
      loadAdvanceList()
    } catch (err) {
      setAdvanceMessage(err.response?.data?.error || err.message || 'Failed')
    } finally {
      setAdvanceLoading(false)
    }
  }

  const handleAdvanceDelete = async (id) => {
    if (!window.confirm('Remove this advance?')) return
    try {
      await advance.delete(id)
      loadAdvanceList()
    } catch (err) {
      setAdvanceMessage(err.response?.data?.error || err.message || 'Failed')
    }
  }

  // Calculated OT from punch times + shift (preview)
  const calculatedOT = currentRecord && form.punch_in && form.punch_out && currentRecord.shift_from && currentRecord.shift_to
    ? calcOvertime(form.punch_in, form.punch_out, currentRecord.shift_from, currentRecord.shift_to)
    : null

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Adjustment Panel</h2>
      <p className="muted adjustmentIntro">Adjust attendance, bonus, penalty, or advance per employee. Use the tabs below.</p>

      <div className="adjustmentTabs">
        {ADJUST_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`adjustmentTab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Employee selector — shown for all tabs */}
      <div className="card adjustmentFilterCard" ref={suggestRef}>
        <h3 className="adjustmentCardTitle">{activeTab === 'attendance' ? '1. Find record' : 'Select employee'}</h3>
        <div className="adjustmentFilterRow">
          <div className="adjustmentFilterGroup">
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
          {activeTab === 'attendance' && (
            <div className="adjustmentFilterGroup">
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
          )}
          {activeTab === 'bonus' && (
            <>
              <div className="adjustmentFilterGroup">
                <label className="label">Month</label>
                <select className="input" value={bonusMonth} onChange={(e) => setBonusMonth(e.target.value)}>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="adjustmentFilterGroup">
                <label className="label">Year</label>
                <select className="input" value={bonusYear} onChange={(e) => setBonusYear(e.target.value)}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </>
          )}
          {activeTab === 'advance' && (
            <>
              <div className="adjustmentFilterGroup">
                <label className="label">Month</label>
                <select className="input" value={advanceMonth} onChange={(e) => setAdvanceMonth(e.target.value)}>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="adjustmentFilterGroup">
                <label className="label">Year</label>
                <select className="input" value={advanceYear} onChange={(e) => setAdvanceYear(e.target.value)}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        {activeTab === 'attendance' && currentRecordLoading && <p className="muted adjustmentLoadStatus">Loading record…</p>}
        {selectedEmployee && (
          <>
            <div className="adjustmentEmployeeBlock">
              <div className="adjustmentStatusRow">
                <label className="label">Employee status</label>
                <select
                  className="input adjustmentStatusSelect"
                  value={selectedEmployee.status || 'Active'}
                  disabled={statusUpdateLoading}
                  onChange={(e) => {
                    const newStatus = e.target.value
                    if (newStatus === selectedEmployee.status) return
                    setStatusUpdateLoading(true)
                    employees.update(selectedEmployee.id, { status: newStatus })
                      .then(() => setSelectedEmployee((prev) => prev ? { ...prev, status: newStatus } : null))
                      .catch(() => {})
                      .finally(() => setStatusUpdateLoading(false))
                  }}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="adjustmentSalaryRow">
                <div className="adjustmentSalaryGroup">
                  <label className="label">Department</label>
                  <input
                    type="text"
                    className="input"
                    value={deptDesignationEdit.dept_name}
                    disabled={deptDesignationSaving}
                    onChange={(e) => setDeptDesignationEdit((d) => ({ ...d, dept_name: e.target.value }))}
                    onBlur={saveDeptDesignation}
                    placeholder="Department"
                    list="adjustmentDeptList"
                  />
                  <datalist id="adjustmentDeptList">
                    {(filterOptions.departments || []).map((d) => <option key={d} value={d} />)}
                  </datalist>
                </div>
                <div className="adjustmentSalaryGroup">
                  <label className="label">Designation</label>
                  <input
                    type="text"
                    className="input"
                    value={deptDesignationEdit.designation}
                    disabled={deptDesignationSaving}
                    onChange={(e) => setDeptDesignationEdit((d) => ({ ...d, designation: e.target.value }))}
                    onBlur={saveDeptDesignation}
                    placeholder="Designation"
                    list="adjustmentDesigList"
                  />
                  <datalist id="adjustmentDesigList">
                    {(filterOptions.designations || []).map((d) => <option key={d} value={d} />)}
                  </datalist>
                </div>
              </div>
              <div className="adjustmentSalaryRow">
                <div className="adjustmentSalaryGroup">
                  <label className="label">Shift</label>
                  <span className="adjustmentSalaryReadOnly">{selectedEmployee.shift || '—'}</span>
                </div>
                <div className="adjustmentSalaryGroup">
                  <label className="label">Base salary (₹)</label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={salaryEdit.base_salary}
                    disabled={salarySaving}
                    onChange={(e) => setSalaryEdit((s) => ({ ...s, base_salary: e.target.value }))}
                    onBlur={saveSalary}
                  />
                </div>
                <div className="adjustmentSalaryGroup">
                  <label className="label">Salary type</label>
                  <select
                    className="input"
                    value={salaryEdit.salary_type}
                    disabled={salarySaving}
                    onChange={(e) => {
                      const v = e.target.value
                      setSalaryEdit((s) => ({ ...s, salary_type: v }))
                      if (selectedEmployee?.id) {
                        setSalarySaving(true)
                        employees.update(selectedEmployee.id, { salary_type: v })
                          .then(() => setSelectedEmployee((prev) => prev ? { ...prev, salary_type: v } : null))
                          .catch(() => {})
                          .finally(() => setSalarySaving(false))
                      }
                    }}
                  >
                    {SALARY_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="adjustmentSalaryGroup">
                  <label className="label">Per hour salary</label>
                  <span className="adjustmentPerHourValue">
                    {perHourFromBase(salaryEdit.base_salary, salaryEdit.salary_type) != null
                      ? `₹${Number(perHourFromBase(salaryEdit.base_salary, salaryEdit.salary_type)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {activeTab === 'attendance' && (
        <>
      {/* Shift info from database (when record loaded) */}
      {currentRecord && (currentRecord.shift || currentRecord.shift_from || currentRecord.shift_to) && (
        <div className="card adjustmentShiftBanner">
          <h4 className="adjustmentShiftTitle">Shift from database</h4>
          <div className="adjustmentShiftInfo">
            <span className="adjustmentShiftLabel">Shift:</span>
            <span className="adjustmentShiftValue">{currentRecord.shift || '—'}</span>
            <span className="adjustmentShiftLabel">From:</span>
            <span className="adjustmentShiftValue">{currentRecord.shift_from ? timeToInputValue(currentRecord.shift_from) : '—'}</span>
            <span className="adjustmentShiftLabel">To:</span>
            <span className="adjustmentShiftValue">{currentRecord.shift_to ? timeToInputValue(currentRecord.shift_to) : '—'}</span>
            <span className="adjustmentShiftNote">(OT is calculated when working hours exceed shift duration)</span>
          </div>
        </div>
      )}

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
                <span className="currentRecordValue">{currentRecord.punch_out ? timeToInputValue(currentRecord.punch_out) : '— (no punch out)'}</span>
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
              <div className="currentRecordItem currentRecordItemFull">
                <span className="currentRecordLabel">Shift OT bonus (12h+ rule)</span>
                <span className="currentRecordValue">
                  {Number(currentRecord.shift_ot_bonus_hours || 0) > 0 ? (
                    <span className="adjustmentBonusBadge" title={currentRecord.shift_ot_bonus_description || ''}>
                      {Number(currentRecord.shift_ot_bonus_hours).toFixed(0)}h bonus
                      {currentRecord.shift_ot_bonus_description ? ' — ' + currentRecord.shift_ot_bonus_description : ''}
                    </span>
                  ) : (
                    <span className="muted">No bonus (work &lt; 12h or not yet calculated)</span>
                  )}
                </span>
              </div>
              <div className="currentRecordItem currentRecordItemFull">
                <span className="currentRecordLabel">Penalty (late / manual)</span>
                <span className="currentRecordValue">
                  {Number(currentRecord.penalty_amount || 0) > 0 ? (
                    <span className="adjustmentPenaltyBadge" title={currentRecord.penalty_description || ''}>
                      Rs {Number(currentRecord.penalty_amount).toFixed(2)}
                      {currentRecord.penalty_description ? ' — ' + currentRecord.penalty_description : ''}
                      {currentRecord.penalty_id && (
                        <button type="button" className="adjustmentPenaltyRemove" onClick={async () => {
                          if (!window.confirm('Remove this penalty for this day?')) return
                          await penaltyApi.delete(currentRecord.penalty_id)
                          attendance.list({ emp_code: form.emp_code, date: form.date, page_size: 1 })
                            .then((r) => {
                              const results = r.data.results ?? r.data ?? []
                              setCurrentRecord(Array.isArray(results) && results.length ? results[0] : null)
                            })
                        }}>Remove</button>
                      )}
                    </span>
                  ) : (
                    <span className="muted">No penalty (on time or Fixed salary)</span>
                  )}
                </span>
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
          <div className="adjustmentPunchRow">
            <div className="adjustmentField">
              <label className="label">Punch In</label>
              <input type="time" className="input" value={form.punch_in} onChange={(e) => setForm((f) => ({ ...f, punch_in: e.target.value }))} />
            </div>
            <div className="adjustmentField">
              <label className="label">Punch Out</label>
              <input
                type="time"
                className="input"
                value={form.punch_out}
                onChange={(e) => setForm((f) => ({ ...f, punch_out: e.target.value }))}
                disabled={noPunchOut}
                title={noPunchOut ? 'Clear "No punch out" to enter time' : ''}
              />
            </div>
            <label className={`adjustmentNoPunchOutCompact ${noPunchOut ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={noPunchOut}
                onChange={(e) => {
                  setNoPunchOut(e.target.checked)
                  if (e.target.checked) setForm((f) => ({ ...f, punch_out: '' }))
                }}
              />
              <span>No punch out — carry to next day</span>
            </label>
          </div>
          <div className="adjustmentField">
            <label className="label">Overtime (auto)</label>
            <div className="adjustmentOTPreview">
              {calculatedOT !== null ? (
                <span className="adjustmentOTValue">{calculatedOT}h</span>
              ) : currentRecord && (!currentRecord.shift_from || !currentRecord.shift_to) ? (
                <span className="adjustmentOTMuted">No shift set — upload shift first</span>
              ) : (
                <span className="adjustmentOTMuted">Set punch in & out</span>
              )}
            </div>
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
        </>
      )}

      {activeTab === 'bonus' && (
        <>
          <div className="card adjustmentCurrentCard">
            <h3 className="adjustmentCardTitle">Current bonus</h3>
            {form.emp_code && bonusMonth && bonusYear ? (
              bonusCurrent != null ? (
                <p className="adjustmentBonusCurrent"><strong>{Number(bonusCurrent.bonus ?? 0).toFixed(2)}</strong> hours for this month</p>
              ) : (
                <p className="muted">No bonus record for this employee/month.</p>
              )
            ) : (
              <p className="muted">Select employee and month/year above.</p>
            )}
          </div>

          <div className="card adjustmentBonusHistoryCard">
            <h3 className="adjustmentCardTitle">Bonus history</h3>
            {bonusDetailsLoading ? (
              <p className="muted">Loading…</p>
            ) : form.emp_code && bonusMonth && bonusYear && bonusDetails ? (
              <>
                <h4 className="adjustmentBonusHistorySubtitle">Shift OT bonus (this month)</h4>
                {Array.isArray(bonusDetails.shift_ot_bonus) && bonusDetails.shift_ot_bonus.length > 0 ? (
                  <div className="tableCard">
                    <table className="adjustmentBonusHistoryTable">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Hours</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bonusDetails.shift_ot_bonus.map((row, i) => (
                          <tr key={i}>
                            <td>{row.date || '—'}</td>
                            <td>{Number(row.bonus_hours ?? 0).toFixed(2)}</td>
                            <td>{row.description || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">No shift OT bonus for this month.</p>
                )}
                <h4 className="adjustmentBonusHistorySubtitle">Manual bonus (this month)</h4>
                {Array.isArray(bonusDetails.manual_bonus_grants) && bonusDetails.manual_bonus_grants.length > 0 ? (
                  <div className="tableCard">
                    <table className="adjustmentBonusHistoryTable">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Hours</th>
                          <th>Total after</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bonusDetails.manual_bonus_grants.map((row, i) => (
                          <tr key={i}>
                            <td>{row.given_at ? new Date(row.given_at).toLocaleString() : '—'}</td>
                            <td>{row.hours != null ? Number(row.hours).toFixed(2) : '—'}</td>
                            <td>{row.new_total != null ? Number(row.new_total).toFixed(2) : '—'}</td>
                            <td className="adjustmentBonusHistoryAction">
                              <button
                                type="button"
                                className="btn btn-secondary adjustmentBonusRemoveBtn"
                                onClick={() => handleBonusRemoveGrant(row)}
                                disabled={bonusLoading || (row.hours != null && parseFloat(row.hours) <= 0)}
                                title="Subtract this grant from current bonus"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">No manual bonus grants on record.</p>
                )}
              </>
            ) : (
              <p className="muted">Select employee and month/year above to see history.</p>
            )}
          </div>

          <div className="card adjustmentFormCard">
            <h3 className="adjustmentCardTitle">Add or set bonus</h3>
            <form onSubmit={handleBonusSubmit} className="adjustmentForm">
              <div className="adjustmentField">
                <label className="label">Mode</label>
                <select className="input" value={bonusMode} onChange={(e) => setBonusMode(e.target.value)}>
                  <option value="give">Give (add hours)</option>
                  <option value="set">Set (exact hours)</option>
                </select>
              </div>
              <div className="adjustmentField">
                <label className="label">Hours</label>
                <input type="number" step="0.5" min="0" className="input" value={bonusHours} onChange={(e) => setBonusHours(e.target.value)} placeholder="0" />
              </div>
              <div className="adjustmentField adjustmentSubmit">
                <button type="submit" className="btn btn-primary" disabled={bonusLoading || !form.emp_code}>
                  {bonusLoading ? 'Saving…' : bonusMode === 'give' ? 'Add bonus' : 'Set bonus'}
                </button>
              </div>
              <div className="adjustmentField adjustmentSubmit">
                <button type="button" className="btn btn-secondary" onClick={handleBonusClear} disabled={bonusLoading || !form.emp_code}>
                  Clear bonus (set to 0)
                </button>
              </div>
            </form>
            {bonusMessage && <p className={`adjustmentMessage ${bonusMessage.includes('Failed') ? 'error' : 'success'}`}>{bonusMessage}</p>}
          </div>
        </>
      )}

      {activeTab === 'penalty' && (
        <>
          <div className="card adjustmentCurrentCard">
            <h3 className="adjustmentCardTitle">Penalties for this employee</h3>
            {form.emp_code ? (
              penaltyList.length > 0 ? (
                <ul className="adjustmentPenaltyList">
                  {penaltyList.map((p) => (
                    <li key={p.id} className="adjustmentPenaltyItem">
                      <span className="adjustmentPenaltyAmount">Rs {Number(p.deduction_amount || 0).toFixed(2)}</span>
                      <span className="adjustmentPenaltyMeta">{p.date || '—'} — {p.description || '—'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No penalties on record.</p>
              )
            ) : (
              <p className="muted">Select employee above.</p>
            )}
          </div>
          <div className="card adjustmentFormCard">
            <h3 className="adjustmentCardTitle">Add penalty</h3>
            <form onSubmit={handlePenaltyCreate} className="adjustmentForm">
              <div className="adjustmentField">
                <label className="label">Amount (Rs)</label>
                <input type="number" step="0.01" min="0" className="input" value={penaltyAmount} onChange={(e) => setPenaltyAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="adjustmentField adjustmentFieldWide">
                <label className="label">Description</label>
                <input type="text" className="input" value={penaltyDesc} onChange={(e) => setPenaltyDesc(e.target.value)} placeholder="e.g. Late arrival" />
              </div>
              <div className="adjustmentField">
                <label className="label">Date</label>
                <input type="date" className="input" value={penaltyDate} onChange={(e) => setPenaltyDate(e.target.value)} />
              </div>
              <div className="adjustmentField adjustmentSubmit">
                <button type="submit" className="btn btn-primary" disabled={penaltyLoading || !form.emp_code}>
                  {penaltyLoading ? 'Adding…' : 'Add penalty'}
                </button>
              </div>
            </form>
            {penaltyMessage && <p className={`adjustmentMessage ${penaltyMessage.includes('Failed') ? 'error' : 'success'}`}>{penaltyMessage}</p>}
          </div>
        </>
      )}

      {activeTab === 'advance' && (
        <>
          <div className="card adjustmentCurrentCard">
            <h3 className="adjustmentCardTitle">Advances for this employee (month/year)</h3>
            {form.emp_code && advanceMonth && advanceYear ? (
              advanceList.length > 0 ? (
                <ul className="adjustmentAdvanceList">
                  {advanceList.map((a) => (
                    <li key={a.id} className="adjustmentAdvanceItem">
                      <span className="adjustmentAdvanceAmount">Rs {Number(a.amount || 0).toFixed(2)}</span>
                      <span className="adjustmentAdvanceNote">{a.note || '—'}</span>
                      <button type="button" className="btn btn-secondary adjustmentAdvanceDelete" onClick={() => handleAdvanceDelete(a.id)}>Remove</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No advances for this month/year.</p>
              )
            ) : (
              <p className="muted">Select employee and month/year above.</p>
            )}
          </div>
          <div className="card adjustmentFormCard">
            <h3 className="adjustmentCardTitle">Add advance</h3>
            <form onSubmit={handleAdvanceCreate} className="adjustmentForm">
              <div className="adjustmentField">
                <label className="label">Amount (Rs)</label>
                <input type="number" step="0.01" min="0" className="input" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="adjustmentField adjustmentFieldWide">
                <label className="label">Note</label>
                <input type="text" className="input" value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} placeholder="Optional" />
              </div>
              <div className="adjustmentField adjustmentSubmit">
                <button type="submit" className="btn btn-primary" disabled={advanceLoading || !form.emp_code}>
                  {advanceLoading ? 'Adding…' : 'Add advance'}
                </button>
              </div>
            </form>
            {advanceMessage && <p className={`adjustmentMessage ${advanceMessage.includes('Failed') ? 'error' : 'success'}`}>{advanceMessage}</p>}
          </div>
        </>
      )}
    </div>
  )
}
