import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { systemOwner } from '../../api'
import './SystemOwner.css'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch (_) {
    return iso
  }
}

/* All possible fields in a fixed order so View shows every field */
const EXTRA_LABELS = {
  company_url: 'Company URL',
  gstin: 'GSTIN',
  gst_number: 'GST Number',
  pan: 'PAN (Company or Owner)',
  business_name_gst: 'Business name (as per GST/PAN)',
  aadhar: 'Aadhar',
  type_of_business: 'Type of business',
  type_of_business_other: 'Type of business (other)',
}

const EXTRA_KEYS_ORDER = [
  'company_url',
  'pan',
  'aadhar',
  'gstin',
  'gst_number',
  'business_name_gst',
  'type_of_business',
  'type_of_business_other',
]

function getExtraValue(extra, key) {
  const v = extra[key]
  if (v == null || String(v).trim() === '') return '—'
  return String(v).trim()
}

const fieldStyle = { margin: 0, display: 'grid', gap: '0.85rem' }
const dtStyle = { fontSize: '0.8rem', marginBottom: '0.2rem' }

function ViewFullDataModal({ request, onClose }) {
  if (!request) return null
  const extra = request.extra_data || {}
  return (
    <div className="modalOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="card modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className="pageSubtitle" style={{ margin: 0 }}>Full company request data</h3>
          <button type="button" className="btn btn-secondary btnSm" onClick={onClose}>Close</button>
        </div>
        <div className="companyRequestViewGrid">
          {/* Left: Contact & basic */}
          <div className="companyRequestViewPanel">
            <h4 className="companyRequestViewPanelTitle">Contact & basic</h4>
            <dl className="companyRequestFullDataList" style={fieldStyle}>
              <div><dt className="muted" style={dtStyle}>Submitted</dt><dd>{formatDate(request.created_at)}</dd></div>
              <div><dt className="muted" style={dtStyle}>Company name</dt><dd><strong>{request.company_name || '—'}</strong></dd></div>
              <div><dt className="muted" style={dtStyle}>Contact email</dt><dd>{request.contact_email ? <a href={`mailto:${request.contact_email}`}>{request.contact_email}</a> : '—'}</dd></div>
              <div><dt className="muted" style={dtStyle}>Contact phone</dt><dd>{request.contact_phone || '—'}</dd></div>
              <div><dt className="muted" style={dtStyle}>Address</dt><dd><pre className="companyRequestViewPre">{(request.address || '').trim() || '—'}</pre></dd></div>
              <div><dt className="muted" style={dtStyle}>Status</dt><dd><span className={`badge badge-${(request.status || 'pending') === 'pending' ? 'warn' : request.status === 'declined' ? 'danger' : 'success'}`}>{(request.status || 'pending').replace('_', ' ')}</span></dd></div>
            </dl>
          </div>
          {/* Right: Business & documents */}
          <div className="companyRequestViewPanel">
            <h4 className="companyRequestViewPanelTitle">Business & documents</h4>
            <dl className="companyRequestFullDataList" style={fieldStyle}>
              {EXTRA_KEYS_ORDER.map((key) => {
                const value = getExtraValue(extra, key)
                const label = EXTRA_LABELS[key] || key
                return (
                  <div key={key}>
                    <dt className="muted" style={dtStyle}>{label}</dt>
                    <dd>
                      {key === 'company_url' && value !== '—' ? (
                        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer">{value}</a>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                )
              })}
              {Object.keys(extra)
                .filter((k) => !EXTRA_KEYS_ORDER.includes(k))
                .map((key) => (
                  <div key={key}>
                    <dt className="muted" style={dtStyle}>{EXTRA_LABELS[key] || key}</dt>
                    <dd>{getExtraValue(extra, key)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SystemOwnerCompanyRequests() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewModalRequest, setViewModalRequest] = useState(null)

  useEffect(() => {
    systemOwner.companyRequests.list()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((e) => setError(e.response?.data?.error || e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (error) return <div className="card"><p className="error">{error}</p></div>

  return (
    <div className="systemOwnerPage">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h2 className="pageSubtitle" style={{ margin: 0 }}>Company registration requests</h2>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/system-owner/companies/add')}>
            Add company
          </button>
        </div>
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Requests from &quot;Register your company&quot;. Use <strong>View</strong> to see full data (address, PAN, Aadhar, etc.). Create company to approve, or decline with a reason.
        </p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="muted">No registration requests yet.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>GSTIN / PAN</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const extra = r.extra_data || {}
                  const typeOfBusiness = extra.type_of_business || '—'
                  const gstPan = [extra.gstin, extra.gst_number, extra.pan].filter(Boolean).join(' / ') || '—'
                  const isPending = (r.status || 'pending') === 'pending'
                  return (
                    <tr key={r.id}>
                      <td>{formatDate(r.created_at)}</td>
                      <td><strong>{r.company_name}</strong></td>
                      <td>
                        <a href={`mailto:${r.contact_email}`}>{r.contact_email}</a>
                      </td>
                      <td>{r.contact_phone || '—'}</td>
                      <td>{typeOfBusiness}</td>
                      <td style={{ fontSize: '0.9rem' }}>{gstPan}</td>
                      <td>
                        <span className={`badge badge-${isPending ? 'warn' : r.status === 'declined' ? 'danger' : 'success'}`}>
                          {(r.status || 'pending').replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btnSm"
                          onClick={() => setViewModalRequest(r)}
                        >
                          View
                        </button>
                        {' '}
                        <button
                          type="button"
                          className="btn btn-primary btnSm"
                          onClick={() => navigate('/system-owner/companies/add', { state: { fromRequest: r } })}
                        >
                          Create company
                        </button>
                        {isPending && (
                          <>
                            {' '}
                            <button
                              type="button"
                              className="btn btn-secondary btnSm"
                              onClick={() => navigate(`/system-owner/company-requests/${r.id}/decline`)}
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {viewModalRequest && (
        <ViewFullDataModal
          request={viewModalRequest}
          onClose={() => setViewModalRequest(null)}
        />
      )}
    </div>
  )
}
