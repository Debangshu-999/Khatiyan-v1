// Money and number formatting for analytics. No imports on purpose: node --test
// runs this file directly, and Expo's tsconfig cannot import a ".ts" path while
// Node cannot resolve one without it.

export function groupIndian(value: number): string {
  const digits = String(Math.trunc(Math.abs(value)));
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const pairs: string[] = [];
  while (rest.length > 2) {
    pairs.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) pairs.unshift(rest);
  return `${pairs.join(",")},${last3}`;
}

/** Rounds the size, not the signed value: Math.round(-1500.5) is -1500, so a refund would round differently from a charge. */
export function formatPaise(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  return `${paise < 0 && rupees > 0 ? "-" : ""}₹${groupIndian(rupees)}`;
}

function trimDecimals(value: number): string {
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/** ₹3.42L, ₹75K, ₹1.5Cr. For donut centres and tight axis labels only. */
export function compactPaise(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trimDecimals(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trimDecimals(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trimDecimals(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

/** Whole percent, or null when there is nothing to divide by. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part * 100) / whole) : null;
}

export function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) * 100) / previous) : null;
}

function oneDecimal(value: number): string {
  return value < 10 ? trimDecimals(Math.round(value * 10) / 10) : String(Math.round(value));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${oneDecimal(hours)} h`;
  const days = hours / 24;
  return `${oneDecimal(days)} ${days === 1 ? "day" : "days"}`;
}

/** How long someone has stayed: days under two months, then months, then years. */
export function formatStayLength(days: number): string {
  if (days < 60) return `${Math.round(days)} ${Math.round(days) === 1 ? "day" : "days"}`;
  if (days < 730) return `${oneDecimal(days / 30.44)} months`;
  return `${oneDecimal(days / 365.25)} years`;
}
