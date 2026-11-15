import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from "react-native-svg";
import { OnNoticeTenancyArt, RollCallArt } from "@/components/control-art";
import { BillingArt, ConcernArt, MealsArt, NoticeArt } from "@/features/owner/workspace-module-icons";

import { AnimatedPressable } from "@/components/animated-pressable";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useListMyTenancyBillingCyclesQuery } from "@/store/services/billing-api";
import { useListMyCurrentConcernsQuery } from "@/store/services/concern-api";
import { useGetMyMealPassQuery, useGetMyMealScheduleQuery } from "@/store/services/food-api";
import { useListMyVisibleNoticesQuery } from "@/store/services/notice-api";
import { NOTIFICATION_REFETCH_OPTIONS, useGetRecentNotificationsQuery } from "@/store/services/notification-api";
import { useGetMyRollCallQuery } from "@/store/services/roll-call-api";
import { useGetMyStayOutsQuery } from "@/store/services/stay-out-api";
import { useGetMyActiveTenancyQuery } from "@/store/services/tenancy-api";
import { softShadow } from "@/theme/shadows";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { buildTenantStatusItems, todayInIndia, type TenantStatusItem, type TenantStatusKind } from "./tenant-status-items";

/** How long each line shows (the launcher design, 2026-11-09). */
const LINE_MS = 4000;
// Three at most, in a window that slides (user, 2026-11-13).
const MAX_DOTS = 3;

/**
 * Each line's own coloured drawing (user, 2026-11-15), the ones the app uses for
 * the same things: the roll call's clipboard, the Meals, Billing, Notice and
 * Concern module drawings, the yellow bell. Only the calm line keeps a glyph.
 */
const KIND_ART: Record<TenantStatusKind, (props: { size: number }) => ReactNode> = {
  bill: BillingArt,
  calm: ({ size }) => <Sparkles color="#7C4DDB" size={size - 4} strokeWidth={2.2} />,
  concern: ConcernArt,
  meal: MealsArt,
  notice: NoticeArt,
  notification: ({ size }) => <YellowBell3D size={size} />,
  "roll-call": RollCallArt,
  "stay-out": OnNoticeTenancyArt,
};

const KIND_TINT: Record<TenantStatusKind, string> = {
  bill: "#2F6FEB",
  calm: "#7C4DDB",
  concern: "#E0662B",
  meal: "#1F9D6B",
  notice: "#2443B0",
  notification: "#C27C00",
  "roll-call": "#2F6CD9",
  "stay-out": "#7C4DDB",
};

/** Everything the tenant's status bar says, from what Home already loads. */
export function useTenantStatusItems(): TenantStatusItem[] {
  const tenancy = useGetMyActiveTenancyQuery().data;
  const tenancyId = tenancy?.tenancy.id ?? "";
  const signed = Boolean(tenancy) && tenancy?.tenancy.status !== "PENDING_ACCEPTANCE";
  const bills = useListMyTenancyBillingCyclesQuery(tenancyId, { skip: !tenancyId }).data;
  const nextMeal = useGetMyMealScheduleQuery(undefined, { skip: !signed }).data?.nextMeal ?? null;
  const stayOuts = useGetMyStayOutsQuery(undefined, { skip: !signed }).data?.stayOuts;
  const concerns = useListMyCurrentConcernsQuery(undefined, { skip: !signed }).data;
  const notices = useListMyVisibleNoticesQuery(undefined, { pollingInterval: 60_000, skip: !signed }).data;
  const notifications = useGetRecentNotificationsQuery("tenant", NOTIFICATION_REFETCH_OPTIONS).data;
  const rollCall = useGetMyRollCallQuery(undefined, { skip: !signed }).data;
  // The same cache the meal pass card reads, so no extra request.
  const mealPass = useGetMyMealPassQuery(undefined, { pollingInterval: 30_000, skip: !signed }).data;

  return useMemo(() => buildTenantStatusItems({
    bills: bills ?? [],
    concerns: concerns ?? [],
    nextMeal,
    noticeCount: notices?.length ?? 0,
    notifications: notifications ?? [],
    now: Date.now(),
    propertyName: tenancy?.property.name ?? null,
    mealPass: mealPass ?? null,
    rollCall: rollCall ?? null,
    stayOuts: stayOuts ?? [],
    today: todayInIndia(),
  }), [bills, concerns, mealPass, nextMeal, notices, notifications, rollCall, stayOuts, tenancy?.property.name]);
}

