import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Animated, BackHandler, Easing, RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { PropertyProfileSkeleton } from "@/components/skeletons/discovery/property-profile";
import { SlideInView } from "@/components/slide-in-view";
import { DiscoveryButton } from "@/features/discovery/components/discovery-button";
import { DiscoveryEmptyState } from "@/features/discovery/components/discovery-empty-state";
import { PropertyProfile } from "@/features/discovery/components/property-profile";
import { useGetDiscoveryPropertyQuery } from "@/store/services/discovery-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type PropertyProfileLayerHandle = {
  /** Opens the profile for a property, sliding in over the list. */
  open: (propertyId: string) => void;
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
  const { colors } = useTheme();
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const exit = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const detailQuery = useGetDiscoveryPropertyQuery({ propertyId: propertyId ?? "" }, { skip: !propertyId });
  const property = detailQuery.currentData;

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
      open: (id: string) => {
        exit.setValue(0);
        closing.current = false;
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
          <ScrollView
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: 96, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}
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
              <PropertyProfile property={property} />
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
        </SlideInView>
      </SafeAreaView>
    </Animated.View>
  );
});
