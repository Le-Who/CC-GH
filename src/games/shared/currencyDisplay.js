const formatters = Object.fromEntries(["en", "ru"].map((language) => [language, {
  compact: new Intl.NumberFormat(language, { notation: "compact", compactDisplay: "short", maximumFractionDigits: 0 }),
  exact: new Intl.NumberFormat(language, { maximumFractionDigits: 0 }),
}]));

// The visible HUD has a bounded lane. Keep every digit in the accessible name,
// and use localized compact units for large balances rather than ellipsis.
export function formatYardCurrencyBalance(value, language = "en") {
  const amount = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const formatter = formatters[language] || formatters.en;
  return {
    compact: amount < 10000 ? String(amount) : formatter.compact.format(amount),
    exact: formatter.exact.format(amount),
  };
}
