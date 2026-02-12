import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { attendance } from '../api'
import './Table.css'
import './AttendanceTable.css'

const today = new Date().toISOString().slice(0, 10)
const PAGE_SIZE = 25

export default function AttendanceTable() {
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [useRange, setUseRange] = useState(false)
  const [showAllDates, setShowAllDates] = useState(false)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [punchinFilter, setPunchinFilter] = useState('')  // 'yes', 'no', '' (all)
  const [statusFilter, setStatusFilter] = useState('')    // 'Present', 'Absent', 'Weekoff', '' (all)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [nextUrl, setNextUrl] = useState(null)
  const [prevUrl, setPrevUrl] = useState(null)
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, useRange, showAllDates, searchDebounced, punchinFilter, statusFilter])

  useEffect(() => {
    setLoading(true)
    const params = { page: page, page_size: PAGE_SIZE }
    if (searchDebounced) params.search = searchDebounced
    if (!showAllDates) {
      if (useRange) {
        params.date_from = dateFrom
        params.date_to = dateTo
      } else {
        params.date = dateFrom
      }
    }
    if (punchinFilter) params.punchin = punchinFilter
    if (statusFilter) params.status = statusFilter
    attendance.list(params)
      .then((r) => {
        const data = r.data
        setList(Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []))
        setCount(typeof data.count === 'number' ? data.count : (data.results?.length ?? 0))
        setNextUrl(data.next || null)
        setPrevUrl(data.previous || null)
      })
      .catch(() => {
        setList([])
        setCount(0)
        setNextUrl(null)
        setPrevUrl(null)
      })
      .finally(() => setLoading(false))
  }, [page, dateFrom, dateTo, useRange, showAllDates, searchDebounced, punchinFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const from = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, count)

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortOrder(['date', 'total_working_hours', 'over_time'].includes(field) ? 'desc' : 'asc')
  }

  const getSortIcon = (field) => {
    if (sortBy !== field) return '↕'
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  const sortedList = [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    if (sortBy === 'emp_code') {
      const aCode = String(a.emp_code || '')
      const bCode = String(b.emp_code || '')
      return sortOrder === 'asc'
        ? aCode.localeCompare(bCode, undefined, { numeric: true, sensitivity: 'base' })
        : bCode.localeCompare(aCode, undefined, { numeric: true, sensitivity: 'base' })
    }
    if (sortBy === 'date') {
      const aDate = String(a.date || '')
      const bDate = String(b.date || '')
      const aParts = aDate.split('-')
      const bParts = bDate.split('-')
      if (aParts.length === 3 && bParts.length === 3) {
        const aMonthDay = `${aParts[1]}-${aParts[2]}`
        const bMonthDay = `${bParts[1]}-${bParts[2]}`
        return sortOrder === 'asc' ? aMonthDay.localeCompare(bMonthDay) : bMonthDay.localeCompare(aMonthDay)
      }
      return sortOrder === 'asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate)
    }
    if (sortBy === 'punch_in') {
      const aVal = a.punch_in ? 1 : 0
      const bVal = b.punch_in ? 1 : 0
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    }
    if (sortBy === 'status') {
      const aVal = String(a.status || '')
      const bVal = String(b.status || '')
      return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    if (sortBy === 'total_working_hours') {
      const aVal = Number(a.total_working_hours || 0)
      const bVal = Number(b.total_working_hours || 0)
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    }
    if (sortBy === 'over_time') {
      const aVal = Number(a.over_time || 0)
      const bVal = Number(b.over_time || 0)
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    }
    return 0
  })

  return (
    <div className="pageContent attendancePage">
      <div className="attShiftRefCard">
        <h4 className="attShiftRefTitle">Shift reference</h4>
        <div className="attShiftRefList">
          <div className="attShiftRefItem">
            <span className="attShiftRefTime">09:00 → 08:59</span>
            <span className="attShiftRefName">General Shift</span>
            <span className="attShiftRefNote">(next day)</span>
          </div>
          <div className="attShiftRefItem">
            <span className="attShiftRefTime">06:00 → 14:00</span>
            <span className="attShiftRefName">Morning Shift</span>
          </div>
          <div className="attShiftRefItem">
            <span className="attShiftRefTime">14:00 → 22:00</span>
            <span className="attShiftRefName">Evening Shift</span>
          </div>
          <div className="attShiftRefItem">
            <span className="attShiftRefTime">22:00 → 06:00</span>
            <span className="attShiftRefName">Night Shift</span>
            <span className="attShiftRefNote">(next day)</span>
          </div>
        </div>
      </div>

      <div className="card attFilterCard">
        <div className="attFilterLayout">
          <div className="attFilterGroup attFilterGroupSearch">
            <label className="attFilterLabel">Search</label>
            <input
              type="text"
              className="input attSearchInput"
              placeholder="Emp code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="attFilterItem">
            <label className="attFilterLabel">Punch In</label>
            <select
              className="input attSelectInput"
              value={punchinFilter}
              onChange={(e) => setPunchinFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div className="attFilterItem">
            <label className="attFilterLabel">Status</label>
            <select
              className="input attSelectInput"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Weekoff">Weekoff</option>
            </select>
          </div>
          <div className="attFilterGroup attFilterGroupDate">
            <label className="attFilterLabel">Date</label>
            <div className="attDateRow">
              <label className="attDateChip">
                <input type="radio" name="dateMode" checked={showAllDates} onChange={() => setShowAllDates(true)} />
                <span>All</span>
              </label>
              <label className="attDateChip">
                <input type="radio" name="dateMode" checked={!showAllDates && !useRange} onChange={() => { setShowAllDates(false); setUseRange(false); }} />
                <span>Single</span>
              </label>
              <label className="attDateChip">
                <input type="radio" name="dateMode" checked={!showAllDates && useRange} onChange={() => { setShowAllDates(false); setUseRange(true); }} />
                <span>Range</span>
              </label>
              {!showAllDates && (
                <div className="attDateInputs">
                  {!useRange ? (
                    <input
                      type="date"
                      className="input attDateInput"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  ) : (
                    <>
                      <input
                        type="date"
                        className="input attDateInput"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                      <span className="attDateSep">to</span>
                      <input
                        type="date"
                        className="input attDateInput"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card attTableCard">
        {loading ? (
          <p className="muted attLoading">Loading…</p>
        ) : (
          <>
            <p className="muted attSortHint">Click column headers to sort ↑↓ (Emp Code, Date, Punch In, Working Hrs, Status, OT)</p>
            <div className="attTableWrap">
              <table className="attTable">
                <thead>
                  <tr>
                    <th className="sortableHeader" onClick={() => handleSort('emp_code')}>
                      <span className="sortLabel">Emp Code</span>
                      <span className="sortIcon sortIconSmall">{getSortIcon('emp_code')}</span>
                    </th>
                    <th>Name</th>
                    <th className="sortableHeader" onClick={() => handleSort('date')}>
                      <span className="sortLabel">Date</span>
                      <span className="sortIcon sortIconSmall">{getSortIcon('date')}</span>
                    </th>
                    <th>Shift</th>
                    <th>From–To</th>
                    <th className="sortableHeader" onClick={() => handleSort('punch_in')}>
                      <span className="sortLabel">Punch In</span>
                      <span className="sortIcon sortIconSmall">{getSortIcon('punch_in')}</span>
                    </th>
                    <th>Punch Out</th>
                    <th className="sortableHeader" onClick={() => handleSort('total_working_hours')}>
                      <span className="sortLabel">Working Hrs</span>
                      <span className="sortIcon sortIconSmall">{getSortIcon('total_working_hours')}</span>
                    </th>
                    <th className="sortableHeader" onClick={() => handleSort('status')}>
                      <span className="sortLabel">Status</span>
                      <span className="sortIcon sortIconSmall">{getSortIcon('status')}</span>
                    </th>
                    <th className="sortableHeader" onClick={() => handleSort('over_time')}>
                      <span className="sortLabel">OT</span>
                      <span className="sortIcon sortIconSmall">{getSortIcon('over_time')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedList.map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                      <td>{row.name || '—'}</td>
                      <td>{row.date}</td>
                      <td>{row.shift || '—'}</td>
                      <td>{row.shift_from && row.shift_to ? `${String(row.shift_from).slice(0, 5)}–${String(row.shift_to).slice(0, 5)}` : '—'}</td>
                      <td>{row.punch_in ? String(row.punch_in).slice(0, 5) : '—'}</td>
                      <td>{row.punch_out ? `${String(row.punch_out).slice(0, 5)}${row.punch_spans_next_day ? ' (next day)' : ''}` : '—'}</td>
                      <td className="num">{Number(row.total_working_hours || 0).toFixed(2)}</td>
                      <td><span className={`badge badge-${row.status === 'Present' ? 'success' : row.status === 'Absent' ? 'danger' : 'warn'}`}>{row.status}</span></td>
                      <td className="num">{Number(row.over_time || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {list.length > 0 && (
              <div className="attPagination">
                <span className="attPaginationInfo">
                  Showing {from}–{to} of {count}
                </span>
                <div className="attPaginationButtons">
                  <button
                    type="button"
                    className="btn btn-secondary attPageBtn"
                    disabled={!prevUrl || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="attPageNum">Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    className="btn btn-secondary attPageBtn"
                    disabled={!nextUrl || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {!loading && Array.isArray(list) && list.length === 0 && (
          <p className="muted attEmpty">No attendance for the selected filters. Try &quot;All dates&quot;, adjust the range, or search by emp code or name.</p>
        )}
      </div>
    </div>
  )
}
