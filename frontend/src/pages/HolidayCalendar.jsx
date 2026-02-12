import { useState, useEffect } from 'react'
import { holidays } from '../api'
import './Table.css'

export default function HolidayCalendar() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())
  const [form, setForm] = useState({ date: '', name: '', year: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = () => {
    setLoading(true)
    holidays.list(yearFilter ? { year: yearFilter } : {})
      .then((r) => setList(r.data.results ?? r.data ?? []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [yearFilter])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.date || !form.name) {
      setMessage('Date and name required')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await holidays.create({
        date: form.date,
        name: form.name,
        year: form.year ? parseInt(form.year, 10) : new Date(form.date).getFullYear(),
      })
      setForm({ date: '', name: '', year: '' })
      load()
      setMessage('Holiday added.')
    } catch (err) {
      setMessage(err.response?.data?.detail || err.message || 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this holiday?')) return
    try {
      await holidays.delete(id)
      load()
    } catch (err) {
      setMessage(err.response?.data?.detail || err.message || 'Failed')
    }
  }

  return (
    <div className="pageContent">
      <h2 className="sectionTitle">Holiday Calendar</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>Manage public holidays so absentee logic does not flag them.</p>
      <div className="filters card">
        <div>
          <label className="label">Year</label>
          <input type="number" className="input" value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))} style={{ maxWidth: 100 }} />
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Add holiday</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Name</label>
            <input type="text" className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Christmas" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
        </form>
        {message && <p style={{ margin: '0.5rem 0 0', color: 'var(--accent)' }}>{message}</p>}
      </div>
      <div className="card tableCard">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Year</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(list) ? list : []).map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>{row.name}</td>
                  <td>{row.year || '—'}</td>
                  <td><button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }} onClick={() => handleDelete(row.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && Array.isArray(list) && list.length === 0 && <p className="muted">No holidays for this year.</p>}
      </div>
    </div>
  )
}
