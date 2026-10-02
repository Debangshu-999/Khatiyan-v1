import { useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { ChevronDown, Info } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { InfoModal } from "@/components/info-modal";
import { GhostText, useIsSkeleton } from "@/components/skeleton-boundary";
import { Skeleton } from "@/components/skeletons/primitives";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type MetricStatus = "OK" | "TOO_FEW" | "NO_DATA" | "UNAVAILABLE";

/** A division inside a formula, drawn as a fraction: top over bottom with a rule between. */
export type FormulaFraction = { over: [string, string] };

/**
 * One formula in a card's ⓘ modal, read left to right, e.g.
 * {@code ["Profit margin", "=", { over: ["Profit", "Income"] }, "× 100"]}, with
 * an optional plain-words note beneath it.
 */
export type InfoFormula = { formula: (string | FormulaFraction)[]; note?: string };

/** A line of a card's ⓘ modal: plain text ("Term: meaning" or a lead sentence), or a formula. */
export type InfoPoint = string | InfoFormula;

/**
 * The shell every analytics card shares: title, the ⓘ points, one optional
 * control, and the four states a metric can be in. Inside a SkeletonBoundary
 * the body becomes one block, so no sample figure can leak into a loading screen.
 */
export function ChartCard({
  caption,
  children,
  emptyText = "No data for this period",
  footnote,
  info,
  onRetry,
  sampleSize,
  status,
  title,
  tooFewText,
  trailing,
}: {
  /**
   * One muted line under the title, e.g. the period a card follows. For screens
   * grouped by topic, where the section title no longer names the period.
   */
  caption?: string;
  children: ReactNode;
  emptyText?: string;
  footnote?: string | null;
  info?: InfoPoint[];
  onRetry?: () => void;
  sampleSize: number;
  status: MetricStatus;
  title: string;
  tooFewText?: string;
  trailing?: ReactNode;
}) {
  const { colors, fonts, type } = useTheme();
  const skeleton = useIsSkeleton();
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, minHeight: 24 }}>
        <GhostText ghostWidth="45%" style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
          {title}
        </GhostText>
        {info && !skeleton ? (
          <AnimatedPressable accessibilityLabel={`About ${title}`} accessibilityRole="button" hitSlop={10} onPress={() => setInfoOpen(true)}>
        <CircleHelp color={colors.muted} size={15} strokeWidth={2} />
          </AnimatedPressable>
        ) : null}
        {trailing && !skeleton && status === "OK" ? <View style={{ marginLeft: "auto" }}>{trailing}</View> : null}
      </View>
      {caption && !skeleton ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted, marginTop: -spacing.xs }}>{caption}</Text>
      ) : null}

      {skeleton ? (
        <Skeleton height={96} radius={radii.sm} />
      ) : status === "OK" ? (
        children
      ) : status === "TOO_FEW" ? (
        <Text style={[type.description, { color: colors.muted }]}>{tooFewText ?? `${sampleSize} so far, too few to compare`}</Text>
      ) : status === "NO_DATA" ? (
        <Text style={[type.caption, { color: colors.muted }]}>{emptyText}</Text>
      ) : (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Text style={[type.caption, { color: colors.muted }]}>Couldn't load this card</Text>
          {onRetry ? (
            <AnimatedPressable accessibilityRole="button" hitSlop={8} onPress={onRetry}>
              <Text style={[type.caption, { color: colors.primary, fontFamily: fonts.sansSemiBold }]}>Try again</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      )}

      {footnote && !skeleton && status === "OK" ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted }}>{footnote}</Text>
      ) : null}

      {infoOpen && info ? (
        <InfoModal onClose={() => setInfoOpen(false)} title={title}>
          <InfoPoints points={info} />
        </InfoModal>
      ) : null}
    </View>
  );
}

/**
 * A card's ⓘ explanation, without bullets. A point written "Term: meaning" gets
 * the term as its own bold sub-title with the meaning beneath it; a point with
 * no term is a plain lead sentence. Formulas sit in grey boxes under one "How it
 * is calculated" sub-title, placed where the first formula is.
 *
 * <p>Three steps of ink so the modal reads top-down: the modal's title in full
 * ink, sub-titles and formulas a shade softer, the explanations softer again.
 */
