import type { ComponentType } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Bath,
  GraduationCap,
  Mars,
  UsersRound,
  UtensilsCrossed,
  Venus,
  Zap,
  type LucideProps,
} from "lucide-react-native";

import { ChoiceGrid, ChoiceSection, MultiChoiceGrid } from "@/components/choice-section";
import { humanizeToken } from "@/features/owner/owner-ui";
import {
  BATHROOM_TYPES,
  MEAL_TYPES,
  PG_FOR_OPTIONS,
  PREFERRED_TENANT_OPTIONS,
  type BathroomType,
  type MealType,
  type PgFor,
  type PreferredTenantType,
} from "@/store/services/property-api";

/**
 * A person waving, for visitors.
 *
 * <p>Lucide has no waving figure, so this borrows Material's and takes the same
 * props the other section icons do. Stroke width has no meaning for a filled
 * glyph and is ignored.
 */
function WavingPerson({ color, size }: LucideProps) {
  return <MaterialCommunityIcons color={color} name="human-greeting" size={Number(size ?? 24)} />;
}

/** The discovery filter's glyphs for these choices. Anyone is left as a word. */
const PG_FOR_ICONS: Partial<Record<PgFor, ComponentType<LucideProps>>> = {
  FEMALE: Venus,
  MALE: Mars,
};

const YES_NO = ["YES", "NO"] as const;

/**
 * Who a property is for and what comes with a stay, as registration and the
 * editor both ask it.
 *
 * <p>One component for both screens, so creating a property and editing it can
 * never drift apart — and in the same sections the discovery filter sheet uses,
 * so an owner declares these in the control a searcher filters them with.
 *
 * <p>No "Any" where the filter has one only to mean "no filter": a property's
 * electricity, bathroom and visitor rule are one thing or the other. "Anyone"
 * stays where it is a real answer.
 */
export function StayChoiceSections({
  bathroomType,
  electricityIncluded,
  includedMeals,
  onBathroomType,
  onElectricityIncluded,
  onPgFor,
  onPreferredFor,
  onToggleMeal,
  onVisitorsAllowed,
  pgFor,
  preferredFor,
  visitorsAllowed,
}: {
  bathroomType: BathroomType;
  electricityIncluded: boolean;
  includedMeals: MealType[];
  onBathroomType: (value: BathroomType) => void;
  onElectricityIncluded: (value: boolean) => void;
  onPgFor: (value: PgFor) => void;
  onPreferredFor: (value: PreferredTenantType) => void;
  onToggleMeal: (meal: MealType) => void;
  onVisitorsAllowed: (value: boolean) => void;
  pgFor: PgFor;
  preferredFor: PreferredTenantType;
  /** Null until the owner answers, so nothing is selected rather than a guess. */
  visitorsAllowed: boolean | null;
}) {
  return (
    <>
      <ChoiceSection description="Who can stay at this property?" icon={UsersRound} title="PG/Hostel for">
        <ChoiceGrid
          getIcon={(option) => PG_FOR_ICONS[option]}
          getLabel={humanizeToken}
          onSelect={onPgFor}
          options={PG_FOR_OPTIONS}
          selected={pgFor}
        />
      </ChoiceSection>

      <ChoiceSection description="Who is this property suitable for?" icon={GraduationCap} title="Preferred for">
        <ChoiceGrid
          getLabel={(option) => (option === "PROFESSIONAL" ? "Working" : humanizeToken(option))}
          onSelect={onPreferredFor}
          options={PREFERRED_TENANT_OPTIONS}
          selected={preferredFor}
        />
      </ChoiceSection>

      {/* None ticked is how a property says food is not included — the same
          reading the filter gives an empty selection. */}
      <ChoiceSection
        description="Which meals are included in the rent?"
        footnote="Leave all unselected if no meals are included."
        icon={UtensilsCrossed}
        title="Meals included"
      >
        <MultiChoiceGrid getLabel={humanizeToken} onToggle={onToggleMeal} options={MEAL_TYPES} selected={includedMeals} />
      </ChoiceSection>

      <ChoiceSection description="Is electricity included in the rent?" icon={Zap} title="Electricity included">
        <ChoiceGrid
          getLabel={(option) => (option === "YES" ? "Yes" : "No")}
          onSelect={(option) => onElectricityIncluded(option === "YES")}
          options={YES_NO}
          selected={electricityIncluded ? "YES" : "NO"}
        />
      </ChoiceSection>

      <ChoiceSection description="Choose the bathroom arrangement" icon={Bath} title="Bathroom type">
        <ChoiceGrid getLabel={humanizeToken} onSelect={onBathroomType} options={BATHROOM_TYPES} selected={bathroomType} />
      </ChoiceSection>

      <ChoiceSection description="Can tenants have visitors?" icon={WavingPerson} title="Visitors">
        <ChoiceGrid
          getLabel={(option) => (option === "YES" ? "Allowed" : "Not allowed")}
          onSelect={(option) => onVisitorsAllowed(option === "YES")}
          options={YES_NO}
          selected={visitorsAllowed == null ? null : visitorsAllowed ? "YES" : "NO"}
        />
      </ChoiceSection>
    </>
  );
}