/**
 * The launcher's status line on the tenant's Home (user, 2026-11-10): one
 * translucent bar under the location that cycles through everything pending or
 * coming up, every four seconds. A finger on it pauses, a tap opens what the
 * line is about.
 */
/** The indexes of the (at most) three dots shown: the current one in the middle where it can be. */
export function dotWindow(count: number, index: number): number[] {
  const size = Math.min(MAX_DOTS, count);
  const start = Math.max(0, Math.min(index - 1, count - size));
  return Array.from({ length: size }, (_, offset) => start + offset);
}

export function TenantStatusBar() {
  const { colors, fonts, isDark } = useTheme();
  const router = useGuardedRouter();
  const items = useTenantStatusItems();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const shown = useRef(new Animated.Value(1)).current;
  const current = items[Math.min(index, items.length - 1)];

  // The list changes as data lands: never point past its end.
  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  // Fade the line out, then move on. A fade cut short (a finger on the bar, the list
  // changing) puts the line straight back: the bar was left blank once (user, 2026-11-15).
  useEffect(() => {
    if (paused || items.length < 2) {
      shown.stopAnimation();
      shown.setValue(1);
      return;
    }
    let fading: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      fading = Animated.timing(shown, { duration: 180, easing: Easing.in(Easing.quad), toValue: 0, useNativeDriver: true });
      fading.start(({ finished }) => {
        if (!finished) {
          shown.setValue(1);
          return;
        }
        setIndex((value) => (value + 1) % items.length);
      });
    }, LINE_MS);
    return () => {
      clearTimeout(timer);
      fading?.stop();
    };
  }, [index, items.length, paused, shown]);

  // Each new line fades in once it has rendered, not from inside the fade-out's callback.
  const currentKey = current?.key;
  useEffect(() => {
    const rise = Animated.timing(shown, { duration: 240, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true });
    rise.start(({ finished }) => {
      if (!finished) shown.setValue(1);
    });
    return () => rise.stop();
  }, [currentKey, index, shown]);

  if (!current) return null;
  const Art = KIND_ART[current.kind];
  const ink = isDark ? "#FFFFFF" : "#101A3A";

  return (
    <AnimatedPressable
      accessibilityHint={current.route ? "Opens what this line is about" : undefined}
      accessibilityLabel={current.text}
      accessibilityRole={current.route ? "button" : "text"}
      disabled={!current.route}
      onPress={() => current.route && router.push(current.route as never)}
      onPressIn={() => setPaused(true)}
      onPressOut={() => setPaused(false)}
      style={{ borderRadius: 999, ...softShadow(colors.shadow, 3, 10) }}
    >
      {/* Frosted glass over the launcher's colours: blue, violet, peach, teal. */}
      <LinearGradient
        colors={isDark
          ? ["rgba(91, 124, 250, 0.30)", "rgba(180, 108, 240, 0.26)", "rgba(255, 154, 118, 0.24)", "rgba(52, 195, 176, 0.26)"]
          : ["rgba(91, 124, 250, 0.16)", "rgba(180, 108, 240, 0.13)", "rgba(255, 154, 118, 0.15)", "rgba(52, 195, 176, 0.14)"]}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={{
          alignItems: "center",
          backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.55)",
          borderColor: isDark ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.9)",
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 46,
          overflow: "hidden",
          paddingLeft: 6,
          paddingRight: spacing.md,
        }}
      >
        <Animated.View
          style={{
            alignItems: "center",
            flex: 1,
            flexDirection: "row",
            gap: spacing.sm,
            minWidth: 0,
            opacity: shown,
            // Room inside the fading layer: Android draws it cropped to its own bounds, and Playfair's
            // figures rise above the line, so the counts were cut at the top (user, 2026-11-15).
            paddingVertical: 6,
            transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
          }}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: isDark ? "rgba(255, 255, 255, 0.92)" : "#FFFFFF",
              borderRadius: 999,
              height: 34,
              justifyContent: "center",
              width: 34,
            }}
          >
            <Art size={24} />
          </View>
          <Text
            ellipsizeMode="tail"
            numberOfLines={1}
            // Playfair, upright (user, 2026-11-15): kin to the profile's italic taglines, not the same.
            // Lining figures: Playfair's default old-style digits sat small beside the words ("1 notice", user 2026-11-15).
            style={{ color: current.urgent ? colors.danger : ink, flex: 1, fontFamily: fonts.fancy, fontSize: 14.5, fontVariant: ["lining-nums"], includeFontPadding: true, letterSpacing: 0.1, lineHeight: 24, paddingVertical: 2, textAlignVertical: "center" }}
          >
            {/* Each run of digits in its own span, a size up, so "1 notice" reads at the
                words' height on every platform (user, 2026-11-15). */}
            {current.text.split(/(\d+)/).map((part, at) => (/^\d+$/.test(part)
              ? <Text key={at} style={{ fontSize: 16.5, fontVariant: ["lining-nums"] }}>{part}</Text>
              : part))}
          </Text>
        </Animated.View>
        {items.length > 1 ? (
          // Three dots at most, a window that slides with the item shown; each dot
          // in its item's own icon colour, the current one a bigger circle (user, 2026-11-13).
          <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
            {dotWindow(items.length, index).map((dot) => {
              const item = items[dot];
              const active = dot === index;
              const size = active ? 8 : 5;
              return (
                <View
                  key={item.key}
                  style={{
                    backgroundColor: item.urgent ? colors.danger : KIND_TINT[item.kind],
                    borderRadius: 999,
                    height: size,
                    opacity: active ? 1 : 0.45,
                    width: size,
                  }}
                />
              );
            })}
          </View>
        ) : null}
        {/* No arrow (user, 2026-11-15): a line with somewhere to go still opens it on a tap. */}
      </LinearGradient>
    </AnimatedPressable>
  );
}

