import { useState } from 'react'
import { upload } from '../api'
import { IconUsers, IconCalendar } from '../components/Icons'
import './Upload.css'

function UploadCard({ title, icon: Icon, hint, accept, onSubmit, resultKeys }) {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Select a file')
      return
    }
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const { data } = await onSubmit(file)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="uploadPageCard card">
      <div className="uploadPageCardHead">
        <span className="uploadPageCardIcon">
          <Icon />
        </span>
        <h2 className="uploadPageCardTitle">{title}</h2>
      </div>
      <p className="uploadHint">{hint}</p>
      <form onSubmit={handleSubmit} className="uploadForm">
        <input
          type="file"
          accept={accept}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {error && <div className="uploadError">{error}</div>}
        {result && resultKeys && (
          <div className="uploadResult">
            {resultKeys.map(({ key, label }) => (
              <span key={key}>{label}: {result[key] ?? '—'}</span>
            )).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ' · ', curr], [])}
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
    </section>
  )
}

export default function Upload() {
  return (
    <div className="pageContent uploadPage">
      <div className="uploadPageIntro">
        <h2 className="uploadPageTitle">Upload data</h2>
        <p className="uploadPageSub">Import employees and attendance from Excel. Choose a file and upload.</p>
      </div>
      <div className="uploadPageGrid">
        <UploadCard
          title="Upload employees"
          icon={IconUsers}
          hint="Required columns (flexible names): Code, Name. Optional: Mobile No, Email, Gender, Department Name, Designation Name, Status, Employment Type, Salary Type, Salary. Handles *, / and case variations."
          accept=".xlsx,.xls"
          onSubmit={upload.employees}
          resultKeys={[
            { key: 'created', label: 'Created' },
            { key: 'updated', label: 'Updated' },
            { key: 'errors', label: 'Errors' },
          ]}
        />
        <UploadCard
          title="Upload attendance"
          icon={IconCalendar}
          hint="Required: Emp Id, Date. Optional: Name, Dept, Designation, Day, Punch In, Punch Out, Total Working Hours, Total Break, Status. Smart update: only missing punch_out is filled; no overwrite."
          accept=".xlsx,.xls"
          onSubmit={upload.attendance}
          resultKeys={[
            { key: 'inserted', label: 'Inserted' },
            { key: 'updated', label: 'Updated' },
            { key: 'skipped', label: 'Skipped' },
            { key: 'errors', label: 'Errors' },
          ]}
        />
      </div>
    </div>
  )
}
