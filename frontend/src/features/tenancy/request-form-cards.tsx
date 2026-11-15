import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CircleHelp } from "lucide-react-native";

import Svg, { Circle, Path } from "react-native-svg";

import { AnimatedPressable } from "@/components/animated-pressable";
import { HighlightPanel } from "@/components/highlight-card";
import { PropertyNameCard } from "@/components/property-name-card";
import { cardShadow, softShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The pieces the tenant's request forms share (user, 2026-11-11): the room
 * change and the exit request are built the same way.
 */

/** A plain card with the app's edge and shadow. */
export function FormCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
        ...cardShadow(colors.shadow),
      }}
    >
      {children}
    </View>
  );
}

/**
 * A stay at the top of a form: a drawing on a white disc and the name on a
 * blue gradient, then a ruled row of facts on white.
 */
export function StayHeaderCard({ art, caption, children, title }: { art: ReactNode; caption: string; children: ReactNode; title: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        ...cardShadow(colors.shadow),
      }}
    >
      <LinearGradient
        colors={["#3E63DD", "#5B4BD6"]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={{
          alignItems: "center",
          borderTopLeftRadius: radii.card - 1,
          borderTopRightRadius: radii.card - 1,
          flexDirection: "row",
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        <View style={{ alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 999, height: 48, justifyContent: "center", width: 48 }}>
          {art}
        </View>
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <Text style={{ color: "rgba(255, 255, 255, 0.8)", fontFamily: fonts.sansSemiBold, fontSize: 12 }}>{caption}</Text>
          <Text numberOfLines={2} style={{ color: "#FFFFFF", fontFamily: fonts.display, fontSize: 21 }}>{title}</Text>
        </View>
      </LinearGradient>
      <View style={{ flexDirection: "row", padding: spacing.md }}>{children}</View>
    </View>
  );
}

/** One ruled column: a small label over its value. */
export function FactColumn({
  divided,
  dividerColor,
  label,
  tone,
  value,
}: {
  divided?: boolean;
  /**
   * Overrides the rule between columns.
   *
   * <p>The default is tuned for a white card. On the property card's cream the
   * light grey vanishes, so that one asks for the darker edge rather than every
   * card being darkened to suit it.
   */
  dividerColor?: string;
  label: string;
  tone?: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, minWidth: 0, paddingLeft: divided ? spacing.sm : 0 }}>
      {/* A 1px line like the rule above the row, not a border: a border is thinned on a scaled
          screen (0.8px at 1.25x) and read fainter than the rule (user, 2026-11-15). */}
      {divided ? <View style={{ backgroundColor: dividerColor ?? colors.border, bottom: 0, left: 0, position: "absolute", top: 0, width: 1 }} /> : null}
      <Text style={[type.caption, { color: colors.muted, fontSize: 10.5 }]}>{label}</Text>
      <Text numberOfLines={1} style={{ color: tone ?? colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>{value}</Text>
    </View>
  );
}

/** A tear-off calendar page: the month on a red band, the day and weekday under it. */
export function CalendarPageTile({ iso, unset = false }: { iso: string | null; /** A grey page reading Not set (2026-11-11: an open stay's end). */ unset?: boolean }) {
  const { colors, fonts } = useTheme();
  if (!iso && unset) {
    return (
      <View style={{ borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, overflow: "hidden", width: 56 }}>
        <View style={{ alignItems: "center", backgroundColor: colors.kicker, paddingVertical: 2 }}>
          <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.6 }}>END</Text>
        </View>
        <View style={{ alignItems: "center", backgroundColor: colors.surface, paddingBottom: 4, paddingTop: 2 }}>
          <Text allowFontScaling={false} style={{ color: colors.muted, fontFamily: fonts.display, fontSize: 18, lineHeight: 24 }}>–</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.sansSemiBold, fontSize: 10.5 }}>Not set</Text>
        </View>
      </View>
    );
  }
  const date = iso ? new Date(`${iso}T12:00:00+05:30`) : null;
  const part = (options: Intl.DateTimeFormatOptions) => (date ? new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" }).format(date) : "");
  return (
    <View style={{ borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, overflow: "hidden", width: 56 }}>
      <View style={{ alignItems: "center", backgroundColor: "#E5484D", paddingVertical: 2 }}>
        <Text style={{ color: "#FFFFFF", fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.6 }}>{date ? part({ month: "short" }).toUpperCase() : "BILL"}</Text>
      </View>
      <View style={{ alignItems: "center", backgroundColor: colors.surface, paddingBottom: 4, paddingTop: 2 }}>
        <Text adjustsFontSizeToFit allowFontScaling={false} minimumFontScale={0.7} numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16, lineHeight: 22 }}>{date ? part({ day: "numeric" }) : "--"}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.sansSemiBold, fontSize: 10.5 }}>{date ? part({ weekday: "short" }) : "End"}</Text>
      </View>
    </View>
  );
}