/**
 * A yellow bell drawn with depth (user, 2026-11-10): a lit gradient body, a
 * highlight on its shoulder, a darker rim and clapper, and a soft shadow under it.
 */
export function YellowBell3D({ size = 28 }: { size?: number }) {
  return (
    <Svg height={size} viewBox="0 0 32 32" width={size}>
      <Defs>
        <SvgGradient id="bellBody" x1="0.15" x2="0.9" y1="0.05" y2="0.95">
          <Stop offset="0" stopColor="#FFF3A6" />
          <Stop offset="0.42" stopColor="#FFD12E" />
          <Stop offset="1" stopColor="#E89A00" />
        </SvgGradient>
        <RadialGradient cx="40%" cy="35%" id="bellClapper" r="60%">
          <Stop offset="0" stopColor="#FFC24D" />
          <Stop offset="1" stopColor="#C46A00" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="16" cy="30" fill="rgba(0, 0, 0, 0.16)" rx="8" ry="1.6" />
      <Circle cx="16" cy="26" fill="url(#bellClapper)" r="2.8" />
      <Path
        d="M16 4.2c-5.1 0-8.6 3.9-8.6 9.1v5.1l-2.4 3.5c-.6.9 0 2.1 1.1 2.1h19.8c1.1 0 1.7-1.2 1.1-2.1l-2.4-3.5v-5.1c0-5.2-3.5-9.1-8.6-9.1z"
        fill="url(#bellBody)"
        stroke="#C98400"
        strokeWidth="0.7"
      />
      {/* The rim, a shade darker. */}
      <Path d="M5.6 22.4c3 .9 6.5 1.3 10.4 1.3s7.4-.4 10.4-1.3" fill="none" stroke="#D18B00" strokeLinecap="round" strokeWidth="1.1" />
      <Circle cx="16" cy="3.6" fill="#E3A100" r="1.7" />
      {/* Light on the shoulder. */}
      <Ellipse cx="11.6" cy="11.2" fill="rgba(255, 255, 255, 0.7)" rx="1.4" ry="3.6" transform="rotate(18 11.6 11.2)" />
    </Svg>
  );
}
