import type { AgreementClause } from "@/store/services/compliance-api";

// Structured value shapes carried by SYSTEM clauses. The backend stores these as
// opaque JSON; the settlement engine reads them.
// Damage items are property-owned now (a flat charge per item, no depreciation).
export type DamageCatalogItem = { name: string; chargePaise: number };

// How an early exit inside the lock-in is charged.
export type LockInPenaltyType = "REMAINING_TERM" | "FIXED";

// The three standard deduction types; owners can add free-text custom ones,
// so a category is any string and the labels map only covers the presets.
export const STANDARD_DEDUCTIONS = ["DAMAGE", "UNPAID_DUES", "CLEANING"] as const;

export const DEDUCTION_CATEGORY_LABELS: Record<string, string> = {
  CLEANING: "cleaning",
  DAMAGE: "verified damage",
  UNPAID_DUES: "unpaid dues",
};

export function deductionLabel(category: string) {
  return DEDUCTION_CATEGORY_LABELS[category] ?? category.toLowerCase();
}

export function rupeesLabel(paise: number) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(paise / 100))}`;
}

export function lockInMonths(clause: AgreementClause): number {
  return Number(clause.value?.months ?? 0) || 0;
}

export function lockInPenaltyType(clause: AgreementClause): LockInPenaltyType {
  return clause.value?.penaltyType === "FIXED" ? "FIXED" : "REMAINING_TERM";
}

export function lockInPenaltyFixedPaise(clause: AgreementClause): number {
  return Number(clause.value?.penaltyFixedPaise ?? 0) || 0;
}

export function deductionCategories(clause: AgreementClause): string[] {
  const raw = clause.value?.categories;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

export function damageCatalogItems(clause: AgreementClause): DamageCatalogItem[] {
  const raw = clause.value?.items;
  if (!Array.isArray(raw)) {
    return [];
  }
  // Agreements frozen before the property-owned schedule stored items as
  // {name, costPaise, lifeMonths}; normalise so old snapshots never render NaN.
  return (raw as Array<{ name?: string; chargePaise?: number; costPaise?: number }>).map((item) => ({
    chargePaise: Number(item.chargePaise ?? item.costPaise ?? 0) || 0,
    name: String(item.name ?? ""),
  }));
}

export function exitPrerequisites(clause: AgreementClause): string[] {
  const raw = clause.value?.checklist;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

// Body text is what tenants read in the agreement, so every value edit
// regenerates it — value and prose can never drift apart.
export function withLockIn(
  clause: AgreementClause,
  months: number,
  penaltyType: LockInPenaltyType,
  penaltyFixedPaise: number,
): AgreementClause {
  const penaltyPhrase =
    penaltyType === "FIXED"
      ? `a fixed early-exit penalty of ${rupeesLabel(penaltyFixedPaise)}`
      : "rent for the remaining lock-in period as an early-exit penalty";
  return {
    ...clause,
    body:
      months > 0
        ? `Minimum stay (lock-in) of ${months} month${months === 1 ? "" : "s"}; ending the tenancy earlier incurs ${penaltyPhrase}.`
        : "No minimum lock-in: either party may end the tenancy with the required notice.",
    value: { months, penaltyFixedPaise, penaltyType },
  };
}

export function withDeductionCategories(clause: AgreementClause, categories: string[]): AgreementClause {
  const labels = categories.map(deductionLabel);
  return {
    ...clause,
    body:
      labels.length > 0
        ? `At move-out the deposit may be used only for ${joinNaturally(labels)}.`
        : "No deposit deductions are permitted at move-out.",
    value: { categories },
  };
}

export function withDamageCatalog(clause: AgreementClause, items: DamageCatalogItem[]): AgreementClause {
  return {
    ...clause,
    body:
      items.length > 0
        ? `Damage beyond normal wear is charged per the property's damage schedule (${items.length} item${items.length === 1 ? "" : "s"}).`
        : "No pre-agreed damage charges; any damage charge must be evidenced at move-out.",
    value: { items },
  };
}

export function withExitPrerequisites(clause: AgreementClause, checklist: string[]): AgreementClause {
  return {
    ...clause,
    body:
      checklist.length > 0
        ? `Before the deposit is settled: ${checklist.join(", ")}.`
        : "No exit prerequisites are required before the deposit is settled.",
    value: { checklist },
  };
}

function joinNaturally(parts: string[]) {
  if (parts.length <= 1) {
    return parts.join("");
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
