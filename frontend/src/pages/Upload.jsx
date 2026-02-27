import { useState } from 'react'
import { upload } from '../api'
import { IconUsers, IconCalendar, IconClock } from '../components/Icons'
import './Upload.css'

function UploadCard({ title, icon: Icon, hint, accept, onPreview, onConfirm, type }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('select') // select, preview, done
  const [downloading, setDownloading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDownload = async (mode) => {
    // mode: 'sample' | 'data'
    try {
      setDownloading(true)
      const { data, headers } = await upload.downloadTemplate(type, mode)
      const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const suggested =
        headers['content-disposition']?.split('filename=')[1]?.replace(/\"/g, '') ||
        `${type}_${mode}.csv`
      link.href = url
      link.setAttribute('download', suggested)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const handlePreview = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Select a file')
      return
    }
    setError('')
    setPreview(null)
    setLoading(true)
    try {
      const { data } = await onPreview(file)
      if (!data.success) {
        setError(data.error || 'Preview failed')
      } else {
        setPreview(data)
        setStep('preview')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Preview failed')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const { data } = await onConfirm(file)
      if (!data.success) {
        setError(data.error || 'Upload failed')
      } else {
        setResult(data)
        setStep('done')
        setPreview(null)
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError('')
    setStep('select')
  }

  const hasChanges = preview && (
    preview.created > 0 || preview.updated > 0 || preview.inserted > 0
  )

  return (
    <section className="uploadPageCard card">
      <div className="uploadPageCardHead">
        <span className="uploadPageCardIcon">
          <Icon />
        </span>
        <h2 className="uploadPageCardTitle">{title}</h2>
        <div className="uploadPageCardActions">
          <div className="dropdown">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={downloading}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {downloading ? 'Preparing…' : 'Download'}
            </button>
            {menuOpen && (
              <div className="dropdownMenu">
                <button
                  type="button"
                  className="dropdownItem"
                  onClick={() => {
                    setMenuOpen(false)
                    handleDownload('sample')
                  }}
                  disabled={downloading}
                >
                  Download sample
                </button>
                <button
                  type="button"
                  className="dropdownItem"
                  onClick={() => {
                    setMenuOpen(false)
                    handleDownload('data')
                  }}
                  disabled={downloading}
                >
                  Download data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="uploadHint">{hint}</p>

      {error && <div className="uploadError">{error}</div>}

      {step === 'select' && (
        <form onSubmit={handlePreview} className="uploadForm">
          <input
            type="file"
            accept={accept}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file && <div className="uploadFileName">Selected: {file.name}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading || !file}>
            {loading ? 'Analyzing...' : 'Preview Changes'}
          </button>
        </form>
      )}

      {step === 'preview' && preview && (
        <div className="uploadPreview">
          <div className="uploadPreviewSummary">
            <h4>Preview Summary</h4>
            <div className="previewStats">
              {type === 'forcePunch' ? (
                <>
                  <div className="previewStat update">
                    <span className="statNum">{preview.updated}</span>
                    <span className="statLabel">Records to overwrite (punch in/out)</span>
                  </div>
                  <div className="previewStat skip">
                    <span className="statNum">{preview.skipped}</span>
                    <span className="statLabel">Skipped (no matching record)</span>
                  </div>
                </>
              ) : type === 'employees' ? (
                <>
                  <div className="previewStat new">
                    <span className="statNum">{preview.created}</span>
                    <span className="statLabel">New employees to create</span>
                  </div>
                  <div className="previewStat update">
                    <span className="statNum">{preview.updated}</span>
                    <span className="statLabel">Employees to update</span>
                  </div>
                </>
              ) : type === 'shift' ? (
                <>
                  <div className="previewStat update">
                    <span className="statNum">{preview.updated}</span>
                    <span className="statLabel">Employees to assign/update</span>
                  </div>
                  <div className="previewStat skip">
                    <span className="statNum">{preview.skipped}</span>
                    <span className="statLabel">Unchanged / not found</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="previewStat new">
                    <span className="statNum">{preview.inserted}</span>
                    <span className="statLabel">New records to insert</span>
                  </div>
                  <div className="previewStat update">
                    <span className="statNum">{preview.updated}</span>
                    <span className="statLabel">Records to update</span>
                  </div>
                  <div className="previewStat skip">
                    <span className="statNum">{preview.skipped}</span>
                    <span className="statLabel">Unchanged (skipped)</span>
                  </div>
                </>
              )}
              {preview.errors > 0 && (
                <div className="previewStat error">
                  <span className="statNum">{preview.errors}</span>
                  <span className="statLabel">Errors</span>
                </div>
              )}
            </div>
          </div>

          {type === 'employees' && preview.to_create?.length > 0 && (
            <div className="uploadPreviewTable">
              <h5>New Employees ({preview.to_create.length}{preview.has_more ? '+' : ''})</h5>
              <div className="previewTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emp Code</th>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.to_create.map((emp, i) => (
                      <tr key={i}>
                        <td>{emp.emp_code}</td>
                        <td>{emp.name}</td>
                        <td>{emp.dept_name || '—'}</td>
                        <td>{emp.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {type === 'employees' && preview.to_update?.length > 0 && (
            <div className="uploadPreviewTable">
              <h5>Updated Employees ({preview.to_update.length}{preview.has_more ? '+' : ''})</h5>
              <div className="previewTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emp Code</th>
                      <th>Field</th>
                      <th>Old Value</th>
                      <th>New Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.to_update.slice(0, 10).map((upd, i) => (
                      <tr key={i}>
                        <td>{upd.emp_code}</td>
                        <td>Details</td>
                        <td className="oldValue">{upd.old.name} ({upd.old.dept_name || '—'})</td>
                        <td className="newValue">{upd.new.name} ({upd.new.dept_name || '—'})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {type === 'shift' && preview.to_update?.length > 0 && (
            <div className="uploadPreviewTable">
              <h5>Shift Assignments ({preview.to_update.length}{preview.has_more ? '+' : ''} employees)</h5>
              <div className="previewTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emp Code</th>
                      <th>Name</th>
                      <th>Old Shift</th>
                      <th>New Shift</th>
                      <th>Attendance Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.to_update.map((upd, i) => (
                      <tr key={i}>
                        <td>{upd.emp_code}</td>
                        <td>{upd.name || '—'}</td>
                        <td className="oldValue">{upd.old_shift ? `${upd.old_shift} (${upd.old_from?.slice(0,5) || '?'}–${upd.old_to?.slice(0,5) || '?'})` : '— none —'}</td>
                        <td className="newValue">{upd.new_shift} ({upd.new_from?.slice(0,5) || '?'}–{upd.new_to?.slice(0,5) || '?'})</td>
                        <td>{upd.attendance_records} records will update</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {type === 'shift' && preview.to_skip?.length > 0 && (
            <div className="uploadPreviewTable">
              <h5>Skipped ({preview.to_skip.length})</h5>
              <div className="previewTableWrap">
                <table>
                  <thead>
                    <tr><th>Emp Code</th><th>Name</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {preview.to_skip.map((s, i) => (
                      <tr key={i}>
                        <td>{s.emp_code}</td>
                        <td>{s.name || '—'}</td>
                        <td>{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {type === 'attendance' && preview.to_insert?.length > 0 && (
            <div className="uploadPreviewTable">
              <h5>New Attendance Records ({preview.to_insert.length}{preview.has_more ? '+' : ''})</h5>
              <div className="previewTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emp Code</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Punch In</th>
                      <th>Punch Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.to_insert.map((rec, i) => (
                      <tr key={i}>
                        <td>{rec.emp_code}</td>
                        <td>{rec.date}</td>
                        <td>{rec.status}</td>
                        <td>{rec.punch_in?.slice(0, 5) || '—'}</td>
                        <td>{rec.punch_out?.slice(0, 5) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {type === 'forcePunch' && preview.to_update?.length > 0 && (
            <div className="uploadPreviewTable">
              <h5>Force Punch Updates ({preview.to_update.length}{preview.has_more ? '+' : ''})</h5>
              <div className="previewTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emp Code</th>
                      <th>Date</th>
                      <th>Old Punch In</th>
                      <th>New Punch In</th>
                      <th>Old Punch Out</th>
                      <th>New Punch Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.to_update.map((upd, i) => (
                      <tr key={i}>
                        <td>{upd.emp_code}</td>
                        <td>{upd.date}</td>
                        <td className="oldValue">{upd.old_punch_in?.slice(0, 5) || '—'}</td>
                        <td className="newValue">{upd.new_punch_in?.slice(0, 5) || '—'}</td>
                        <td className="oldValue">{upd.old_punch_out?.slice(0, 5) || '—'}</td>
                        <td className="newValue">{upd.new_punch_out?.slice(0, 5) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {type === 'attendance' && preview.to_update?.length > 0 && (
            <div className="uploadPreviewTable">
              <h5>Updated Records (Missing Punch Out) ({preview.to_update.length}{preview.has_more ? '+' : ''})</h5>
              <div className="previewTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Emp Code</th>
                      <th>Date</th>
                      <th>Old Punch Out</th>
                      <th>New Punch Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.to_update.map((upd, i) => (
                      <tr key={i}>
                        <td>{upd.emp_code}</td>
                        <td>{upd.date}</td>
                        <td className="oldValue">{upd.old_punch_out?.slice(0, 5) || 'None'}</td>
                        <td className="newValue">{upd.new_punch_out?.slice(0, 5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.has_more && (
            <p className="previewMore">Showing first 20 records. More changes will be applied...</p>
          )}

          <div className="uploadPreviewActions">
            {hasChanges ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  disabled={loading}
                >
                  {loading ? 'Uploading...' : 'Confirm & Upload Changes'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <p className="noChanges">No changes to apply. All records already up to date.</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleReset}
                >
                  Upload Different File
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="uploadResult">
          <h4>Upload Complete!</h4>
          <div className="resultStats">
            {type === 'employees' ? (
              <>
                <span>Created: {result.created}</span>
                <span>Updated: {result.updated}</span>
                {result.errors > 0 && <span className="errorStat">Errors: {result.errors}</span>}
              </>
            ) : type === 'shift' ? (
              <>
                <span>Employees updated: {result.updated}</span>
                <span>Skipped: {result.skipped}</span>
                {result.attendance_updated > 0 && <span>Attendance OT recalculated: {result.attendance_updated}</span>}
                {result.errors > 0 && <span className="errorStat">Errors: {result.errors}</span>}
              </>
            ) : type === 'forcePunch' ? (
              <>
                <span>Updated: {result.updated}</span>
                <span>Skipped: {result.skipped}</span>
                {result.errors > 0 && <span className="errorStat">Errors: {result.errors}</span>}
              </>
            ) : (
              <>
                <span>Inserted: {result.inserted}</span>
                <span>Updated: {result.updated}</span>
                <span>Skipped: {result.skipped}</span>
                {result.errors > 0 && <span className="errorStat">Errors: {result.errors}</span>}
              </>
            )}
          </div>
          <button type="button" className="btn btn-primary" onClick={handleReset}>
            Upload Another File
          </button>
        </div>
      )}
    </section>
  )
}

export default function Upload() {
  return (
    <div className="pageContent uploadPage">
      <div className="uploadPageIntro">
        <h2 className="uploadPageTitle">Upload data</h2>
        <p className="uploadPageSub">Import employees and attendance from Excel. Preview changes before confirming.</p>
      </div>
      <div className="uploadPageGrid">
        <UploadCard
          title="Upload employees"
          icon={IconUsers}
          hint="Required columns (flexible names): Code, Name. Optional: Mobile No, Email, Gender, Department Name, Designation Name, Status, Employment Type, Salary Type, Salary. Handles *, / and case variations."
          accept=".xlsx,.xls,.csv"
          type="employees"
          onPreview={(file) => upload.employees(file, true)}
          onConfirm={(file) => upload.employees(file, false)}
        />
        <UploadCard
          title="Upload attendance"
          icon={IconCalendar}
          hint="Required: Emp Id, Date. Optional: Name, Dept, Designation, Day, Punch In, Punch Out, Total Working Hours, Total Break, Status. Smart update: only missing punch_out is filled; no overwrite."
          accept=".xlsx,.xls,.csv"
          type="attendance"
          onPreview={(file) => upload.attendance(file, true)}
          onConfirm={(file) => upload.attendance(file, false)}
        />
        <UploadCard
          title="Upload Employee Shifts"
          icon={IconClock}
          hint="Assigns shift to employees permanently. Required: Emp Id, Shift, From, To. Shift is fixed per employee until a new one is uploaded. All past & future attendance records will be updated."
          accept=".xlsx,.xls,.csv"
          type="shift"
          onPreview={(file) => upload.shift(file, true)}
          onConfirm={(file) => upload.shift(file, false)}
        />
        <UploadCard
          title="Upload as force punch in and out"
          icon={IconClock}
          hint="Overwrites punch_in and punch_out for existing attendance records. Required: Emp Id, Date, Punch In, Punch Out. Optional: Total Working Hours. Only updates records that already exist."
          accept=".xlsx,.xls,.csv"
          type="forcePunch"
          onPreview={(file) => upload.forcePunch(file, true)}
          onConfirm={(file) => upload.forcePunch(file, false)}
        />
      </div>
    </div>
  )
}