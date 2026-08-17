export function formatMoneyPaise(amountPaise?: number | null) {
  if (amountPaise === null || amountPaise === undefined) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amountPaise / 100);
}

export function formatDistance(distanceKm?: number | null) {
  if (distanceKm === null || distanceKm === undefined) {
    return "Distance unavailable";
  }

  if (distanceKm < 1) {
    return `${Math.max(Math.round(distanceKm * 1000), 1)} m away`;
  }

  return `${distanceKm.toFixed(1)} km away`;
}

export function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    // Acronyms would otherwise come back title-cased — "PG" as "Pg", "AC" as
    // "Ac" — which reads as a typo in the middle of an otherwise tidy label.
    .map((part) => (ACRONYMS.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

const ACRONYMS = new Set(["ac", "pg"]);

/**
 * A deposit amount as a person would say it.
 *
 * <p>Zero is a real answer — plenty of PGs take none — but "₹0" reads as a
 * missing value or a bug. Saying so in words is the difference between "we ask
 * for nothing" and "we forgot to fill this in".
 */
export function formatDepositPaise(paise: number | null | undefined) {
  if (paise == null || paise <= 0) {
    return "No deposit";
  }
  return formatMoneyPaise(paise);
}
