import { useState } from "react";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { ScrollView, Text, View } from "react-native";
import { CircleHelp, Info } from "lucide-react-native";

import { AnchoredDropdown, useDropdownTrigger } from "@/components/anchored-dropdown";
import { AnimatedPressable } from "@/components/animated-pressable";
import { ChevronDisc } from "@/components/chevron-disc";
import { DAMAGE_LEVELS, type DamageLevel } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The four damage levels (P1.9.a, user, 2026-10-29): NA, D1, D2, D3, D3 the
 * worst. The same for every item, on the move-in checklist and at move-out.
 *
 * <p>Fixed for the whole system (user, 2026-11-07). They were each property's own
 * words, edited on Exit policies, so one PG's D2 could mean another's D3. `name` is
 * the short line a dropdown shows, `description` the fuller explanation.
 */
export const DAMAGE_LEVEL_DEFINITIONS: readonly { level: DamageLevel; name: string; description: string }[] = [
  {
    description: "The item is as it was handed over. Everyday use that leaves no mark is not damage. It costs nothing.",
    level: "NA",
    name: "No damage",
  },
  {
    description: "Marks, stains, scuffs or a loose part. Cleaning or a small fix puts it right, and it still works as it should.",
    level: "D1",
    name: "Light wear",
  },
  {
    description: "Cracked, torn, dented or not working properly. It needs a repair before the next person can use it.",
    level: "D2",
    name: "Damaged",
  },
  {
    description: "It cannot be repaired, or it is gone. It has to be replaced. This is the most damage an item can have.",
    level: "D3",
    name: "Broken or missing",
  },
];

/** A level's short name, for a one-line row. */
export function damageLevelName(level: DamageLevel): string {
  return DAMAGE_LEVEL_DEFINITIONS.find((entry) => entry.level === level)?.name ?? "";
}

function useLevelTone() {
  const { colors } = useTheme();
  return (level: DamageLevel) =>
    level === "NA"
      ? { fill: colors.neutralSoft, ink: colors.muted }
      : level === "D1"
        ? { fill: colors.warningSoft, ink: colors.warningText }
        : level === "D2"
          ? { fill: colors.warning, ink: "#FFFFFF" }
          : { fill: colors.danger, ink: "#FFFFFF" };
}

/**
 * A level's box: tinted in the level's own colour and edged in it (user, 2026-11-07).
 * The words on it stay in ink, so a solid amber never carries white text.
 */
function useLevelBox() {
  const { colors } = useTheme();
  return (level: DamageLevel) =>
    level === "NA"
      ? { border: colors.borderStrong, fill: colors.neutralSoft }
      : level === "D1"
        ? { border: `${colors.warning}66`, fill: colors.warningSoft }
        : level === "D2"
          ? { border: colors.warning, fill: `${colors.warning}24` }
          : { border: colors.danger, fill: colors.dangerSoft };
}

/**
 * The level as a dropdown that opens in place, under the field, with an ⓘ
 * beside its label for what each level means (user, 2026-10-29).
 */
