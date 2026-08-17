import type { AgreementClause } from "@/store/services/compliance-api";

// Structured value shapes carried by SYSTEM clauses. The backend stores these as
// opaque JSON; the settlement engine reads them.
// Damage items are property-owned now (a flat charge per item, no depreciation).
export type DamageCatalogItem = { name: string; chargePaise: number };

// How an early exit inside the lock-in is charged.

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

/** Months of validity, or null for an indefinite agreement. */
export function validityMonths(clause: AgreementClause): number | null {
  // Legacy clauses carry "months". A signed agreement is frozen, so the old key
  // survives in it forever and every reader has to know both.
  const raw = clause.value?.validityMonths ?? clause.value?.months;
  const months = Number(raw ?? 0) || 0;
  return months > 0 ? months : null;
}

/** The owner's own words for what leaving early costs. Never computed. */
export function earlyExitRule(clause: AgreementClause): string {
  const raw = clause.value?.earlyExitRule;
  return typeof raw === "string" ? raw : "";
}

/** The longest term worth agreeing. Mirrors the server's CHECK constraint. */
export const MAX_VALIDITY_MONTHS = 12;

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
export function withValidity(
  clause: AgreementClause,
  months: number | null,
  rule: string,
): AgreementClause {
  const body =
    months != null
      ? `This agreement runs for ${months} month${months === 1 ? "" : "s"} from the start of the`
        + ` tenancy, and the tenancy ends with it.`
        + (rule.trim() ? ` If the tenancy ends earlier: ${rule.trim()}` : "")
      : "This agreement runs until the tenancy ends. Either party may end it with the required"
        + " notice.";

  return {
    ...clause,
    body,
    heading: "Agreement validity",
    value: { earlyExitRule: rule, validityMonths: months },
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
