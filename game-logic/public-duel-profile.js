import {publicDisplayName, PUBLIC_NAME_VERSION} from './public-profile.js';
// Room/history snapshots may predate the privacy contract. Resolve current
// profiles where possible and never use stored username/displayName/winner.
export async function publicDuelPlayers(players, sql, viewerId, language='en') {
  let byId = null;
  if (sql && players.length) {
    const rows = await sql`
      SELECT p.id, p.data->'publicProfile'->>'nickname' AS nickname,
        a.profile->>'firstName' AS first_name
      FROM players p LEFT JOIN accounts a ON a.id = p.id
      WHERE p.id IN ${sql(players.map(player => player.userId))}
    `;
    byId = new Map(rows.map(row => [row.id, {nickname:row.nickname,firstName:row.first_name}]));
  }
  return players.map(player => ({
    publicNameVersion: PUBLIC_NAME_VERSION,
    displayName: publicDisplayName(byId ? byId.get(player.userId) : player.publicProfile, language),
    nameIsFallback: publicDisplayName(byId ? byId.get(player.userId) : player.publicProfile, language, null) === null,
    isSelf: !!viewerId && player.userId === viewerId,
    finished: !!player.finished,
    ready: !!player.ready,
    ...((player.finished || player.correctCount !== undefined) && player.score !== undefined ? {score:player.score} : {}),
    ...(player.correctCount !== undefined ? {correctCount:player.correctCount} : {}),
    ...(player.totalQuestions !== undefined ? {totalQuestions:player.totalQuestions} : {}),
  }));
}
export function publicDuelOutcome(players, publicPlayers) {
  const sorted = players.map((player,index)=>({score:player.score,index})).sort((a,b)=>b.score-a.score);
  const isTie = sorted.length>1 && sorted[0].score===sorted[1].score;
  const winnerIndex = sorted.length && !isTie ? sorted[0].index : null;
  return {isTie,winnerIndex,winner:winnerIndex===null?null:publicPlayers[winnerIndex].displayName};
}
