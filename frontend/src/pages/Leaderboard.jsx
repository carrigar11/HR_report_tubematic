import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { leaderboard, giveBonus, runRewardEngine, bonus } from '../api'
import './Table.css'
import './Leaderboard.css'

const MONTHS = [
  { value: 1, label: 'Jan' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' }, { value: 8, label: 'Aug' }, { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dec' },
]
const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const YEARS = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i)

function rankMedal(i) {
  if (i === 0) return { emoji: '\u{1F947}', cls: 'lbMedal1' }
  if (i === 1) return { emoji: '\u{1F948}', cls: 'lbMedal2' }
  if (i === 2) return { emoji: '\u{1F949}', cls: 'lbMedal3' }
  return { emoji: '', cls: '' }
}

function formatLastBonus(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return null
  }
}

function BonusHistoryBlock({ bonusHistory, loading }) {
  if (loading) return <div className="lbBonusHistory">Loading past awards…</div>
  if (!bonusHistory || bonusHistory.length === 0) return <div className="lbBonusHistory lbBonusHistoryNone">No bonus given yet.</div>
  return (
    <div className="lbBonusHistory">
      <span className="lbBonusHistoryLabel">Bonus given before:</span>
      <ul className="lbBonusHistoryList">
        {bonusHistory.map((g, i) => (
          <li key={i}>{g.hours != null ? `${g.hours}h` : '—'} on {formatLastBonus(g.given_at) || '—'}</li>
        ))}
      </ul>
    </div>
  )
}

