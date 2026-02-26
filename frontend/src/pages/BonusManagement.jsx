import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { bonus, employees as empApi } from '../api'
import './Table.css'
import './BonusManagement.css'


const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()
const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function BonusManagement() {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [data, setData] = useState({ summary: {}, employees: [] })
  const [loading, setLoading] = useState(true)

  // Give bonus panel
  const [giveOpen, setGiveOpen] = useState(false)
  const [giveMode, setGiveMode] = useState('single') // 'single' | 'multiple' | 'group'
  const [giveSearch, setGiveSearch] = useState('')
  const [giveResults, setGiveResults] = useState([])
  const [giveSearching, setGiveSearching] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [selectedEmps, setSelectedEmps] = useState([]) // for multiple
  const [groupDept, setGroupDept] = useState('') // for group: '' = all, or dept_name
  const [giveHours, setGiveHours] = useState('')
  const [giveLoading, setGiveLoading] = useState(false)
  const [giveMsg, setGiveMsg] = useState({ text: '', type: '' })

  // Edit bonus inline
  const [editId, setEditId] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Expanded row + details data (when bonus given, OT, punch in/out)
  const [expanded, setExpanded] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(() => {
    setLoading(true)
    bonus.overview(month, year, searchDebounced || undefined)
      .then((r) => setData(r.data || { summary: {}, employees: [] }))
      .catch(() => setData({ summary: {}, employees: [] }))
      .finally(() => setLoading(false))
  }, [month, year, searchDebounced])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!expanded || !month || !year) {
      setDetailData(null)
      return
    }
    setDetailLoading(true)
    setDetailData(null)
    bonus.employeeDetails(expanded, month, year)
      .then((r) => setDetailData(r.data))
      .catch(() => setDetailData(null))
      .finally(() => setDetailLoading(false))
  }, [expanded, month, year])

  // Search employees for give-bonus panel
  useEffect(() => {
    if (!giveSearch.trim()) { setGiveResults([]); return }
    const t = setTimeout(() => {
      setGiveSearching(true)
      empApi.list({ search: giveSearch.trim() })
        .then((r) => setGiveResults(Array.isArray(r.data?.results) ? r.data.results : Array.isArray(r.data) ? r.data : []))
        .catch(() => setGiveResults([]))
        .finally(() => setGiveSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [giveSearch])

  const handleGiveBonus = async () => {
    const hrs = parseFloat(giveHours)
    if (!hrs || hrs <= 0) { setGiveMsg({ text: 'Enter valid hours > 0', type: 'error' }); return }
    setGiveLoading(true)
    setGiveMsg({ text: '', type: '' })
    try {
      if (giveMode === 'single') {
        if (!selectedEmp) { setGiveMsg({ text: 'Select an employee', type: 'error' }); setGiveLoading(false); return }
        const { data: res } = await bonus.give(selectedEmp.emp_code, hrs, month, year)
        setGiveMsg({ text: `Bonus awarded! ${selectedEmp.name || selectedEmp.emp_code} now has ${res.new_bonus}h total bonus.`, type: 'success' })
        setGiveHours('')
        setSelectedEmp(null)
        setGiveSearch('')
        setGiveResults([])
      } else if (giveMode === 'multiple') {
        if (!selectedEmps.length) { setGiveMsg({ text: 'Select at least one employee', type: 'error' }); setGiveLoading(false); return }
        const codes = selectedEmps.map((e) => e.emp_code)
        const { data: res } = await bonus.giveBulk(codes, hrs, month, year)
        setGiveMsg({ text: `Bonus awarded to ${res.awarded} employee(s).${res.skipped ? ` ${res.skipped} skipped.` : ''}`, type: 'success' })
        setGiveHours('')
        setSelectedEmps([])
        setGiveSearch('')
        setGiveResults([])
      } else {
        // group: use current list (employees) filtered by groupDept
        const list = groupDept ? employees.filter((e) => (e.dept_name || '') === groupDept) : employees
        if (!list.length) { setGiveMsg({ text: groupDept ? 'No employees in this department for current filters.' : 'No employees in current list.', type: 'error' }); setGiveLoading(false); return }
        const codes = list.map((e) => e.emp_code)
        const { data: res } = await bonus.giveBulk(codes, hrs, month, year)
        setGiveMsg({ text: `Bonus awarded to ${res.awarded} employee(s) in ${groupDept || 'current list'}.${res.skipped ? ` ${res.skipped} skipped.` : ''}`, type: 'success' })
        setGiveHours('')
        setGroupDept('')
      }
      fetchData()
    } catch (err) {
      setGiveMsg({ text: 'Error: ' + (err.response?.data?.error || err.message), type: 'error' })
    } finally {
      setGiveLoading(false)
    }
  }

  const toggleSelectedEmp = (emp) => {
    setSelectedEmps((prev) => {
      const has = prev.some((e) => e.emp_code === emp.emp_code)
      if (has) return prev.filter((e) => e.emp_code !== emp.emp_code)
      return [...prev, emp]
    })
  }
  const isSelected = (emp) => selectedEmps.some((e) => e.emp_code === emp.emp_code)

  const handleSetBonus = async (empCode) => {
    const hrs = parseFloat(editVal)
    if (isNaN(hrs) || hrs < 0) return
    setEditLoading(true)
    try {
      await bonus.set(empCode, hrs)
      setEditId(null)
      setEditVal('')
      fetchData()
    } catch {
      // silent
    } finally {
      setEditLoading(false)
    }
  }

  const handleResetBonus = async (empCode) => {
    if (!window.confirm(`Reset bonus for ${empCode} to 0?`)) return
    try {
      await bonus.set(empCode, 0)
      fetchData()
    } catch {
      // silent
    }
  }

  const s = data.summary || {}
  const employees = data.employees || []
  const bonused = employees.filter((e) => parseFloat(e.bonus) > 0)
  const noBonusYet = employees.filter((e) => parseFloat(e.bonus) === 0)
  const departments = [...new Set(employees.map((e) => e.dept_name).filter(Boolean))].sort()
  const groupList = groupDept ? employees.filter((e) => (e.dept_name || '') === groupDept) : employees
  const groupCount = groupList.length

  return (
    <div className="pageContent bmPage">
      {/* Header */}
      <div className="bmHeader">
        <div>
          <h2 className="bmTitle">Bonus Manager</h2>
          <p className="bmSubtitle">Award, track, and manage employee bonuses</p>
        </div>
        <button className="bmGiveBtn" onClick={() => { setGiveOpen(!giveOpen); setGiveMsg({ text: '', type: '' }) }}>
          {giveOpen ? 'Close' : '+ Award Bonus'}
        </button>
      </div>

      {/* Give Bonus Panel */}
      {giveOpen && (
        <div className="bmGivePanel card">
          <h3 className="bmGivePanelTitle">Award Bonus</h3>
          <div className="bmGiveModeTabs">
            <button type="button" className={`bmGiveModeTab ${giveMode === 'single' ? 'active' : ''}`} onClick={() => { setGiveMode('single'); setGiveMsg({ text: '', type: '' }); setSelectedEmps([]); setGroupDept('') }}>Single</button>
            <button type="button" className={`bmGiveModeTab ${giveMode === 'multiple' ? 'active' : ''}`} onClick={() => { setGiveMode('multiple'); setGiveMsg({ text: '', type: '' }); setSelectedEmp(null); setGiveSearch(''); setGiveResults([]); setGroupDept('') }}>Multiple</button>
            <button type="button" className={`bmGiveModeTab ${giveMode === 'group' ? 'active' : ''}`} onClick={() => { setGiveMode('group'); setGiveMsg({ text: '', type: '' }); setSelectedEmp(null); setSelectedEmps([]); setGiveSearch(''); setGiveResults([]) }}>Whole group</button>
          </div>
          <div className="bmGiveGrid">
            {giveMode === 'single' && (
              <>
                <div className="bmGiveField">
                  <label className="bmFieldLabel">Search Employee</label>
                  <input
                    type="text"
                    className="bmInput"
                    placeholder="Type emp code or name..."
                    value={giveSearch}
                    onChange={(e) => { setGiveSearch(e.target.value); setSelectedEmp(null) }}
                  />
                  {giveSearch && !selectedEmp && (
                    <div className="bmDropdown">
                      {giveSearching && <div className="bmDropItem bmDropMuted">Searching...</div>}
                      {!giveSearching && giveResults.length === 0 && giveSearch.length > 1 && <div className="bmDropItem bmDropMuted">No employees found</div>}
                      {giveResults.slice(0, 8).map((emp) => (
                        <div key={emp.emp_code} className="bmDropItem" onClick={() => { setSelectedEmp(emp); setGiveSearch(`${emp.emp_code} - ${emp.name}`); setGiveResults([]) }}>
                          <span className="bmDropCode">{emp.emp_code}</span>
                          <span className="bmDropName">{emp.name}</span>
                          <span className="bmDropDept">{emp.dept_name || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedEmp && (
                    <div className="bmSelectedEmp">
                      <div className="bmSelectedAvatar">{(selectedEmp.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</div>
                      <div>
                        <div className="bmSelectedName">{selectedEmp.name}</div>
                        <div className="bmSelectedMeta">{selectedEmp.emp_code} &middot; {selectedEmp.dept_name || '—'}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bmGiveField">
                  <label className="bmFieldLabel">Bonus Hours</label>
                  <input type="number" className="bmInput" placeholder="e.g. 5" min="0" step="1" value={giveHours} onChange={(e) => setGiveHours(e.target.value)} />
                </div>
                <div className="bmGiveField bmGiveFieldBtn">
                  <button className="bmAwardBtn" disabled={giveLoading || !selectedEmp || !giveHours} onClick={handleGiveBonus}>
                    {giveLoading ? 'Awarding...' : 'Award Bonus'}
                  </button>
                </div>
              </>
            )}
            {giveMode === 'multiple' && (
              <>
                <div className="bmGiveField bmGiveFieldWide">
                  <label className="bmFieldLabel">Search & select employees</label>
                  <input
                    type="text"
                    className="bmInput"
                    placeholder="Type emp code or name..."
                    value={giveSearch}
                    onChange={(e) => setGiveSearch(e.target.value)}
                  />
                  {giveSearch && (
                    <div className="bmDropdown">
                      {giveSearching && <div className="bmDropItem bmDropMuted">Searching...</div>}
                      {!giveSearching && giveResults.length === 0 && giveSearch.length > 1 && <div className="bmDropItem bmDropMuted">No employees found</div>}
                      {giveResults.slice(0, 12).map((emp) => (
                        <div key={emp.emp_code} className="bmDropItem bmDropItemCheck" onClick={() => toggleSelectedEmp(emp)}>
                          <input type="checkbox" checked={isSelected(emp)} onChange={() => {}} />
                          <span className="bmDropCode">{emp.emp_code}</span>
                          <span className="bmDropName">{emp.name}</span>
                          <span className="bmDropDept">{emp.dept_name || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedEmps.length > 0 && (
                    <div className="bmSelectedMulti">
                      <span className="bmFieldLabel">{selectedEmps.length} selected</span>
                      <div className="bmSelectedChips">
                        {selectedEmps.map((e) => (
                          <span key={e.emp_code} className="bmChipSel">{e.emp_code} &middot; {e.name}
                            <button type="button" className="bmChipRemove" onClick={() => setSelectedEmps((p) => p.filter((x) => x.emp_code !== e.emp_code))} aria-label="Remove">×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="bmGiveField">
                  <label className="bmFieldLabel">Bonus Hours (each)</label>
                  <input type="number" className="bmInput" placeholder="e.g. 5" min="0" step="1" value={giveHours} onChange={(e) => setGiveHours(e.target.value)} />
                </div>
                <div className="bmGiveField bmGiveFieldBtn">
                  <button className="bmAwardBtn" disabled={giveLoading || !selectedEmps.length || !giveHours} onClick={handleGiveBonus}>
                    {giveLoading ? 'Awarding...' : `Award to ${selectedEmps.length} employee(s)`}
                  </button>
                </div>
              </>
            )}
            {giveMode === 'group' && (
              <>
                <div className="bmGiveField bmGiveFieldWide">
                  <label className="bmFieldLabel">Award to group</label>
                  <select className="bmInput" value={groupDept} onChange={(e) => setGroupDept(e.target.value)}>
                    <option value="">All in current list ({employees.length} employees)</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d} ({employees.filter((e) => (e.dept_name || '') === d).length})</option>
                    ))}
                  </select>
                  {groupCount > 0 && <span className="bmGroupHint">{groupCount} employee(s) will receive bonus</span>}
                </div>
                <div className="bmGiveField">
                  <label className="bmFieldLabel">Bonus Hours (each)</label>
                  <input type="number" className="bmInput" placeholder="e.g. 5" min="0" step="1" value={giveHours} onChange={(e) => setGiveHours(e.target.value)} />
                </div>
                <div className="bmGiveField bmGiveFieldBtn">
                  <button className="bmAwardBtn" disabled={giveLoading || !groupCount || !giveHours} onClick={handleGiveBonus}>
                    {giveLoading ? 'Awarding...' : `Award to group (${groupCount})`}
                  </button>
                </div>
              </>
            )}
          </div>
          {giveMsg.text && <div className={`bmGiveMsg ${giveMsg.type}`}>{giveMsg.text}</div>}
        </div>
      )}

      {/* Filters */}
      <div className="card filterCard bmFilterCard">
        <div className="filterBar">
          <div className="filterGroup">
            <label className="label">Month</label>
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                <option key={m} value={m}>{monthNames[m]}</option>
              ))}
            </select>
          </div>
          <div className="filterGroup">
            <label className="label">Year</label>
            <input type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} min={2020} max={2030} style={{ width: 90 }} />
          </div>
          <div className="filterGroup">
            <label className="label">Search</label>
            <input type="text" className="input" placeholder="Emp code or name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 180 }} />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="bmSummary">
        <div className="bmSumCard bmSumTotal">
          <div className="bmSumIcon">&#127873;</div>
          <div className="bmSumContent">
            <span className="bmSumNum">{s.total_bonus_hours || 0}h</span>
            <span className="bmSumLabel">Total Bonus Awarded</span>
          </div>
        </div>
        <div className="bmSumCard bmSumCount">
          <div className="bmSumIcon">&#128101;</div>
          <div className="bmSumContent">
            <span className="bmSumNum">{s.employees_with_bonus || 0} / {s.total_employees || 0}</span>
            <span className="bmSumLabel">Employees with Bonus</span>
          </div>
        </div>
        <div className="bmSumCard bmSumHigh">
          <div className="bmSumIcon">&#11088;</div>
          <div className="bmSumContent">
            <span className="bmSumNum">{s.highest_bonus || 0}h</span>
            <span className="bmSumLabel">Highest Bonus</span>
          </div>
        </div>
        <div className="bmSumCard bmSumAvg">
          <div className="bmSumIcon">&#128200;</div>
          <div className="bmSumContent">
            <span className="bmSumNum">{s.avg_bonus || 0}h</span>
            <span className="bmSumLabel">Average Bonus</span>
          </div>
        </div>
      </div>

      {loading ? <p className="muted">Loading...</p> : (
        <>
          {/* Bonus Recipients */}
          {bonused.length > 0 && (
            <div className="bmSection">
              <h3 className="bmSectionTitle">Bonus Recipients <span className="bmSectionCount">{bonused.length}</span></h3>
              <div className="card tableCard">
                <table className="bmTable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Bonus (hrs)</th>
                      <th>OT (hrs)</th>
                      <th>Monthly Hrs</th>
                      <th>Shift OT</th>
                      <th>Streaks</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bonused.map((emp, i) => (
                      <>
                        <tr key={emp.emp_code} className="bmRow">
                          <td><span className="bmRowNum">{i + 1}</span></td>
                          <td>
                            <div className="bmEmpCell">
                              <div className="bmEmpAvatar">
                                {(emp.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                              </div>
                              <div className="bmEmpInfo">
                                <span className="bmEmpName">{emp.name || emp.emp_code}</span>
                                <span className="bmEmpCode">{emp.emp_code}{emp.designation ? ` \u00B7 ${emp.designation}` : ''}</span>
                              </div>
                            </div>
                          </td>
                          <td><span className="bmDept">{emp.dept_name || '—'}</span></td>
                          <td>
                            {editId === emp.emp_code ? (
                              <div className="bmEditInline">
                                <input type="number" className="bmEditInput" value={editVal} onChange={(e) => setEditVal(e.target.value)} min="0" step="1" autoFocus />
                                <button className="bmEditSave" disabled={editLoading} onClick={() => handleSetBonus(emp.emp_code)}>{editLoading ? '...' : '\u2713'}</button>
                                <button className="bmEditCancel" onClick={() => { setEditId(null); setEditVal('') }}>\u2717</button>
                              </div>
                            ) : (
                              <span className="bmBonusVal" onClick={() => { setEditId(emp.emp_code); setEditVal(emp.bonus) }} title="Click to edit">
                                {Number(emp.bonus).toFixed(1)}h
                              </span>
                            )}
                          </td>
                          <td><span className="bmChip bmChipPurple">{Number(emp.overtime_hours || 0).toFixed(1)}h</span></td>
                          <td>{Number(emp.month_hours || 0).toFixed(0)}h</td>
                          <td>{Number(emp.shift_ot_bonus_hours || 0) > 0 ? <span className="bmChip bmChipBlue" title="12h+ shift: 1h bonus per 2h extra">{Number(emp.shift_ot_bonus_hours).toFixed(0)}h</span> : '—'}</td>
                          <td>
                            {emp.streak_count > 0 ? (
                              <span className="bmChip bmChipGreen">{emp.streak_count}x</span>
                            ) : '—'}
                          </td>
                          <td>
                            <div className="bmActions">
                              <button className="bmActionBtn bmActionExpand" onClick={() => setExpanded(expanded === emp.emp_code ? null : emp.emp_code)}>
                                {expanded === emp.emp_code ? 'Close' : 'Details'}
                              </button>
                              <button className="bmActionBtn bmActionReset" onClick={() => handleResetBonus(emp.emp_code)}>Reset</button>
                              <Link to={`/employees/${emp.emp_code}/profile`} className="bmActionBtn bmActionProfile">Profile</Link>
                            </div>
                          </td>
                        </tr>
                        {expanded === emp.emp_code && (
                          <tr key={`d-${emp.emp_code}`} className="bmDetailRow">
                            <td colSpan={9}>
                              <div className="bmDetailPanel">
                                <div className="bmDetailGrid">
                                  <div className="bmDetailItem">
                                    <span className="bmDetailLabel">Shift OT bonus (12h+ rule)</span>
                                    <span className="bmDetailValue">{Number(emp.shift_ot_bonus_hours || 0).toFixed(0)}h</span>
                                  </div>
                                  <div className="bmDetailItem">
                                    <span className="bmDetailLabel">Shift</span>
                                    <span className="bmDetailValue">{emp.shift || '—'}{emp.shift_from && emp.shift_to ? ` (${emp.shift_from}–${emp.shift_to})` : ''}</span>
                                  </div>
                                  <div className="bmDetailItem">
                                    <span className="bmDetailLabel">Days Present</span>
                                    <span className="bmDetailValue">{emp.month_days || emp.days_present || 0} days</span>
                                  </div>
                                  <div className="bmDetailItem">
                                    <span className="bmDetailLabel">Total Working Hrs</span>
                                    <span className="bmDetailValue bmDetailHighlight">{Number(emp.total_working_hours || 0).toFixed(1)}h</span>
                                  </div>
                                  <div className="bmDetailItem">
                                    <span className="bmDetailLabel">Overtime</span>
                                    <span className="bmDetailValue">{Number(emp.overtime_hours || 0).toFixed(1)}h</span>
                                  </div>
                                  <div className="bmDetailItem">
                                    <span className="bmDetailLabel">Base Salary</span>
                                    <span className="bmDetailValue">{'\u20B9'}{Number(emp.base_salary || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="bmDetailItem">
                                    <span className="bmDetailLabel">Salary Type</span>
                                    <span className="bmDetailValue">{emp.salary_type || '—'}</span>
                                  </div>
                                </div>
                                {detailLoading && <p className="bmDetailMuted">Loading details…</p>}
                                {!detailLoading && detailData && detailData.emp_code === emp.emp_code && (
                                  <>
                                    <div className="bmDetailSection">
                                      <h4 className="bmDetailSectionTitle">When bonus was given</h4>
                                      {((detailData.shift_ot_bonus || []).length > 0) ? (
                                        <table className="bmDetailTable">
                                          <thead>
                                            <tr><th>Date</th><th>Bonus (hrs)</th><th>Reason</th></tr>
                                          </thead>
                                          <tbody>
                                            {(detailData.shift_ot_bonus || []).map((r, idx) => (
                                              <tr key={idx}>
                                                <td>{r.date}</td>
                                                <td>{Number(r.bonus_hours).toFixed(1)}h</td>
                                                <td className="bmDetailDesc">{r.description || '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      ) : <p className="bmDetailMuted">No shift OT bonus (12h+ days) this month.</p>}
                                      {(detailData.manual_bonus_grants || []).length > 0 && (
                                        <>
                                          <span className="bmDetailLabel">Manual awards</span>
                                          <table className="bmDetailTable">
                                            <thead>
                                              <tr><th>When</th><th>Hours added</th><th>New total</th></tr>
                                            </thead>
                                            <tbody>
                                              {(detailData.manual_bonus_grants || []).map((g, idx) => (
                                                <tr key={idx}>
                                                  <td>{g.given_at ? new Date(g.given_at).toLocaleString() : '—'}</td>
                                                  <td>+{g.hours || '?'}h</td>
                                                  <td>{g.new_total || '?'}h</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </>
                                      )}
                                    </div>
                                    <div className="bmDetailSection">
                                      <h4 className="bmDetailSectionTitle">Punch in / out &amp; OT (this month)</h4>
                                      {(detailData.attendance || []).length > 0 ? (
                                        <div className="bmDetailAttWrap">
                                          <table className="bmDetailTable">
                                            <thead>
                                              <tr><th>Date</th><th>Punch in</th><th>Punch out</th><th>Working hrs</th><th>OT (hrs)</th></tr>
                                            </thead>
                                            <tbody>
                                              {(detailData.attendance || []).map((a, idx) => (
                                                <tr key={idx}>
                                                  <td>{a.date}</td>
                                                  <td>{a.punch_in || '—'}</td>
                                                  <td>{a.punch_out || '—'}</td>
                                                  <td>{Number(a.total_working_hours).toFixed(1)}h</td>
                                                  <td>{Number(a.over_time).toFixed(1)}h</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : <p className="bmDetailMuted">No attendance for this month.</p>}
                                    </div>
                                  </>
                                )}
                                <div className="bmDetailQuickBonus">
                                  <span className="bmDetailLabel">Quick Add Bonus</span>
                                  <div className="bmQuickBonusRow">
                                    {[1, 2, 5, 10].map((h) => (
                                      <button key={h} className="bmQuickBtn" onClick={async () => { await bonus.give(emp.emp_code, h); fetchData() }}>+{h}h</button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Employees without bonus */}
          {noBonusYet.length > 0 && (
            <div className="bmSection">
              <h3 className="bmSectionTitle">No Bonus Yet <span className="bmSectionCount bmSectionCountMuted">{noBonusYet.length}</span></h3>
              <div className="card tableCard">
                <table className="bmTable bmTableMuted">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Monthly Hrs</th>
                      <th>OT</th>
                      <th>Streaks</th>
                      <th>Days</th>
                      <th>Quick Bonus</th>
                      <th>Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noBonusYet.map((emp) => (
                      <tr key={emp.emp_code}>
                        <td>
                          <div className="bmEmpCell">
                            <div className="bmEmpInfo">
                              <span className="bmEmpName">{emp.name || emp.emp_code}</span>
                              <span className="bmEmpCode">{emp.emp_code}</span>
                            </div>
                          </div>
                        </td>
                        <td>{emp.dept_name || '—'}</td>
                        <td>{Number(emp.month_hours || 0).toFixed(0)}h</td>
                        <td>{Number(emp.overtime_hours || 0).toFixed(1)}h</td>
                        <td>{emp.streak_count > 0 ? <span className="bmChip bmChipGreen">{emp.streak_count}x</span> : '—'}</td>
                        <td>{emp.month_days || emp.days_present || 0}</td>
                        <td>
                          <div className="bmQuickBonusRow">
                            {[1, 2, 5].map((h) => (
                              <button key={h} className="bmQuickBtnSmall" onClick={async () => { await bonus.give(emp.emp_code, h); fetchData() }}>+{h}h</button>
                            ))}
                          </div>
                        </td>
                        <td><Link to={`/employees/${emp.emp_code}/profile`} className="bmTableLink">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {employees.length === 0 && <p className="muted">No salary data found for {monthNames[month]} {year}.</p>}
        </>
      )}
    </div>
  )
}