export function DamageLevelDropdown({
  inline = false,
  placeholder = "Pick a level",
  label = "Damage level",
  onChange,
  onHelp,
  options = DAMAGE_LEVELS,
  value,
}: {
  /** A ? that opens the caller's How it works sheet, in place of the ⓘ card (user, 2026-10-29: Record damage). */
  onHelp?: () => void;
  /** The field's one label, with its ⓘ (2026-10-29: a record's "New damage level"). */
  label?: string;
  onChange: (level: DamageLevel) => void;
  /** The levels to offer: a damage is D1 to D3, a repair goes below the damage. */
  options?: readonly DamageLevel[];
  /** Shown while nothing is picked (user, 2026-11-07: "Pick a level"). */
  placeholder?: string;
  /**
   * The list opens in the page under the field and pushes the rest down, rather than
   * floating over it (user, 2026-11-07: Record and Edit damage).
   */
  inline?: boolean;
  value: DamageLevel | null;
}) {
  const { colors, fonts, type } = useTheme();
  const tone = useLevelTone();
  const { close: closeFloating, open: openFloating, ref, trigger } = useDropdownTrigger();
  const [inlineOpen, setInlineOpen] = useState(false);
  const anchor = inline ? null : trigger;
  const expanded = inline ? inlineOpen : Boolean(trigger);
  const open = inline ? () => setInlineOpen((shown) => !shown) : openFloating;
  const close = inline ? () => setInlineOpen(false) : closeFloating;
  const words = damageLevelName;
  const list = options.map((level) => (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: level === value }}
      key={level}
      onPress={() => { onChange(level); close(); }}
      style={{
        alignItems: "center",
        backgroundColor: level === value ? colors.surfaceSunken : colors.surface,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View style={{ backgroundColor: tone(level).fill, borderRadius: 999, minWidth: 34, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
        <Text style={{ color: tone(level).ink, fontFamily: fonts.sansBold, fontSize: 11, textAlign: "center" }}>{level}</Text>
      </View>
      <Text numberOfLines={1} style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>{words(level)}</Text>
    </AnimatedPressable>
  ));

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
        {onHelp ? (
          <AnimatedPressable accessibilityLabel="What the damage levels mean" accessibilityRole="button" hitSlop={10} onPress={onHelp}>
            <CircleHelp color={colors.muted} size={16} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : (
          <DamageLevelInfo />
        )}
      </View>
      <View collapsable={false} ref={ref}>
        <AnimatedPressable
          accessibilityLabel={`${label} ${value ?? placeholder}`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={open}
          style={{
            alignItems: "center",
            borderColor: colors.borderStrong,
            borderRadius: radii.card,
            borderWidth: 1,
            flexDirection: "row",
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          {value ? (
            <>
              <DamageLevelPill level={value} />
              <Text numberOfLines={1} style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>{words(value)}</Text>
            </>
          ) : (
            <Text numberOfLines={1} style={{ color: colors.muted, flex: 1, fontFamily: fonts.sans, fontSize: 15, paddingVertical: 2 }}>{placeholder}</Text>
          )}
          <ChevronDisc direction={expanded ? "up" : "down"} />
        </AnimatedPressable>
      </View>
      {inline && inlineOpen ? (
        <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, overflow: "hidden" }}>
          {list}
        </View>
      ) : null}
      {anchor ? (
        <AnchoredDropdown onClose={close} trigger={anchor}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {list}
          </ScrollView>
        </AnchoredDropdown>
      ) : null}
    </View>
  );
}

/**
 * Every level and what it means, each in its own box in the level's colour (user,
 * 2026-11-07). On Exit policies and in the Damage levels sheet.
 */
export function DamageLevelBoxes() {
  const { colors, fonts, type } = useTheme();
  const box = useLevelBox();
  // One sheet, each level a band in its own colour, no gaps or lines between, compact (user, 2026-11-07).
  return (
    <View
      style={{
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      {DAMAGE_LEVEL_DEFINITIONS.map((entry) => (
        <View
          key={entry.level}
          style={{
            backgroundColor: box(entry.level).fill,
            gap: 3,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
            <DamageLevelPill level={entry.level} onTint={box(entry.level).border} />
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13.5, lineHeight: 18 }}>{entry.name}</Text>
          </View>
          <Text style={[type.caption, { color: colors.inkSoft, fontSize: 12, lineHeight: 17 }]}>{entry.description}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The Damage levels sheet: one point per level, marked by its pill, under its own title
 * (user, 2026-11-07: the coloured boxes stay on Exit policies, the sheet stays as it was).
 */
export function DamageLevelsSheet({ onClose }: { onClose: () => void }) {
  return (
    <HowItWorksSheet
      eyebrow="Damage levels"
      keepTitle
      markers={DAMAGE_LEVEL_DEFINITIONS.map((entry) => <DamageLevelPill key={entry.level} level={entry.level} />)}
      onClose={onClose}
      steps={DAMAGE_LEVEL_DEFINITIONS.map((entry) => ({ body: `${entry.name}. ${entry.description}`, title: entry.level }))}
      title="Damage levels"
    />
  );
}

/** An ⓘ that opens the Damage levels sheet. */
export function DamageLevelInfo() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <AnimatedPressable accessibilityLabel="What the damage levels mean" accessibilityRole="button" hitSlop={10} onPress={() => setOpen(true)}>
        <Info color={colors.muted} size={15} strokeWidth={2.2} />
      </AnimatedPressable>
      {open ? <DamageLevelsSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** A level as read back: a tinted label, no dot. */
export function DamageLevelPill({ level, onTint }: {
  level: DamageLevel;
  /**
   * The edge of the tinted box it sits on. NA and D1 are pale like their boxes, so
   * there they turn white with that edge, or they vanish into it (user, 2026-11-07).
   */
  onTint?: string;
}) {
  const { colors, fonts } = useTheme();
  const tone = useLevelTone();
  const pale = Boolean(onTint) && (level === "NA" || level === "D1");
  return (
    <View style={{
      backgroundColor: pale ? colors.surface : tone(level).fill,
      borderColor: pale ? onTint : "transparent",
      borderRadius: 999,
      borderWidth: 1,
      minWidth: 34,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
    }}>
      <Text style={{ color: tone(level).ink, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.4, textAlign: "center" }}>{level}</Text>
    </View>
  );
}
