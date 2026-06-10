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
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
