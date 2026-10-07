import { publicLeaderboardName } from "./publicLeaderboardName.js";
import { useAppI18n } from "./i18n.jsx";
export function Leaderboard({ entries }) {
  const { t } = useAppI18n();
  return (
    <div className="leaderboard">
      <strong>{t("common.leaderboard")}</strong>
      {entries?.length ? entries.slice(0, 8).map((entry) => (
        <div key={entry.rank} aria-current={entry.isSelf ? "true" : undefined}>
          <span>#{entry.rank} {publicLeaderboardName(entry, t("app.player"))}{entry.isSelf ? ` (${t("common.you")})` : ""}</span>
          <strong>{entry.highScore}</strong>
        </div>
      )) : <span className="empty-state">{t("common.noScores")}</span>}
    </div>
  );
}


