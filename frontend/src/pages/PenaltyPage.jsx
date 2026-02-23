import { useState, useEffect } from 'react'
import { penalty as penaltyApi, employees, penaltyInquiries } from '../api'
import './Table.css'
import './PenaltyPage.css'

const now = new Date()
const currentMonth = now.getMonth() + 1
const currentYear = now.getFullYear()
const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function PenaltyPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    search: '',
    month: '',
    year: '',
    date_from: '',
    date_to: '',
  })
  const [manualEmp, setManualEmp] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualDesc, setManualDesc] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10))
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [employeeOptions, setEmployeeOptions] = useState([])
  const [showManual, setShowManual] = useState(false)
  const [viewModal, setViewModal] = useState({
    open: false,
    emp_code: '',
    name: '',
    month: '',
    year: '',
    records: [],
    loading: false,
    editingId: null,
    editAmount: '',
    editDesc: '',
  })
  const [inquiryList, setInquiryList] = useState([])
  const [inquiryLoading, setInquiryLoading] = useState(true)
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState('')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [inquiryAdjust, setInquiryAdjust] = useState({ id: null, amount: '' })
  const [activeTab, setActiveTab] = useState('records') // 'records' | 'inquiries'

  const loadList = () => {
    setLoading(true)
    const params = {}
    if (filters.search.trim()) params.search = filters.search.trim()
    if (filters.month) params.month = filters.month
    if (filters.year) params.year = filters.year
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    penaltyApi.list(params)
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadList() }, [filters.search, filters.month, filters.year, filters.date_from, filters.date_to])

  const loadInquiries = () => {
    setInquiryLoading(true)
    penaltyInquiries.list(inquiryStatusFilter ? { status: inquiryStatusFilter } : {})
      .then((r) => setInquiryList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setInquiryList([]))
      .finally(() => setInquiryLoading(false))
  }

  useEffect(() => { loadInquiries() }, [inquiryStatusFilter])

  const handleInquiryResolve = async (id, status, deductionAmount) => {
    setInquiryMessage('')
    try {
      await penaltyInquiries.patch(id, { status, ...(deductionAmount != null && deductionAmount !== '' ? { deduction_amount: deductionAmount } : {}) })
      setInquiryAdjust({ id: null, amount: '' })
      loadInquiries()
      loadList()
      setInquiryMessage('Inquiry updated.')
    } catch (err) {
      setInquiryMessage(err.response?.data?.error || 'Failed')
    }
  }

  useEffect(() => {
    employees.list({ page_size: 500 })
      .then((r) => {
        const d = r.data
        const results = d.results ?? d ?? []
        setEmployeeOptions(Array.isArray(results) ? results : [])
      })
      .catch(() => setEmployeeOptions([]))
  }, [])

  const handleManualSubmit = (e) => {
    e.preventDefault()
    setMessage({ text: '', type: '' })
    const code = manualEmp.trim()
    const amt = parseFloat(manualAmount)
    if (!code) { setMessage({ text: 'Select employee', type: 'error' }); return }
    if (!Number.isFinite(amt) || amt < 0) { setMessage({ text: 'Enter valid amount (Rs)', type: 'error' }); return }
    setManualSubmitting(true)
    penaltyApi.create({ emp_code: code, deduction_amount: amt, description: manualDesc.trim() || 'Manual penalty', date: manualDate })
      .then(() => {
        setMessage({ text: 'Penalty added.', type: 'success' })
        setManualAmount('')
        setManualDesc('')
        setManualDate(new Date().toISOString().slice(0, 10))
        loadList()
      })
      .catch((err) => setMessage({ text: err.response?.data?.error || 'Failed', type: 'error' }))
      .finally(() => setManualSubmitting(false))
  }

  const handleDelete = (id) => {
    if (!window.confirm('Remove this penalty record?')) return
    penaltyApi.delete(id).then(() => loadList()).catch(() => setMessage({ text: 'Delete failed', type: 'error' }))
  }

  const openView = (row) => {
    const month = row.month || new Date(row.date).getMonth() + 1
    const year = row.year || new Date(row.date).getFullYear()
    setViewModal((m) => ({
      ...m,
      open: true,
      emp_code: row.emp_code,
      name: row.name || row.emp_code,
      month: String(month),
      year: String(year),
      records: [],
      loading: true,
      editingId: null,
    }))
    const params = { emp_code: row.emp_code, month: String(month), year: String(year) }
    penaltyApi.list(params)
      .then((r) => {
        const records = Array.isArray(r.data) ? r.data : []
        setViewModal((m) => ({ ...m, records, loading: false }))
      })
      .catch(() => setViewModal((m) => ({ ...m, records: [], loading: false })))
  }

  const closeView = () => setViewModal((m) => ({ ...m, open: false, editingId: null }))

  const loadViewModalRecords = () => {
    if (!viewModal.emp_code || !viewModal.month || !viewModal.year) return
    setViewModal((m) => ({ ...m, loading: true }))
    penaltyApi.list({ emp_code: viewModal.emp_code, month: viewModal.month, year: viewModal.year })
      .then((r) => {
        const records = Array.isArray(r.data) ? r.data : []
        setViewModal((m) => ({ ...m, records, loading: false, editingId: null }))
      })
      .catch(() => setViewModal((m) => ({ ...m, loading: false })))
  }

  const handleDeleteInModal = (id) => {
    if (!window.confirm('Remove this penalty record?')) return
    penaltyApi.delete(id)
      .then(() => {
        loadViewModalRecords()
        loadList()
      })
      .catch(() => setMessage({ text: 'Delete failed', type: 'error' }))
  }

  const startEditInModal = (record) => {
    setViewModal((m) => ({
      ...m,
      editingId: record.id,
      editAmount: String(record.deduction_amount ?? ''),
      editDesc: String(record.description ?? ''),
    }))
  }

  const cancelEditInModal = () => {
    setViewModal((m) => ({ ...m, editingId: null }))
  }

  const saveEditInModal = () => {
    const id = viewModal.editingId
    if (!id) return
    const amount = parseFloat(viewModal.editAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage({ text: 'Enter a valid amount (Rs)', type: 'error' })
      return
    }
    penaltyApi.update(id, {
      deduction_amount: amount,
      description: (viewModal.editDesc || '').trim() || undefined,
    })
      .then(() => {
        loadViewModalRecords()
        loadList()
        setViewModal((m) => ({ ...m, editingId: null }))
      })
      .catch((err) => setMessage({ text: err.response?.data?.error || 'Update failed', type: 'error' }))
  }

  const totalDeduction = list.reduce((s, r) => s + (parseFloat(r.deduction_amount) || 0), 0)

  return (
    <div className="pageContent penaltyPage">
      <header className="penaltyHeader">
        <div>
          <h1 className="penaltyTitle">Penalty (Late and Manual)</h1>
          <p className="penaltySubtitle">Late: 2.5 Rs/min until 300 Rs/month, then 5 Rs/min. Shift start 9:00 AM. Hourly only. Resets 1st of month.</p>
        </div>
        <button type="button" className={'btn ' + (showManual ? 'btn-secondary' : 'btn-primary')} onClick={() => setShowManual(!showManual)}>
          {showManual ? 'Cancel' : '+ Add manual penalty'}
        </button>
      </header>

      {showManual && (
        <div className="card penaltyManualCard">
          <h3 className="penaltyCardTitle">Add manual penalty</h3>
          <form onSubmit={handleManualSubmit} className="penaltyManualForm">
            <div className="penaltyField">
              <label>Employee *</label>
              <select className="input" value={manualEmp} onChange={(e) => setManualEmp(e.target.value)} required>
                <option value="">Select...</option>
                {employeeOptions.map((e) => <option key={e.emp_code} value={e.emp_code}>{e.emp_code} — {e.name || '—'}</option>)}
              </select>
            </div>
            <div className="penaltyField">
              <label>Amount (Rs) *</label>
              <input type="number" className="input" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} min="0" step="0.01" required />
            </div>
            <div className="penaltyField">
              <label>Date</label>
              <input type="date" className="input" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div className="penaltyField penaltyFieldWide">
              <label>Description</label>
              <input type="text" className="input" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} placeholder="e.g. Manual penalty reason" />
            </div>
            <div className="penaltyField">
              <button type="submit" className="btn btn-primary" disabled={manualSubmitting}>{manualSubmitting ? 'Adding…' : 'Add penalty'}</button>
            </div>
          </form>
          {message.text && <p className={'penaltyMessage ' + message.type}>{message.text}</p>}
        </div>
      )}

      <div className="penaltyTabs">
        <button type="button" className={'penaltyTab ' + (activeTab === 'records' ? 'active' : '')} onClick={() => setActiveTab('records')}>
          Penalty records
        </button>
        <button type="button" className={'penaltyTab ' + (activeTab === 'inquiries' ? 'active' : '')} onClick={() => setActiveTab('inquiries')}>
          Penalty inquiries
          {inquiryList.some((r) => r.status === 'open') && (
            <span className="penaltyTabBadge">{inquiryList.filter((r) => r.status === 'open').length}</span>
          )}
        </button>
      </div>

      {activeTab === 'records' && (
        <>
      <div className="card penaltyFilterCard">
        <h3 className="penaltyCardTitle">Filters</h3>
        <div className="penaltyFilterRow">
          <div className="penaltyField">
            <label>Search</label>
            <input
              type="text"
              className="input"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Emp code or name..."
            />
          </div>
          <div className="penaltyField">
            <label>Month</label>
            <select className="input" value={filters.month} onChange={(e) => setFilters((f) => ({ ...f, month: e.target.value }))}>
              <option value="">All</option>
              {monthNames.map((m, i) => i && <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="penaltyField">
            <label>Year</label>
            <input type="number" className="input" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))} placeholder="Year" min={2020} max={2030} style={{ width: 90 }} />
          </div>
          <div className="penaltyField">
            <label>Date from</label>
            <input type="date" className="input" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div className="penaltyField">
            <label>Date to</label>
            <input type="date" className="input" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="card tableCard">
        <div className="penaltyTableHeader">
          <h3 className="penaltyCardTitle">Penalty records</h3>
          <span className="penaltyTotal">Total (filtered): Rs {totalDeduction.toFixed(2)}</span>
        </div>
        {loading ? <p className="muted">Loading…</p> : (
          <table className="dataTable penaltyTable">
            <thead>
              <tr>
                <th>Emp code</th>
                <th>Name</th>
                <th>Date</th>
                <th>Type</th>
                <th>Came at</th>
                <th>Shift start</th>
                <th>Min late</th>
                <th>Amount (Rs)</th>
                <th>Rate</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={11} className="muted">No penalties match filters.</td></tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.emp_code}</strong></td>
                    <td>{row.name || '—'}</td>
                    <td>{row.date}</td>
                    <td>
                      {row.is_manual
                        ? <span className="badge badge-warn">Manual</span>
                        : <span className="badge badge-success">Automatic (Late)</span>}
                    </td>
                    <td>{row.punch_in_time || '—'}</td>
                    <td>{row.shift_start_time || '—'}</td>
                    <td>{row.minutes_late != null && row.minutes_late !== '' ? row.minutes_late : '—'}</td>
                    <td>{Number(row.deduction_amount).toFixed(2)}</td>
                    <td>{row.rate_used != null ? `${row.rate_used} Rs/min` : '—'}</td>
                    <td className="penaltyDesc">{row.description || '—'}</td>
                    <td className="penaltyActions">
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => openView(row)}>View</button>
                      <button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(row.id)}>Remove</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}

      {activeTab === 'inquiries' && (
        <>
      <p className="muted" style={{ marginBottom: '1rem' }}>Employee disputes. Approve, reject, or adjust amount.</p>
      <div className="filters card" style={{ marginBottom: '1rem' }}>
        <div>
          <label className="label">Status</label>
          <select className="input" value={inquiryStatusFilter} onChange={(e) => setInquiryStatusFilter(e.target.value)} style={{ minWidth: 140 }}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="amount_adjusted">Amount adjusted</option>
          </select>
        </div>
      </div>
      <div className="card tableCard" style={{ marginBottom: '1rem' }}>
        {inquiryLoading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table className="dataTable penaltyTable">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Penalty date</th>
                <th>Amount (Rs)</th>
                <th>Message</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inquiryList.length === 0 ? (
                <tr><td colSpan={7} className="muted">No inquiries.</td></tr>
              ) : (
                inquiryList.map((row) => (
                  <tr key={row.id}>
                    <td>{row.emp_code}</td>
                    <td>{row.penalty_date}</td>
                    <td>{row.deduction_amount}</td>
                    <td className="penaltyDesc">{row.message || '—'}</td>
                    <td><span className="statusBadge">{row.status}</span></td>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                    <td>
                      {row.status === 'open' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <button type="button" className="btn btn-small btn-primary" onClick={() => handleInquiryResolve(row.id, 'approved')}>Approve</button>
                          <button type="button" className="btn btn-small btn-secondary" onClick={() => handleInquiryResolve(row.id, 'rejected')}>Reject</button>
                          {inquiryAdjust.id === row.id ? (
                            <>
                              <input type="number" className="input" value={inquiryAdjust.amount} onChange={(e) => setInquiryAdjust((a) => ({ ...a, amount: e.target.value }))} placeholder="New amount" style={{ width: 90 }} min="0" step="0.01" />
                              <button type="button" className="btn btn-small btn-primary" onClick={() => handleInquiryResolve(row.id, 'amount_adjusted', inquiryAdjust.amount)}>Apply</button>
                              <button type="button" className="btn btn-small btn-secondary" onClick={() => setInquiryAdjust({ id: null, amount: '' })}>Cancel</button>
                            </>
                          ) : (
                            <button type="button" className="btn btn-small btn-secondary" onClick={() => setInquiryAdjust({ id: row.id, amount: row.deduction_amount || '' })}>Adjust amount</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      {inquiryMessage && <p style={{ marginBottom: '1rem', color: 'var(--accent)' }}>{inquiryMessage}</p>}
        </>
      )}

      {viewModal.open && (
        <div className="penaltyViewOverlay" onClick={closeView}>
          <div className="penaltyViewModal card" onClick={(e) => e.stopPropagation()}>
            <div className="penaltyViewHeader">
              <div className="penaltyViewTitleBlock">
                <h3 className="penaltyViewTitle">Penalty breakdown</h3>
                <p className="penaltyViewSubtitle">{viewModal.name} · {viewModal.emp_code} · {monthNames[parseInt(viewModal.month, 10)]} {viewModal.year}</p>
              </div>
              <button type="button" className="penaltyViewClose" onClick={closeView} aria-label="Close">×</button>
            </div>
            {viewModal.loading ? (
              <div className="penaltyViewLoading">
                <span className="penaltyViewSpinner" />
                <p className="muted">Loading breakdown…</p>
              </div>
            ) : (
              <>
                <div className="penaltyViewSummary">
                  <span className="penaltyViewStat">
                    <strong>{viewModal.records.length}</strong> day{viewModal.records.length !== 1 ? 's' : ''} with penalty
                  </span>
                  <span className="penaltyViewStat penaltyViewStatTotal">
                    Total <strong>Rs {viewModal.records.reduce((s, r) => s + (parseFloat(r.deduction_amount) || 0), 0).toFixed(2)}</strong>
                  </span>
                </div>
                <div className="penaltyViewTableWrap">
                  <table className="dataTable penaltyTable penaltyViewTable">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Min late</th>
                        <th>Amount (Rs)</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewModal.records.length === 0 ? (
                        <tr><td colSpan={6} className="penaltyViewEmpty"><span className="penaltyViewEmptyIcon">📋</span> No penalty records for this month.</td></tr>
                      ) : (
                        viewModal.records.map((rec) => (
                          <tr key={rec.id}>
                            <td>{rec.date}</td>
                            <td>{rec.minutes_late != null && rec.minutes_late !== '' ? rec.minutes_late : '—'}</td>
                            {viewModal.editingId === rec.id ? (
                              <>
                                <td>
                                  <input
                                    type="number"
                                    className="input penaltyViewInput"
                                    value={viewModal.editAmount}
                                    onChange={(e) => setViewModal((m) => ({ ...m, editAmount: e.target.value }))}
                                    min="0"
                                    step="0.01"
                                  />
                                </td>
                                <td colSpan={2}>
                                  <input
                                    type="text"
                                    className="input penaltyViewInput"
                                    value={viewModal.editDesc}
                                    onChange={(e) => setViewModal((m) => ({ ...m, editDesc: e.target.value }))}
                                    placeholder="Description"
                                  />
                                </td>
                                <td>
                                  <button type="button" className="btn btn-small btn-primary" onClick={saveEditInModal}>Save</button>
                                  <button type="button" className="btn btn-small btn-secondary" onClick={cancelEditInModal}>Cancel</button>
                                </td>
                              </>
                            ) : (
                              <>
                                <td>{Number(rec.deduction_amount).toFixed(2)}</td>
                                <td>
                                  {rec.is_manual ? <span className="badge badge-warn">Manual</span> : <span className="badge badge-success">Late</span>}
                                </td>
                                <td className="penaltyDesc">{rec.description || '—'}</td>
                                <td>
                                  <button type="button" className="btn btn-small btn-secondary" onClick={() => startEditInModal(rec)}>Change</button>
                                  <button type="button" className="btn btn-small btn-danger" onClick={() => handleDeleteInModal(rec.id)}>Remove</button>
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
