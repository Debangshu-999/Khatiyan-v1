import type { PropertyDiscoveryCard } from "@/store/services/discovery-api";

import type { PropertyFilterState } from "./components/property-filter-modal";
import { humanizeToken } from "./discovery-format";

export type MatchStrength = "strong" | "moderate" | "weak";

export type FilterMatch = {
  // null when no attribute preferences are set (budget/location are hard filters
  // and are not counted as ranked preferences).
  strength: MatchStrength | null;
  matchedTags: string[];
  matchedCount: number;
  activeCount: number;
};

// Mirrors the backend's attribute-match counting so the card's matched tags and
// strength line up with how results are ranked server-side. Budget and location
// are hard filters and are intentionally excluded here.
export function computeFilterMatches(filters: PropertyFilterState, property: PropertyDiscoveryCard): FilterMatch {
  const tags: string[] = [];
  let active = 0;

  if (filters.pgFor && filters.pgFor !== "ANYONE") {
    active += 1;
    if (property.pgFor === filters.pgFor || property.pgFor === "ANYONE") {
      tags.push(`PG for ${humanizeToken(filters.pgFor)}`);
    }
  }

  if (filters.preferredFor && filters.preferredFor !== "ANYONE") {
    active += 1;
    if (property.preferredFor === filters.preferredFor || property.preferredFor === "ANYONE") {
      tags.push(humanizeToken(filters.preferredFor));
    }
  }

  if (filters.foodIncluded !== null) {
    active += 1;
    if (property.foodIncluded === filters.foodIncluded) {
      tags.push(filters.foodIncluded ? "Food included" : "No food");
    }
  }

  if (filters.mealTypes.length > 0) {
    active += 1;
    if (filters.mealTypes.every((meal) => property.includedMeals.includes(meal))) {
      tags.push(filters.mealTypes.map(humanizeToken).join(", "));
    }
  }

  if (filters.electricityIncluded !== null) {
    active += 1;
    if (property.electricityIncluded === filters.electricityIncluded) {
      tags.push(filters.electricityIncluded ? "Electricity included" : "Electricity extra");
    }
  }

  if (filters.bathroomType !== null) {
    active += 1;
    if (property.bathroomType === filters.bathroomType) {
      tags.push(`${humanizeToken(filters.bathroomType)} bathroom`);
    }
  }

  if (filters.sharingTypes.length > 0) {
    active += 1;
    const matched = filters.sharingTypes.filter((sharing) => property.availableSharingTypes.includes(sharing));
    if (matched.length > 0) {
      tags.push(`${matched.map(humanizeToken).join(", ")} sharing`);
    }
  }

  const matchedCount = tags.length;
  let strength: MatchStrength | null = null;
  if (active > 0) {
    const ratio = matchedCount / active;
    strength = ratio >= 1 ? "strong" : ratio >= 0.5 ? "moderate" : "weak";
  }

  return { activeCount: active, matchedCount, matchedTags: tags, strength };
}
