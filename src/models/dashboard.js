const { getDb } = require('../db');

/**
 * Get the project-level dashboard stats.
 *
 * @param {number} projectId
 * @param {number} userId
 * @returns {object} { averageRank, topKeywords, trendingUp, trendingDown, biggestMovers }
 */
function getDashboard(projectId, userId) {
  const db = getDb();

  // Verify ownership
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
  if (!project) return null;

  // ── Average rank across all keywords in the project ──
  const avgRow = db.prepare(`
    SELECT AVG(rc.position) AS avg_rank
    FROM keywords k
    JOIN (
      SELECT keyword_id, position
      FROM rank_checks
      WHERE id IN (SELECT MAX(id) FROM rank_checks GROUP BY keyword_id)
    ) rc ON rc.keyword_id = k.id
    WHERE k.project_id = ?
  `).get(projectId);

  // ── Latest rank per keyword with keyword details ──
  const keywordsWithLatest = db.prepare(`
    SELECT k.id, k.keyword, k.search_engine, rc.position AS last_rank
    FROM keywords k
    LEFT JOIN (
      SELECT keyword_id, position
      FROM rank_checks
      WHERE id IN (SELECT MAX(id) FROM rank_checks GROUP BY keyword_id)
    ) rc ON rc.keyword_id = k.id
    WHERE k.project_id = ?
    ORDER BY rc.position ASC NULLS LAST
  `).all(projectId);

  // ── Rank checks from the last 7 days to compute trends ──
  const recentRankChecks = db.prepare(`
    SELECT rc.keyword_id, k.keyword, k.search_engine,
           rc.position, rc.checked_at
    FROM rank_checks rc
    JOIN keywords k ON k.id = rc.keyword_id
    WHERE k.project_id = ? AND rc.checked_at >= datetime('now', '-7 days')
    ORDER BY rc.keyword_id, rc.checked_at ASC
  `).all(projectId);

  // Compute per-keyword: first position this week and last position this week
  const keywordTrends = {};
  for (const c of recentRankChecks) {
    const kid = c.keyword_id;
    if (!keywordTrends[kid]) {
      keywordTrends[kid] = {
        keyword: c.keyword,
        search_engine: c.search_engine,
        firstPos: c.position,
        lastPos: c.position,
      };
    } else {
      keywordTrends[kid].lastPos = c.position;
    }
  }

  // Classify trends
  const trendingUp = [];   // improving = position decreasing (lower is better)
  const trendingDown = []; // declining = position increasing
  const biggestMovers = [];

  for (const [kid, trend] of Object.entries(keywordTrends)) {
    if (trend.firstPos === null || trend.lastPos === null) continue;
    const change = trend.lastPos - trend.firstPos;

    // biggest movers — by absolute change
    biggestMovers.push({
      keyword_id: Number(kid),
      keyword: trend.keyword,
      search_engine: trend.search_engine,
      first_pos: trend.firstPos,
      last_pos: trend.lastPos,
      change,
      abs_change: Math.abs(change),
    });

    if (change < 0) {
      // negative change = position dropped = improved rank
      trendingUp.push({
        keyword_id: Number(kid),
        keyword: trend.keyword,
        search_engine: trend.search_engine,
        from: trend.firstPos,
        to: trend.lastPos,
        improvement: Math.abs(change),
      });
    } else if (change > 0) {
      trendingDown.push({
        keyword_id: Number(kid),
        keyword: trend.keyword,
        search_engine: trend.search_engine,
        from: trend.firstPos,
        to: trend.lastPos,
        decline: change,
      });
    }
  }

  // Sort: trending up by improvement (biggest first), trending down by decline
  trendingUp.sort((a, b) => b.improvement - a.improvement);
  trendingDown.sort((a, b) => b.decline - a.decline);
  biggestMovers.sort((a, b) => b.abs_change - a.abs_change);

  return {
    project_id: projectId,
    averageRank: avgRow && avgRow.avg_rank !== null
      ? Math.round(avgRow.avg_rank * 100) / 100
      : null,
    totalKeywords: keywordsWithLatest.length,
    trackedKeywords: keywordsWithLatest.filter(k => k.last_rank !== null).length,
    trendingUp: trendingUp.slice(0, 10),
    trendingDown: trendingDown.slice(0, 10),
    biggestMovers: biggestMovers.slice(0, 10),
  };
}

module.exports = { getDashboard };