export default function Leaderboard() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterMonth, setFilterMonth] = useState(currentMonth)
  const [filterYear, setFilterYear] = useState(currentYear)
  const [bonusOpen, setBonusOpen] = useState(null)
  const [bonusVal, setBonusVal] = useState('')
  const [bonusLoading, setBonusLoading] = useState(false)
  const [bonusMsg, setBonusMsg] = useState('')
  const [runEngineLoading, setRunEngineLoading] = useState(false)
  const [bonusHistory, setBonusHistory] = useState([])
  const [bonusHistoryLoading, setBonusHistoryLoading] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    setError('')
    leaderboard({ month: filterMonth, year: filterYear })
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch((err) => {
        setList([])
        setError(err.response?.data?.error || err.message || 'Failed to load leaderboard')
      })
      .finally(() => setLoading(false))
  }, [filterMonth, filterYear])

  const handleRunRewardEngine = async () => {
    setRunEngineLoading(true)
    setError('')
    try {
      await runRewardEngine()
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || err.message || 'Failed to run reward engine')
    } finally {
      setRunEngineLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!bonusOpen) {
      setBonusHistory([])
      return
    }
    setBonusHistoryLoading(true)
    bonus.employeeDetails(bonusOpen, filterMonth, filterYear)
      .then((r) => setBonusHistory(r.data?.manual_bonus_grants || []))
      .catch(() => setBonusHistory([]))
      .finally(() => setBonusHistoryLoading(false))
  }, [bonusOpen, filterMonth, filterYear])

  const handleBonus = async (empCode) => {
    const hrs = parseFloat(bonusVal)
    if (!hrs || hrs <= 0) return
    setBonusLoading(true)
    setBonusMsg('')
    try {
      const { data } = await giveBonus(empCode, hrs)
      setBonusMsg(`Done! Total bonus: ${data.new_bonus}h`)
      setBonusVal('')
      fetchData()
    } catch (err) {
      setBonusMsg('Error: ' + (err.response?.data?.error || err.message))
    } finally {
      setBonusLoading(false)
    }
  }

  // Deduplicate by emp_code for top performers, keep full list for history
  const seen = new Set()
  const topPerformers = []
  list.forEach((r, i) => {
    if (!seen.has(r.emp_code)) {
      seen.add(r.emp_code)
      topPerformers.push({ ...r, rank: topPerformers.length })
    }
  })

  const top3 = topPerformers.slice(0, 3)
  const rest = topPerformers.slice(3)

  if (loading) return <div className="pageContent lbPage"><div className="lbEmpty"><p className="muted">Loading leaderboard…</p></div></div>

  const monthLabel = MONTHS.find((m) => m.value === filterMonth)?.label || filterMonth
  const periodLabel = `${monthLabel} ${filterYear}`

  return (
    <div className="pageContent lbPage">
      {/* Filter + Header */}
      <div className="lbFilterBar">
        <div className="lbFilterGroup">
          <label className="lbFilterLabel">Month</label>
          <select className="lbFilterSelect" value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="lbFilterGroup">
          <label className="lbFilterLabel">Year</label>
          <select className="lbFilterSelect" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="lbHeader">
        <div className="lbHeaderRow">
          <div>
            <h2 className="lbTitle">Leaderboard</h2>
            <span className="lbSubtitle">Top performers — {periodLabel}</span>
          </div>
          <button type="button" className="btn btn-secondary lbRunEngineBtn" onClick={handleRunRewardEngine} disabled={runEngineLoading}>
            {runEngineLoading ? 'Running…' : 'Run reward engine'}
          </button>
        </div>
        {error && <p className="lbError">{error}</p>}
      </div>

      {/* Top 3 Podium */}
      {top3.length > 0 && (
        <div className="lbPodium">
          {top3.map((row, i) => {
            const medal = rankMedal(i)
            return (
              <div key={row.emp_code} className={`lbPodiumCard ${medal.cls}`}>
                <div className="lbPodiumRank">{medal.emoji} #{i + 1}</div>
                <div className="lbPodiumAvatar">
                  {(row.name || row.emp_code).split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="lbPodiumName">{row.name || row.emp_code}</div>
                <div className="lbPodiumDept">{row.dept_name || '—'}</div>
                <div className="lbPodiumStats">
                  <div className="lbPodiumStat">
                    <span className="lbPodiumStatNum">{Number(row.month_hours || 0).toFixed(0)}</span>
                    <span className="lbPodiumStatLabel">Hours</span>
                  </div>
                  <div className="lbPodiumStat">
                    <span className="lbPodiumStatNum">{Number(row.month_ot || 0).toFixed(0)}</span>
                    <span className="lbPodiumStatLabel">OT</span>
                  </div>
                  <div className="lbPodiumStat">
                    <span className="lbPodiumStatNum">{row.streak_count || 0}</span>
                    <span className="lbPodiumStatLabel">Streaks</span>
                  </div>
                </div>
                <div className="lbPodiumTrigger">
                  <span className={`lbBadge ${/streak/i.test(row.trigger_reason) ? 'lbBadgeGreen' : /overtime/i.test(row.trigger_reason) ? 'lbBadgePurple' : 'lbBadgeBlue'}`}>
                    {row.trigger_reason}
                  </span>
                </div>
                {row.last_bonus_awarded_at && (
                  <div className="lbLastAwarded">Last awarded: {formatLastBonus(row.last_bonus_awarded_at)}</div>
                )}
                {!row.last_bonus_awarded_at && (
                  <div className="lbLastAwarded lbLastAwardedNone">Not awarded yet</div>
                )}
                <div className="lbPodiumActions">
                  <Link to={`/employees/${row.emp_code}/profile`} className="lbCardBtn lbCardBtnView">View Profile</Link>
                  <button type="button" className="lbGiveBonusBtn" onClick={() => { setBonusOpen(bonusOpen === row.emp_code ? null : row.emp_code); setBonusVal(''); setBonusMsg('') }}>
                    Give Bonus
                  </button>
                </div>
                {bonusOpen === row.emp_code && (
                  <div className="lbBonusBarWrap">
                    <BonusHistoryBlock bonusHistory={bonusHistory} loading={bonusHistoryLoading} />
                    <div className="lbBonusBar">
                      <input type="number" className="lbBonusInput" placeholder="Hours" min="0" step="1" value={bonusVal} onChange={(e) => setBonusVal(e.target.value)} />
                      <button className="lbBonusSubmit" disabled={bonusLoading || !bonusVal} onClick={() => handleBonus(row.emp_code)}>
                        {bonusLoading ? '...' : 'Award'}
                      </button>
                      {bonusMsg && <span className="lbBonusFeedback">{bonusMsg}</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Rest of leaderboard */}
      {rest.length > 0 && (
        <div className="lbListSection">
          <h3 className="lbListTitle">Other Performers</h3>
          <div className="card tableCard">
            <table className="lbTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Employee</th>
                  <th>Reward</th>
                  <th>Hours / OT / Streaks</th>
                  <th>Days</th>
                  <th>Bonus</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((row) => (
                  <React.Fragment key={row.emp_code}>
                    <tr>
                      <td><span className="lbRankNum">{row.rank + 1}</span></td>
                      <td>
                        <div className="lbEmpCell">
                          <div className="lbEmpInfo">
                            <span className="lbEmpName">{row.name || row.emp_code}</span>
                            <span className="lbEmpDept">{row.dept_name || '—'}{row.designation ? ` \u00B7 ${row.designation}` : ''}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`lbBadge ${/streak/i.test(row.trigger_reason) ? 'lbBadgeGreen' : /overtime/i.test(row.trigger_reason) ? 'lbBadgePurple' : 'lbBadgeBlue'}`}>
                          {row.trigger_reason}
                        </span>
                      </td>
                      <td>
                        <div className="lbMiniStats">
                          <span className="lbMini lbMiniBlue">{Number(row.month_hours || 0).toFixed(0)}h</span>
                          <span className="lbMini lbMiniPurple">{Number(row.month_ot || 0).toFixed(0)}h</span>
                          <span className="lbMini lbMiniGreen">{row.streak_count || 0}x</span>
                        </div>
                      </td>
                      <td>{row.days_present ?? 0}</td>
                      <td>
                        <span className="lbBonusCell">{Number(row.bonus_hours || 0).toFixed(0)}h</span>
                        {row.last_bonus_awarded_at ? (
                          <span className="lbLastAwardedInline">Last: {formatLastBonus(row.last_bonus_awarded_at)}</span>
                        ) : (
                          <span className="lbLastAwardedInline lbLastAwardedNone">Not awarded</span>
                        )}
                      </td>
                      <td>
                        <div className="lbTableActions">
                          <Link to={`/employees/${row.emp_code}/profile`} className="lbTableLink">Profile</Link>
                          <button type="button" className="lbGiveBonusBtn lbGiveBonusBtnSm" onClick={() => { setBonusOpen(bonusOpen === row.emp_code ? null : row.emp_code); setBonusVal(''); setBonusMsg('') }}>
                            Give Bonus
                          </button>
                        </div>
                      </td>
                    </tr>
                    {bonusOpen === row.emp_code && (
                      <tr className="lbBonusFormRow">
                        <td colSpan={7} className="lbBonusFormCell">
                          <BonusHistoryBlock bonusHistory={bonusHistory} loading={bonusHistoryLoading} />
                          <div className="lbBonusBar lbBonusBarInline">
                            <span className="lbBonusBarLabel">Award bonus to {row.name || row.emp_code}:</span>
                            <input type="number" className="lbBonusInput" placeholder="Hours" min="0" step="1" value={bonusVal} onChange={(e) => setBonusVal(e.target.value)} />
                            <button className="lbBonusSubmit" disabled={bonusLoading || !bonusVal} onClick={() => handleBonus(row.emp_code)}>
                              {bonusLoading ? '...' : 'Award'}
                            </button>
                            <button type="button" className="btn btn-secondary lbBonusCancel" onClick={() => { setBonusOpen(null); setBonusVal(''); setBonusMsg('') }}>Cancel</button>
                            {bonusMsg && <span className="lbBonusFeedback">{bonusMsg}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {list.length === 0 && <div className="lbEmpty"><p className="muted">No leaderboard entries yet. Rewards are calculated automatically from attendance.</p></div>}
    </div>
  )
}
