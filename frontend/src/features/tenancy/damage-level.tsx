import { useRef, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Info } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { ChevronDisc } from "@/components/chevron-disc";
import { DAMAGE_LEVELS, type DamageLevel } from "@/store/services/property-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The four damage levels (P1.9.a, user, 2026-10-29): NA, D1, D2, D3, D3 the
 * worst. The same for every item, on the move-in checklist and at move-out.
 * What each means is the property's own words, from Exit policies.
 */
export type DamageLevelWords = { level: DamageLevel; description: string }[];

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

type Anchor = { left: number; top: number; width: number };

/** Where a floating card opens: under its trigger, kept on screen. */
function useAnchor(cardWidth?: number) {
  const { width } = useWindowDimensions();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, w, h) => {
    const cardW = Math.min(cardWidth ?? w, width - 32);
    setAnchor({ left: Math.max(16, Math.min(x, width - cardW - 16)), top: y + h + 6, width: cardW });
  });
  return { anchor, close: () => setAnchor(null), open, ref };
}

/**
 * The level as a dropdown that opens in place, under the field, with an ⓘ
 * beside its label for what each level means (user, 2026-10-29).
 */
export function DamageLevelDropdown({
  levels,
  onChange,
  value,
}: {
  levels: DamageLevelWords;
  onChange: (level: DamageLevel) => void;
  value: DamageLevel;
}) {
  const { colors, fonts, type } = useTheme();
  const tone = useLevelTone();
  const { anchor, close, open, ref } = useAnchor();
  const words = (level: DamageLevel) => levels.find((entry) => entry.level === level)?.description ?? "";

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text style={[type.label, { color: colors.muted }]}>Damage level</Text>
        <DamageLevelInfo levels={levels} />
      </View>
      <View collapsable={false} ref={ref}>
        <AnimatedPressable
          accessibilityLabel={`Damage level ${value}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: Boolean(anchor) }}
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
          <DamageLevelPill level={value} />
          <Text numberOfLines={1} style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>{words(value)}</Text>
          <ChevronDisc direction={anchor ? "up" : "down"} />
        </AnimatedPressable>
      </View>
      {anchor ? (
        <Modal animationType="fade" onRequestClose={close} transparent visible>
          <Pressable onPress={close} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderRadius: radii.card,
              borderWidth: 1,
              elevation: 8,
              left: anchor.left,
              overflow: "hidden",
              position: "absolute",
              top: anchor.top,
              width: anchor.width,
            }}
          >
            {DAMAGE_LEVELS.map((level) => (
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
            ))}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** An ⓘ that opens a floating card: every level and what it means here. */
export function DamageLevelInfo({ levels }: { levels: DamageLevelWords }) {
  const { colors, fonts, type } = useTheme();
  const { anchor, close, open, ref } = useAnchor(300);
  return (
    <>
      <View collapsable={false} ref={ref}>
        <AnimatedPressable accessibilityLabel="What the damage levels mean" accessibilityRole="button" hitSlop={10} onPress={open}>
          <Info color={colors.muted} size={15} strokeWidth={2.2} />
        </AnimatedPressable>
      </View>
      {anchor ? (
        <Modal animationType="fade" onRequestClose={close} transparent visible>
          <Pressable onPress={close} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.card,
              borderWidth: 1,
              elevation: 8,
              gap: spacing.sm,
              left: anchor.left,
              padding: spacing.md,
              position: "absolute",
              shadowColor: "#000",
              shadowOffset: { height: 4, width: 0 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              top: anchor.top,
              width: anchor.width,
            }}
          >
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>Damage levels</Text>
            {levels.map((entry) => (
              <View key={entry.level} style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm }}>
                <DamageLevelPill level={entry.level} />
                <Text style={[type.caption, { color: colors.inkSoft, flex: 1 }]}>{entry.description}</Text>
              </View>
            ))}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

/** A level as read back: a tinted label, no dot. */
export function DamageLevelPill({ level }: { level: DamageLevel }) {
  const { fonts } = useTheme();
  const tone = useLevelTone();
  return (
    <View style={{ backgroundColor: tone(level).fill, borderRadius: 999, minWidth: 34, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <Text style={{ color: tone(level).ink, fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.4, textAlign: "center" }}>{level}</Text>
    </View>
  );
}
