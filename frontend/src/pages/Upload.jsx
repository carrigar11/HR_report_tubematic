import { useState } from 'react'
import { upload } from '../api'
import { IconUsers, IconCalendar } from '../components/Icons'
import './Upload.css'

function UploadCard({ title, icon: Icon, hint, accept, onPreview, onConfirm, type }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('select') // select, preview, done

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

  const hasChanges = preview && (preview.created > 0 || preview.updated > 0 || preview.inserted > 0)

  return (
    <section className="uploadPageCard card">
      <div className="uploadPageCardHead">
        <span className="uploadPageCardIcon">
          <Icon />
        </span>
        <h2 className="uploadPageCardTitle">{title}</h2>
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
              {type === 'employees' ? (
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
          accept=".xlsx,.xls"
          type="employees"
          onPreview={(file) => upload.employees(file, true)}
          onConfirm={(file) => upload.employees(file, false)}
        />
        <UploadCard
          title="Upload attendance"
          icon={IconCalendar}
          hint="Required: Emp Id, Date. Optional: Name, Dept, Designation, Day, Punch In, Punch Out, Total Working Hours, Total Break, Status. Smart update: only missing punch_out is filled; no overwrite."
          accept=".xlsx,.xls"
          type="attendance"
          onPreview={(file) => upload.attendance(file, true)}
          onConfirm={(file) => upload.attendance(file, false)}
        />
      </div>
    </div>
  )
}