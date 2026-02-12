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
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [nextUrl, setNextUrl] = useState(null)
  const [prevUrl, setPrevUrl] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, useRange, showAllDates, searchDebounced])

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
  }, [page, dateFrom, dateTo, useRange, showAllDates, searchDebounced])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const from = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, count)

  return (
    <div className="pageContent attendancePage">
      <div className="card attFilterCard">
        <h3 className="attFilterTitle">Filters</h3>
        <div className="attFilterBar">
          <div className="attFilterBlock">
            <label className="attFilterLabel">Search</label>
            <input
              type="text"
              className="input attSearchInput"
              placeholder="Emp code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="attFilterBlock attDateBlock">
            <label className="attFilterLabel">Date</label>
            <div className="attDateOptions">
              <label className="attRadioLabel">
                <input type="radio" name="dateMode" checked={showAllDates} onChange={() => setShowAllDates(true)} />
                <span>All dates</span>
              </label>
              <label className="attRadioLabel">
                <input type="radio" name="dateMode" checked={!showAllDates && !useRange} onChange={() => { setShowAllDates(false); setUseRange(false); }} />
                <span>Single date</span>
              </label>
              <label className="attRadioLabel">
                <input type="radio" name="dateMode" checked={!showAllDates && useRange} onChange={() => { setShowAllDates(false); setUseRange(true); }} />
                <span>Date range</span>
              </label>
            </div>
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

      <div className="card attTableCard">
        {loading ? (
          <p className="muted attLoading">Loading…</p>
        ) : (
          <>
            <div className="attTableWrap">
              <table className="attTable">
                <thead>
                  <tr>
                    <th>Emp Code</th>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Punch In</th>
                    <th>Punch Out</th>
                    <th>Working Hrs</th>
                    <th>Break</th>
                    <th>Status</th>
                    <th>OT</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(list) ? list : []).map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/employees/${row.emp_code}/profile`}>{row.emp_code}</Link></td>
                      <td>{row.name || '—'}</td>
                      <td>{row.date}</td>
                      <td>{row.punch_in ? String(row.punch_in).slice(0, 5) : '—'}</td>
                      <td>{row.punch_out ? String(row.punch_out).slice(0, 5) : '—'}</td>
                      <td className="num">{Number(row.total_working_hours || 0).toFixed(2)}</td>
                      <td className="num">{Number(row.total_break || 0).toFixed(2)}</td>
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
