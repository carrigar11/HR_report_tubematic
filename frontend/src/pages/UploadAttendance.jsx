import { useState } from 'react'
import { upload } from '../api'
import './Upload.css'

export default function UploadAttendance() {
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
      const { data } = await upload.attendance(file)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pageContent">
      <div className="card uploadCard">
        <p className="uploadHint">Required: Emp Id, Date. Optional: Name, Dept, Designation, Day, Punch In, Punch Out, Total Working Hours, Total Break, Status. Smart update: only missing punch_out is filled; no overwrite.</p>
        <form onSubmit={handleSubmit} className="uploadForm">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {error && <div className="uploadError">{error}</div>}
          {result && (
            <div className="uploadResult">
              Inserted: {result.inserted}, Updated: {result.updated}, Skipped: {result.skipped}, Errors: {result.errors}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      </div>
    </div>
  )
}
