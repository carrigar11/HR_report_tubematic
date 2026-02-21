import { useState } from 'react'
import { upload } from '../api'
import './Upload.css'

export default function UploadEmployees() {
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
      const { data } = await upload.employees(file)
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
        <p className="uploadHint">Required columns (flexible names): Code, Name. Optional: Mobile No, Email, Gender, Department Name, Designation Name, Status, Employment Type, Salary Type, Salary. Handles *, / and case variations.</p>
        <form onSubmit={handleSubmit} className="uploadForm">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {error && <div className="uploadError">{error}</div>}
          {result && (
            <div className="uploadResult">
              Created: {result.created}, Updated: {result.updated}, Errors: {result.errors}
              {result.created_admins?.length > 0 && (
                <div className="uploadResultAdmins">New department admin(s) created: {result.created_admins.join(', ')} (default password as super admin)</div>
              )}
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
