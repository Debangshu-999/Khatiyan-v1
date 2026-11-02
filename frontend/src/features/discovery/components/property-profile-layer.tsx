import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Animated, BackHandler, Easing, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurTargetView, BlurView } from "expo-blur";
import { useFocusEffect } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { LoadFailed } from "@/components/load-failed";
import { pinnedFooterEdge } from "@/components/pinned-footer";
import { useHideTabBar } from "@/components/tab-bar-visibility";
import { PropertyProfileSkeleton } from "@/components/skeletons/discovery/property-profile";
import { SlideInView } from "@/components/slide-in-view";
import { useProfileView, type ProfileSource } from "@/features/analytics/use-profile-view";
import { ProfileTopActions, PropertyProfile } from "@/features/discovery/components/property-profile";
import { useGetDiscoveryPropertyQuery } from "@/store/services/discovery-api";
import { softShadow } from "@/theme/shadows";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

import { useProfileActions } from "./profile-actions";

export type PropertyProfileLayerHandle = {
  /** Opens the profile for a property, sliding in over the list. Says where from, for the listing funnel. */
  open: (propertyId: string, source?: ProfileSource) => void;
  /** Drops the profile at once, for a new search that replaces the list. */
  dismiss: () => void;
};

/**
 * Discover's property profile, as a layer over the results list.
 *
 * <p><b>Its own component, with its own state</b> (user, 2026-10-02). The
 * selected property used to be state on the Discover screen, so opening or
 * closing a profile re-rendered the whole results list first: a visible pause
 * before the profile appeared. The screen now opens and closes this through a
 * ref, and nothing on the list re-renders.
 *
 * <p><b>currentData, not data.</b> RTK Query's {@code data} keeps the last
 * property's result while the next one loads, which flashed the previous
 * profile on every open after the first. {@code currentData} is only ever the
 * property asked for, so the skeleton shows until it arrives.
 *
 * <p>It slides in from the right, and out the way it came on back. The device
 * back button closes it first and is let through only when it is not open.
 */