/** "4 December 2026" for a "YYYY-MM-DD" day, in IST. */
export function longDay(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(`${iso}T12:00:00+05:30`));
}

/** A section label outside its card, with an optional ? for How it works. */
export function SectionLabel({ helpLabel, label, onHelp, trailing }: { helpLabel?: string; label: string; onHelp?: () => void; trailing?: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
      <Text style={[type.label, { color: colors.muted }]}>{label}</Text>
      {onHelp ? (
        <AnimatedPressable accessibilityLabel={helpLabel ?? `About ${label}`} accessibilityRole="button" hitSlop={10} onPress={onHelp} tapLockMs={0}>
          <CircleHelp color={colors.muted} size={16} strokeWidth={2.2} />
        </AnimatedPressable>
      ) : null}
      <View style={{ flex: 1 }} />
      {trailing}
    </View>
  );
}

/** The ? in a form's header that opens its How it works. */
export function HeaderHelp({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
      tapLockMs={0}
    >
      <CircleHelp color={colors.kicker} size={20} strokeWidth={2.4} />
    </AnimatedPressable>
  );
}

/** The review note, one line with an i, above a pinned footer's button. */
export function FooterNote({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "center" }}>
      <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>ⓘ {children}</Text>
    </View>
  );
}

/**
 * The stay's property, in the owner's Property card (user, 2026-11-11): the
 * tenancy code and room as pills, the property's mark and name, its address
 * under a red pin, then a ruled row of facts.
 */
export function PropertyStayCard({
  address,
  addressAccessory,
  badge,
  children,
  name,
  referenceCode,
  roomLabel,
}: {
  address: string;
  /** Beside the address: directions, on the Tenancy tab. */
  addressAccessory?: ReactNode;
  /** In place of the room pill: the stay's status, on the Tenancy tab. */
  badge?: ReactNode;
  children: ReactNode;
  name: string;
  referenceCode: string;
  roomLabel?: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    // The owner's Property card, part for part (user, 2026-11-15): one border
    // and one shadow around the whole, the Home card's painted face on top, and
    // the details below it as a plain panel rather than a second card with its
    // own corners sitting over the first. The tenant's card keeps a bottom row
    // where the owner's has its Edit button.
    <View
      style={{
        borderColor: colors.borderStrong,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        overflow: "hidden",
        ...cardShadow(colors.shadow),
      }}
    >
      <PropertyNameCard joined name={name} />
      {/* borderStrong, not border: both rules sit on the panel's cream, where
          the light grey all but disappeared. */}
      <View style={{ backgroundColor: colors.borderStrong, height: 1 }} />
      <HighlightPanel style={{ borderRadius: 0, borderWidth: 0, padding: spacing.lg, paddingTop: spacing.md }} variant="property">
        <View style={{ gap: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <View style={{ backgroundColor: colors.neutralSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={[type.eyebrow, { color: colors.inkSoft }]}>{referenceCode}</Text>
            </View>
            {badge !== undefined ? badge : roomLabel ? (
              <View style={{ backgroundColor: colors.warningSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={[type.caption, { color: colors.accent }]}>{roomLabel}</Text>
              </View>
            ) : null}
          </View>
          {/* The address close beside its pin, as on the Property screen. */}
          <View
            style={{
              alignItems: addressAccessory ? "center" : "flex-start",
              flexDirection: "row",
              gap: spacing.xxs,
            }}
          >
            <View style={{ alignItems: "center", paddingTop: 2, width: 22 }}>
              <Svg accessible={false} height={24} viewBox="0 0 24 24" width={21}>
                <Path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8Z" fill={colors.danger} />
                <Circle cx={12} cy={10} fill="#FFFFFF" r={3} />
              </Svg>
            </View>
            {/* Narrower when something sits beside it, so the address wraps
                instead of running right up to the button. */}
            <Text
              style={[
                type.body,
                {
                  color: colors.muted,
                  flex: 1,
                  fontFamily: fonts.sansMedium,
                  fontSize: 13,
                  lineHeight: 18,
                  marginRight: addressAccessory ? spacing.md : 0,
                },
              ]}
            >
              {address}
            </Text>
            {/* Lifted off the centre line: the address is two or three lines
                and the button reads as belonging to its first one. */}
            {addressAccessory ? (
              <View style={{ transform: [{ translateY: -4 }] }}>{addressAccessory}</View>
            ) : null}
          </View>
        </View>
        {/* The rule stays. Where the owner's bottom row is a button, and reads
            as separate on its own, this one is more text under text. */}
        <View style={{ backgroundColor: colors.borderStrong, height: 1 }} />
        <View style={{ flexDirection: "row" }}>{children}</View>
      </HighlightPanel>
    </View>
  );
}
