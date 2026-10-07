// Public names are explicit choices or Telegram first names. Historical
// username/displayName fields are intentionally never used as a fallback.
export const PUBLIC_NAME_VERSION = 1;
export const NICKNAME_MAX_LENGTH = 32;
const CONTROLS = /[\p{Cc}\p{Cf}]/u;

export function validateNickname(value) {
  if (typeof value !== 'string' || CONTROLS.test(value)) {
    return { error: 'INVALID_NICKNAME' };
  }
  const nickname = value.normalize('NFC').trim();
  if ([...nickname].length > NICKNAME_MAX_LENGTH) return { error: 'INVALID_NICKNAME' };
  return { nickname: nickname || null };
}

export function publicDisplayName({ nickname, firstName } = {}, language = 'en') {
  const chosen = validateNickname(nickname);
  if (!chosen.error && chosen.nickname) return chosen.nickname;
  if (typeof firstName === 'string' && !CONTROLS.test(firstName)) {
    const name = firstName.normalize('NFC').trim();
    if (name) return [...name].slice(0, 64).join('');
  }
  return language === 'ru' ? 'Игрок' : 'Player';
}

// A strict allowlist also sanitizes old cache/snapshot rows. Never spread them.
export function publicLeaderboardEntry(row, rank, viewerId, language = 'en', game = 'match3') {
  return {
    rank,
    publicNameVersion: PUBLIC_NAME_VERSION,
    displayName: publicDisplayName(row, language),
    highScore: row.high_score,
    ...(game === 'match3' ? { totalGames: row.total_games } : {}),
    isSelf: !!viewerId && row.id === viewerId,
  };
}
