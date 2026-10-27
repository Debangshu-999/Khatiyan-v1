import { useState } from "react";
import { Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { ActionButton } from "@/features/owner/owner-ui";
import type { LeadCounts } from "@/store/services/lead-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * What the Leads screen's filter narrows to (user's design, 2026-10-17).
 *
 * <p>Any filter looks across every stage, and no tab is filled while one is
 * on (user, 2026-10-17). "Ended" asks for the leads that are over instead.
 * Picking a tab clears every filter.
 */
export type LeadFilters = {
  goingCold: boolean;
  mine: boolean;
  resumed: boolean;
  duplicates: boolean;
  potentialSpam: boolean;
  dead: boolean;
  lost: boolean;
};

export const NO_LEAD_FILTERS: LeadFilters = {
  goingCold: false,
  mine: false,
  resumed: false,
  duplicates: false,
  potentialSpam: false,
  dead: false,
  lost: false,
};

/** How many are ticked: the dot on the filter button. */
export function activeFilterCount(filters: LeadFilters) {
  return Object.values(filters).filter(Boolean).length;
}

/** The ended leads are asked for in place of the tab's kind. */
export function showsEnded(filters: LeadFilters) {
  return filters.dead || filters.lost;
}

const NARROW: { key: keyof LeadFilters; label: string }[] = [
  { key: "goingCold", label: "Going cold" },
  { key: "mine", label: "Handled by me" },
  { key: "resumed", label: "Came back" },
  { key: "duplicates", label: "Duplicates" },
  { key: "potentialSpam", label: "Potential spam" },
];

export function LeadFilterSheet({
  counts,
  filters,
  onApply,
  onClose,
}: {
  counts: LeadCounts | undefined;
  filters: LeadFilters;
  onApply: (filters: LeadFilters) => void;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  const [draft, setDraft] = useState(filters);
  const toggle = (key: keyof LeadFilters) => setDraft((current) => ({ ...current, [key]: !current[key] }));

  return <SheetShell onClose={onClose} title="Filter leads">
    <View style={{ gap: spacing.md }}>
      <View>
        <Text style={[type.description, { color: colors.muted }]}>Show only</Text>
        {NARROW.map((option) => <FilterRow key={option.key} label={option.label} on={draft[option.key]} onPress={() => toggle(option.key)} />)}
      </View>
      <View>
        <Text style={[type.description, { color: colors.muted }]}>Ended</Text>
        <FilterRow count={counts?.dead} label="Dead leads" on={draft.dead} onPress={() => toggle("dead")} />
        <FilterRow count={counts?.lostEnquiries} label="Lost enquiries" on={draft.lost} onPress={() => toggle("lost")} />
      </View>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {/* Clear takes effect at once and closes the sheet: clearing and then closing it must not leave the
            list filtered (user, 2026-10-17). */}
        <ActionButton label="Clear" onPress={() => onApply(NO_LEAD_FILTERS)} variant="secondary" />
        <ActionButton label="Show leads" onPress={() => onApply(draft)} />
      </View>
    </View>
  </SheetShell>;
}

function FilterRow({ count, label, on, onPress }: { count?: number; label: string; on: boolean; onPress: () => void }) {
  const { colors, type } = useTheme();
  return <AnimatedPressable
    accessibilityRole="checkbox"
    accessibilityState={{ checked: on }}
    onPress={onPress}
    style={{ alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm + 2 }}
  >
    <View style={{
      alignItems: "center",
      backgroundColor: on ? colors.primary : colors.surface,
      borderColor: on ? colors.primary : colors.borderStrong,
      borderRadius: radii.sm,
      borderWidth: 1.5,
      height: 20,
      justifyContent: "center",
      width: 20,
    }}>
      {on ? <Check color={colors.onPrimary} size={14} strokeWidth={3} /> : null}
    </View>
    <Text style={[type.body, { color: colors.ink, flex: 1 }]}>{label}</Text>
    {count != null ? <Text style={[type.description, { color: colors.muted }]}>{count}</Text> : null}
  </AnimatedPressable>;
}