export const PropertyProfileLayer = forwardRef<PropertyProfileLayerHandle>(function PropertyProfileLayer(_props, ref) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // What the footer's glass blurs on Android, where a blur sees only inside a BlurTargetView.
  const pageForGlass = useRef<View | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [source, setSource] = useState<ProfileSource>("SEARCH");
  const [focused, setFocused] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // One view per open, timed while it is in front (2026-10-18): the listing funnel's first step.
  useProfileView(propertyId, source, focused);
  const exit = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const detailQuery = useGetDiscoveryPropertyQuery({ propertyId: propertyId ?? "" }, { skip: !propertyId });
  const property = detailQuery.currentData;

  // Enquire, Visit and Booking (user, 2026-11-02): one row in a fixed footer, with the app's
  // bottom tabs out of the way while the profile fills the screen.
  const actions = useProfileActions(propertyId, property?.name ?? "");
  const [footerHeight, setFooterHeight] = useState(0);
  useHideTabBar(Boolean(propertyId) && focused);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(exit, { duration: 180, easing: Easing.in(Easing.quad), toValue: 1, useNativeDriver: true }).start(() => {
      // Only drop the layer here: resetting the value in the same callback
      // snapped it back to visible a frame before the unmount, a flicker. It
      // resets on the next open, while nothing is on screen.
      setPropertyId(null);
      closing.current = false;
    });
  }, [exit]);

  useImperativeHandle(
    ref,
    () => ({
      dismiss: () => {
        exit.stopAnimation();
        closing.current = false;
        setPropertyId(null);
      },
      open: (id: string, from: ProfileSource = "SEARCH") => {
        exit.setValue(0);
        scrollY.setValue(0);
        closing.current = false;
        setSource(from);
        setPropertyId(id);
      },
    }),
    [exit, scrollY],
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!propertyId) return false;
        close();
        return true;
      });
      return () => subscription.remove();
    }, [close, propertyId]),
  );

  async function refresh() {
    setRefreshing(true);
    try {
      await detailQuery.refetch().unwrap();
    } catch {
      // The error state on screen already says the load failed; a refresh that
      // fails the same way has nothing to add.
    } finally {
      setRefreshing(false);
    }
  }

  if (!propertyId) return null;

  const failed = detailQuery.isError && !property;

  // Fully white, with shadows to lift the cards off it (user, 2026-11-02).
  return (
    <Animated.View
      accessibilityViewIsModal
      style={{
        backgroundColor: colors.surface,
        bottom: 0,
        left: 0,
        opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        position: "absolute",
        right: 0,
        top: 0,
        transform: [{ translateX: exit.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }],
      }}
    >
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Keyed by property so each open plays the entrance afresh. */}
        <SlideInView from="right" key={propertyId}>
          {/* Back and the property's own buttons stay as the page scrolls (user, 2026-11-02). The
              white strip behind them appears only once the page has moved, as a fixed search bar's
              does, edge to edge. Back is there while it loads or fails too. A zIndex, or Android
              draws the page over its shadow. */}
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.xs,
              zIndex: 10,
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                // Up through the status bar, so its top edge and shadow are off the screen and it
                // reads as one with the bar (user, 2026-11-02).
                { bottom: -spacing.xs, left: 0, position: "absolute", right: 0, top: -insets.top },
                {
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                  borderBottomWidth: 1,
                  opacity: scrollY.interpolate({ extrapolate: "clamp", inputRange: [0, 16], outputRange: [0, 1] }),
                  ...softShadow(colors.shadow, 4, 12),
                },
              ]}
            />
            <AnimatedPressable
              accessibilityLabel="Back to the list"
              accessibilityRole="button"
              onPress={close}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 21,
                borderWidth: 1,
                height: 42,
                justifyContent: "center",
                width: 42,
                ...softShadow(colors.shadow, 2, 8, 0.12),
              }}
            >
              <ArrowLeft color={colors.ink} size={21} strokeWidth={2.75} />
            </AnimatedPressable>
            <View style={{ flex: 1 }} />
            {property ? <ProfileTopActions property={property} /> : null}
          </View>
          <BlurTargetView ref={pageForGlass} style={{ flex: 1 }}>
          {/* A plain ScrollView, so it brings its own RefreshControl, driven by
              its own state rather than isFetching, which is also true on first
              open and would spin over a screen nobody pulled. */}
          <Animated.ScrollView
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            scrollEventThrottle={16}
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: (property && actions.available ? footerHeight : insets.bottom) + spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                colors={[colors.primary]}
                onRefresh={() => void refresh()}
                progressBackgroundColor={colors.surface}
                refreshing={refreshing}
                tintColor={colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {property ? (
              <PropertyProfile
                property={property}
              />
            ) : failed ? (
              <LoadFailed error={detailQuery.error} onReload={() => void detailQuery.refetch()} />
            ) : (
              <PropertyProfileSkeleton />
            )}
          </Animated.ScrollView>
          </BlurTargetView>
        </SlideInView>
      </SafeAreaView>
      {/* Fixed, and blurred like the app's bottom tabs: only on this screen (user, 2026-11-02). */}
      {property && actions.available ? (
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          style={{
            ...pinnedFooterEdge(colors),
            bottom: 0,
            left: 0,
            overflow: "hidden",
            paddingBottom: insets.bottom + spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            position: "absolute",
            right: 0,
          }}
        >
          <BlurView
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={pageForGlass}
            intensity={isDark ? 55 : 60}
            style={StyleSheet.absoluteFill}
            tint={isDark ? "dark" : "default"}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${colors.surfaceSunken}CC` }]} />
          {actions.row(false)}
        </View>
      ) : null}
      {actions.sheets}
    </Animated.View>
  );
});
