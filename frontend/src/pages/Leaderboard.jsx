import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { leaderboard, giveBonus } from '../api'
import './Table.css'
import './Leaderboard.css'

function rankMedal(i) {
  if (i === 0) return { emoji: '\u{1F947}', cls: 'lbMedal1' }
  if (i === 1) return { emoji: '\u{1F948}', cls: 'lbMedal2' }
  if (i === 2) return { emoji: '\u{1F949}', cls: 'lbMedal3' }
  return { emoji: '', cls: '' }
}

export default function Leaderboard() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [bonusOpen, setBonusOpen] = useState(null)
  const [bonusVal, setBonusVal] = useState('')
  const [bonusLoading, setBonusLoading] = useState(false)
  const [bonusMsg, setBonusMsg] = useState('')

  const fetchData = useCallback(() => {
    setLoading(true)
    leaderboard()
      .then((r) => setList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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

  if (loading) return <div className="pageContent"><p className="muted">Loading...</p></div>

  return (
    <div className="pageContent lbPage">
      {/* Header */}
      <div className="lbHeader">
        <h2 className="lbTitle">Leaderboard</h2>
        <span className="lbSubtitle">Top performing employees this month</span>
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
                <div className="lbPodiumActions">
                  <Link to={`/employees/${row.emp_code}/profile`} className="lbCardBtn lbCardBtnView">View Profile</Link>
                  <button className="lbCardBtn lbCardBtnBonus" onClick={() => { setBonusOpen(bonusOpen === row.emp_code ? null : row.emp_code); setBonusVal(''); setBonusMsg('') }}>
                    Give Bonus
                  </button>
                </div>
                {bonusOpen === row.emp_code && (
                  <div className="lbBonusBar">
                    <input type="number" className="lbBonusInput" placeholder="Hours" min="0" step="1" value={bonusVal} onChange={(e) => setBonusVal(e.target.value)} />
                    <button className="lbBonusSubmit" disabled={bonusLoading || !bonusVal} onClick={() => handleBonus(row.emp_code)}>
                      {bonusLoading ? '...' : 'Award'}
                    </button>
                    {bonusMsg && <span className="lbBonusFeedback">{bonusMsg}</span>}
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
                  <tr key={row.emp_code}>
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
                    <td>{Number(row.bonus_hours || 0).toFixed(0)}h</td>
                    <td>
                      <Link to={`/employees/${row.emp_code}/profile`} className="lbTableLink">Profile</Link>
                    </td>
                  </tr>
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
