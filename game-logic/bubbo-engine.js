export const BUBBO_POWERUP_CHARGES = {
  bomb: 3,
  rainbow: 2,
  lightning: 2,
};

export function normalizeBubboPowerups(raw = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(Object.entries(BUBBO_POWERUP_CHARGES).map(([key, max]) => {
    const value = Math.floor(Number(source[key]));
    if (!Number.isFinite(value)) return [key, max];
    return [key, Math.max(0, Math.min(max, value))];
  }));
}
