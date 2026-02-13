import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { attendance } from '../api'
import './Table.css'
import './AttendanceTable.css'

const today = new Date().toISOString().slice(0, 10)
const PAGE_SIZE = 50

/** Format "2026-02-12" → "12 Feb 2026" */
function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AttendanceTable() {
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [useRange, setUseRange] = useState(false)
  const [showAllDates, setShowAllDates] = useState(false)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [punchinFilter, setPunchinFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset to page 1 when filters or sort change
  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, useRange, showAllDates, searchDebounced, punchinFilter, statusFilter, sortBy, sortOrder])

  useEffect(() => {
    setLoading(true)
    const ordering = sortOrder === 'desc' ? `-${sortBy}` : sortBy
    const params = { page, page_size: PAGE_SIZE, ordering }
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
      })
      .catch(() => {
        setList([])
        setCount(0)
      })
      .finally(() => setLoading(false))
  }, [page, dateFrom, dateTo, useRange, showAllDates, searchDebounced, punchinFilter, statusFilter, sortBy, sortOrder])

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
              <option value="FD">FD</option>
              <option value="Half-Day">Half-Day</option>
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
            <div className="attTableMeta">
              <p className="muted attSortHint">Click column headers to sort ↑↓</p>
              <span className="attRecordCount">{count} records total — showing {from}–{to}</span>
            </div>
            <div className="attTableWrap">
              <table className="attTable">
                <thead>
                  <tr>
                    <th className="sortableHeader" onClick={() => handleSort('emp_code')}>
                      <span className="sortLabel">Emp Code</span>
                      <span className="sortIcon sortIconSmall">{getSortIcon('emp_code')}</span>
                    </th>
                    <th>Name</th>
                    <th className="sortableHeader attDateCol" onClick={() => handleSort('date')}>
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
                    <th className="attNextDayCol">Next Day</th>
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
                  {list.map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                      <td>{row.name || '—'}</td>
                      <td className="attDateCell">{formatDate(row.date)}</td>
                      <td>{row.shift || '—'}</td>
                      <td>{row.shift_from && row.shift_to ? `${String(row.shift_from).slice(0, 5)}–${String(row.shift_to).slice(0, 5)}` : '—'}</td>
                      <td>{row.punch_in ? String(row.punch_in).slice(0, 5) : '—'}</td>
                      <td>{row.punch_out ? String(row.punch_out).slice(0, 5) : '—'}</td>
                      <td className="attNextDayCell">
                        {row.punch_spans_next_day ? (
                          <span className="attNextDayBadge" title="Punched out / worked into next day">Yes</span>
                        ) : (
                          <span className="attNextDayNo">—</span>
                        )}
                      </td>
                      <td className="num">{Number(row.total_working_hours || 0).toFixed(2)}</td>
                      <td><span className={`badge badge-${row.status === 'Present' ? 'success' : row.status === 'Absent' ? 'danger' : 'warn'}`}>{row.status}</span></td>
                      <td className="num">{Number(row.over_time || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="attPagination">
                <div className="attPaginationButtons">
                  <button
                    type="button"
                    className="btn btn-secondary attPageBtn"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage(1)}
                  >
                    First
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary attPageBtn"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className="attPageNum">Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    className="btn btn-secondary attPageBtn"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary attPageBtn"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage(totalPages)}
                  >
                    Last
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
