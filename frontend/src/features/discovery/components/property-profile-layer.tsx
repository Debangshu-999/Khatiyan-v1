import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Animated, BackHandler, Easing, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { PropertyProfileSkeleton } from "@/components/skeletons/discovery/property-profile";
import { SlideInView } from "@/components/slide-in-view";
import { DiscoveryButton } from "@/features/discovery/components/discovery-button";
import { DiscoveryEmptyState } from "@/features/discovery/components/discovery-empty-state";
import { useProfileView, type ProfileSource } from "@/features/analytics/use-profile-view";
import { PropertyProfile } from "@/features/discovery/components/property-profile";
import { useGetDiscoveryPropertyQuery } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { BlurTargetView } from "expo-blur";
import { PROFILE_ACTIONS_HEIGHT, useProfileActions } from "./profile-actions";

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
/** The tab bar the profile sits over. The floating Book a stay clears it, and the page ends just above it. */
const TAB_BAR_HEIGHT_PX = 60;

export const PropertyProfileLayer = forwardRef<PropertyProfileLayerHandle>(function PropertyProfileLayer(_props, ref) {
  const { colors } = useTheme();
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

  // Enquire, Visit and Booking (user, 2026-10-17): a row that floats at the bottom
  // centre, and rests in the page just below Contacts once the page is scrolled to it.
  const actions = useProfileActions(propertyId, property?.name ?? "");
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [dockY, setDockY] = useState<number | null>(null);
  // What the floating tile's glass blurs on Android: the page under it.
  const pageForGlass = useRef<View | null>(null);
  // The page's own row has reached the floating row's exact place: they swap there.
  // Swapping any earlier or later showed both (user, 2026-10-18): the floating
  // row is glass, so the page's row read through and under it on a slow scroll.
  // So the page's row stays invisible until this point, and at this point the
  // two are the same row in the same place. A pixel of slack for fractional
  // scroll offsets, or the very end of the page might never quite match.
  const dockInView = dockY != null && viewportHeight > 0
    && spacing.sm + dockY + PROFILE_ACTIONS_HEIGHT
      <= scrollY + viewportHeight - TAB_BAR_HEIGHT_PX - spacing.md + 1;

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
        closing.current = false;
        setSource(from);
        setPropertyId(id);
      },
    }),
    [exit],
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

  // formSurface, the lighter ground this screen had before the app-wide shade:
  // a profile is mostly one large photograph and a stack of white cards.
  return (
    <Animated.View
      accessibilityViewIsModal
      style={{
        backgroundColor: colors.surfaceRaised,
        bottom: 0,
        left: 0,
        opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        position: "absolute",
        right: 0,
        top: 0,
        transform: [{ translateX: exit.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }],
      }}
    >
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        {/* Keyed by property so each open plays the entrance afresh. */}
        <SlideInView from="right" key={propertyId}>
          {/* A plain ScrollView, so it brings its own RefreshControl, driven by
              its own state rather than isFetching, which is also true on first
              open and would spin over a screen nobody pulled. */}
          <BlurTargetView ref={pageForGlass} style={{ flex: 1 }}>
          <ScrollView
            // Just clear of the tab bar at the page's end, so Book a stay rests close above it (user, 2026-10-17).
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: TAB_BAR_HEIGHT_PX + spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
            keyboardShouldPersistTaps="handled"
            onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
            onScroll={(event) => setScrollY(event.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
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
                actions={<View pointerEvents={dockInView ? "auto" : "none"} style={{ opacity: dockInView ? 1 : 0 }}>{actions.row(false)}</View>}
                onActionsDock={setDockY}
                property={property}
              />
            ) : failed ? (
              <>
                <DiscoveryEmptyState
                  title="Could not load property"
                  description="The property profile could not be loaded. Go back and try again."
                />
                <DiscoveryButton label="Back to listings" muted onPress={close} />
              </>
            ) : (
              <PropertyProfileSkeleton />
            )}
          </ScrollView>
          </BlurTargetView>
          {/* Floats at the bottom, clear of the tab bar, until the page reaches the one below Contacts. */}
          {property && actions.available && !dockInView ? (
            <View pointerEvents="box-none" style={{ bottom: TAB_BAR_HEIGHT_PX + spacing.md, left: spacing.lg, position: "absolute", right: spacing.lg }}>
              {actions.row(true, pageForGlass)}
            </View>
          ) : null}
        </SlideInView>
      </SafeAreaView>
      {actions.sheets}
    </Animated.View>
  );
});
