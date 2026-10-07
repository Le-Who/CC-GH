// Public names are explicit choices or Telegram first names. Historical
// username/displayName fields are intentionally never used as a fallback.
export const PUBLIC_NAME_VERSION = 1;
export const NICKNAME_MAX_LENGTH = 32;
// ZWJ/ZWNJ are legitimate in emoji and writing systems; other format/control
// characters (including bidi overrides) are excluded.
const hasControls = value => /[\p{Cc}\p{Cf}]/u.test(value.replace(/[\u200C\u200D]/g, ''));
const hasVisibleName = value => !!value.replace(/[\s\u200C\u200D\uFE0E\uFE0F]/gu, '');

export function validateNickname(value) {
  if (typeof value !== 'string' || hasControls(value)) {
    return { error: 'INVALID_NICKNAME' };
  }
  const nickname = value.normalize('NFC').trim();
  if ((nickname && !hasVisibleName(nickname)) || [...nickname].length > NICKNAME_MAX_LENGTH) return { error: 'INVALID_NICKNAME' };
  return { nickname: nickname || null };
}

export function publicDisplayName(profile = {}, language = 'en', fallback = language === 'ru' ? 'Игрок' : 'Player') {
  const {nickname, firstName} = profile || {};
  const chosen = validateNickname(nickname);
  if (!chosen.error && chosen.nickname) return chosen.nickname;
  if (typeof firstName === 'string' && !hasControls(firstName)) {
    const name = firstName.normalize('NFC').trim();
    if (hasVisibleName(name)) return [...name].slice(0, 64).join('');
  }
  return fallback;
}

// A strict allowlist also sanitizes old cache/snapshot rows. Never spread them.
export function publicLeaderboardEntry(row, rank, viewerId, language = 'en', game = 'match3') {
  return {
    rank,
    publicNameVersion: PUBLIC_NAME_VERSION,
    displayName: publicDisplayName(row, language),
    nameIsFallback: publicDisplayName(row, language, null) === null,
    highScore: row.high_score,
    ...(game === 'match3' ? { totalGames: row.total_games } : {}),
    isSelf: !!viewerId && row.id === viewerId,
  };
}
