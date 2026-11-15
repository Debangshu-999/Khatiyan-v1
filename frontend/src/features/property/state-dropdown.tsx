import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SearchField } from "@/components/search-field";
import { SheetShell } from "@/components/sheet-shell";
import { RequiredMark } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { INDIAN_STATES, type IndianState } from "./indian-states";

/**
 * The property's State, chosen from India's states and union territories (user,
 * 2026-11-08). The field looks like the FormInput beside it (City), with no
 * chevron (user, 2026-11-08). It opens a
 * bottom sheet whose search sits under the title line and stays put while the
 * list scrolls under it.
 */
export function StateDropdown({
  error,
  onChange,
  value,
}: {
  error?: string;
  onChange: (state: IndianState) => void;
  value: IndianState | null;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? INDIAN_STATES.filter((state) => state.toLowerCase().includes(needle)) : INDIAN_STATES;
  }, [query]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={[type.label, { color: error ? colors.danger : colors.muted }]}>
        State
        <RequiredMark required />
      </Text>
      <AnimatedPressable
        accessibilityLabel={`State: ${value ?? "not chosen"}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: error ? colors.danger : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 14,
          borderWidth: 1.5,
          flexDirection: "row",
          minHeight: 50,
          paddingLeft: spacing.md,
          paddingRight: spacing.md,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: value ? colors.ink : colors.kicker, flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 }}
        >
          {value ?? "State"}
        </Text>
      </AnimatedPressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[type.caption, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      {open ? (
        <SheetShell
          belowRule={<SearchField onChangeText={setQuery} placeholder="Search states" value={query} />}
          onClose={close}
          size="tall"
          title="Choose state"
        >
          {shown.length ? (
            shown.map((state) => (
              <PickerOptionRow
                key={state}
                label={state}
                onPress={() => {
                  onChange(state);
                  close();
                }}
                selected={state === value}
              />
            ))
          ) : (
            <EmptyState compact description="Check the spelling, or clear the search." title="No state matches" />
          )}
        </SheetShell>
      ) : null}
    </View>
  );
}
