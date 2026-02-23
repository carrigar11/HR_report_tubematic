import { useState, useEffect } from 'react'
import { employee } from '../../api'
import './MyRewards.css'

export default function MyRewards() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    employee.rewards()
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="myRewardsLoading">Loading…</p>
  if (!data) return <p className="myRewardsError">Failed to load rewards.</p>

  const rewards = data.rewards || []
  const myRank = data.my_rank_this_month
  const totalBoard = data.total_on_leaderboard_this_month

  return (
    <div className="myRewardsPage">
      <h2 className="myRewardsTitle">My rewards and recognition</h2>

      {(myRank != null || (totalBoard && totalBoard > 0)) && (
        <div className="myRewardsRankCard card">
          <h3 className="myRewardsSectionTitle">This month</h3>
          {myRank != null ? (
            <p className="myRewardsRankText">
              Your rank on the leaderboard: <strong>#{myRank}</strong>
              {totalBoard != null && <span className="muted"> (of {totalBoard} on board)</span>}
            </p>
          ) : (
            <p className="muted">You are not on the leaderboard this month. Keep going!</p>
          )}
        </div>
      )}

      <section className="myRewardsListSection card">
        <h3 className="myRewardsSectionTitle">My rewards history</h3>
        {rewards.length === 0 ? (
          <p className="muted">No rewards yet.</p>
        ) : (
          <ul className="myRewardsList">
            {rewards.map((r) => (
              <li key={r.id} className="myRewardsItem">
                <span className="myRewardsItemReason">{r.trigger_reason || r.entry_type}</span>
                <span className="myRewardsItemMeta">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                  {r.is_on_leaderboard && <span className="myRewardsBadge">Leaderboard</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
