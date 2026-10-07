// Reject pre-privacy response/cache rows rather than interpreting their
// historical displayName or username as an approved public name.
export function publicLeaderboardName(entry, fallback = 'Player') {
  return entry?.publicNameVersion === 1 && !entry.nameIsFallback && typeof entry.displayName === 'string' && entry.displayName.trim()
    ? entry.displayName
    : fallback;
}