function InfoPoints({ points }: { points: InfoPoint[] }) {
  const { colors, fonts } = useTheme();
  const firstFormula = points.findIndex((point) => typeof point !== "string");
  const subtitle = { color: colors.neutralText, fontFamily: fonts.displaySoft, fontSize: 15 };
  const body = { color: colors.muted, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 21 };
  return (
    <View style={{ gap: spacing.md }}>
      {points.map((point, index) => {
        if (typeof point !== "string") {
          return (
            <View key={index} style={{ gap: spacing.xs }}>
              {index === firstFormula ? <Text style={subtitle}>How it is calculated</Text> : null}
              <Formula parts={point.formula} />
              {point.note ? <Text style={body}>{point.note}</Text> : null}
            </View>
          );
        }
        const match = /^([^:]{1,40}): (.+)$/.exec(point);
        if (!match) {
          return (
            <Text key={index} style={body}>
              {point}
            </Text>
          );
        }
        const [, term, meaning] = match;
        return (
          <View key={index} style={{ gap: 2 }}>
            <Text style={subtitle}>{term}</Text>
            <Text style={body}>{meaning.charAt(0).toUpperCase() + meaning.slice(1)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A formula on one line where it fits, wrapping between its parts; a fraction stacks top over bottom. */
function Formula({ parts }: { parts: (string | FormulaFraction)[] }) {
  const { colors, fonts } = useTheme();
  const text = { color: colors.neutralText, fontFamily: fonts.sansSemiBold, fontSize: 13, lineHeight: 18 };
  return (
    <View
      accessibilityLabel={parts.map((part) => (typeof part === "string" ? part : `${part.over[0]} divided by ${part.over[1]}`)).join(" ")}
      accessible
      style={{
        alignItems: "center",
        backgroundColor: colors.surfaceSunken,
        borderRadius: radii.sm,
        columnGap: spacing.xs,
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        rowGap: spacing.xxs,
      }}
    >
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <Text key={index} style={[text, { flexShrink: 1 }]}>
            {part}
          </Text>
        ) : (
          <View key={index} style={{ alignItems: "center", flexShrink: 1 }}>
            <Text style={[text, { textAlign: "center" }]}>{part.over[0]}</Text>
            <View style={{ alignSelf: "stretch", backgroundColor: colors.neutralText, height: 1, marginVertical: 3 }} />
            <Text style={[text, { textAlign: "center" }]}>{part.over[1]}</Text>
          </View>
        ),
      )}
    </View>
  );
}

/**
 * A compact dropdown for a card: the current choice and a chevron, opening a
 * small menu just under it. For picking which series one chart shows. The
 * chosen row is grey-filled with no tick, like the period picker. Tapping
 * anywhere outside the menu closes it.
 *
 * <p>The menu opens toward the room it has: from the trigger's left edge when
 * the trigger sits in the left half of the screen, from its right edge
 * otherwise. Always right-aligning pushed a left-hand trigger's menu off the
 * screen.
 */
export function ChartDropdown<T extends string>({
  accessibilityLabel,
  onChange,
  options,
  value,
}: {
  accessibilityLabel: string;
  onChange: (value: T) => void;
  options: { key: T; label: string }[];
  value: T;
}) {
  const { colors, fonts } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ left?: number; right?: number; top: number } | null>(null);
  const chosen = options.find((option) => option.key === value) ?? options[0];
  const close = () => setAnchor(null);
  const open = () =>
    trigger.current?.measureInWindow((x, y, width, height) => {
      const top = y + height + spacing.xxs;
      setAnchor(x + width / 2 < windowWidth / 2 ? { left: Math.max(spacing.md, x), top } : { right: Math.max(spacing.md, windowWidth - x - width), top });
    });

  return (
    <>
      {/* collapsable={false} so Android keeps a real view here to measure. */}
      <View collapsable={false} ref={trigger}>
        <AnimatedPressable
          accessibilityLabel={`${accessibilityLabel}: ${chosen.label}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={open}
          style={{ alignItems: "center", borderColor: colors.borderStrong, borderRadius: radii.sm, borderWidth: 1, flexDirection: "row", gap: spacing.xxs, paddingLeft: spacing.sm, paddingRight: spacing.xs, paddingVertical: 4 }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{chosen.label}</Text>
          <ChevronDown color={colors.muted} size={14} strokeWidth={2.2} />
        </AnimatedPressable>
      </View>
      {anchor ? (
        <Modal animationType="fade" navigationBarTranslucent onRequestClose={close} statusBarTranslucent transparent visible>
          {/* A sibling behind the menu, never its parent: see InfoModal. */}
          <Pressable onPress={close} style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderRadius: radii.md,
              borderWidth: 1,
              elevation: 6,
              left: anchor.left,
              maxWidth: windowWidth - spacing.md * 2,
              minWidth: 180,
              padding: spacing.xxs,
              position: "absolute",
              right: anchor.right,
              shadowColor: "#000000",
              shadowOffset: { height: 6, width: 0 },
              shadowOpacity: 0.14,
              shadowRadius: 14,
              top: anchor.top,
            }}
          >
            {options.map((option) => {
              const selected = option.key === value;
              return (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.key}
                  onPress={() => {
                    onChange(option.key);
                    close();
                  }}
                  style={{ backgroundColor: selected ? colors.surfaceSunken : "transparent", borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm }}
                >
                  <Text style={{ color: colors.ink, fontFamily: selected ? fonts.sansSemiBold : fonts.sans, fontSize: 13 }}>{option.label}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Modal>
      ) : null}
    </>
  );
}

/** A small two-or-three-way switch for a card. Selected is an ink border and bold text, never a fill. */
export function ChartToggle<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: { key: T; label: string }[];
  value: T;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.xxs }}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={{ borderColor: selected ? colors.ink : colors.borderStrong, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 3 }}
          >
            <Text style={{ color: selected ? colors.ink : colors.muted, fontFamily: selected ? fonts.sansSemiBold : fonts.sans, fontSize: 12 }}>{option.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
import { CircleHelp } from "lucide-react-native";
