import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewProps,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

import { AppBackground } from "@/components/app-background";
import { api } from "@/store/api";
import { useAppDispatch } from "@/store/hooks";
import { fetchCurrentLocation } from "@/store/slices/location-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ScreenScrollViewProps = ScrollViewProps & {
  children: ReactNode;
  centerContent?: boolean;
  background?: ReactNode;
  onRefresh?: () => Promise<void> | void;
  // False disables pull-to-refresh entirely (e.g. auth screens, where a
  // refresh spinner makes no sense and the pull gesture feels like scrolling).
  refreshable?: boolean;
  // True locks scrolling while the content fits the viewport, re-enabling it
  // automatically when it overflows (small/zoomed displays, keyboard open).
  scrollOnlyWhenNeeded?: boolean;
  safeAreaEdges?: Edge[];
};

export function ScreenScrollView({
  children,
  background,
  centerContent = false,
  contentContainerStyle,
  onRefresh,
  refreshable = true,
  scrollOnlyWhenNeeded = false,
  safeAreaEdges,
  style,
  ...props
}: ScreenScrollViewProps) {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const [refreshing, setRefreshing] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const insets = useSafeAreaInsets();

  /**
   * Bottom padding that lifts content clear of the on-screen keyboard.
   *
   * <p>
   * Replaces {@code KeyboardAvoidingView behavior="padding"}, which is broken on
   * Android under edge-to-edge (mandatory since SDK 53). That component infers
   * keyboard height by comparing screen height to window height, but edge-to-edge
   * makes the window span the whole display, so the number it derives is wrong —
   * and on dismissal its padding does not return to zero, leaving a band of dead
   * space under the content.
   *
   * <p>
   * Measuring the IME directly fixes both halves: the shown height is the real
   * one, and hide sets it to exactly 0 rather than to a computed value that
   * might not be. iOS keeps {@code automaticallyAdjustKeyboardInsets}, which
   * works correctly there.
   */
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  // Where the list currently sits, so the nudge above is relative rather than
  // absolute — scrollTo takes an absolute offset.
  const scrollOffset = useRef(0);
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const onShow = Keyboard.addListener("keyboardDidShow", (event) => {
      // Padding alone only makes ROOM below the content — it does not move the
      // view, so a field the keyboard covers stays covered. iOS handles this via
      // automaticallyAdjustKeyboardInsets; Android has no equivalent, so scroll
      // the focused input above the keyboard by hand.
      if (Platform.OS === "android") {
        // Deferred a frame or two on purpose. setKeyboardInset above grows the
        // content, and scrollTo clamps to the CURRENT content height — firing
        // immediately meant scrolling to an offset that did not exist yet, so
        // nothing moved and the field stayed hidden.
        setTimeout(() => {
          const focused = TextInput.State.currentlyFocusedInput();
          focused?.measureInWindow((_x, y, _width, height) => {
            const keyboardTop = Dimensions.get("window").height - event.endCoordinates.height;
            const overlap = y + height - keyboardTop + spacing.xl;
            if (overlap > 0) {
              scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.current + overlap });
            }
          });
        }, 120);
      }

      // The IME is measured from the bottom of a full-height window, so it
      // already covers the navigation-bar inset the safe area padded for.
      // Subtracting it prevents counting that strip twice.
      setKeyboardInset(Math.max(0, event.endCoordinates.height - insets.bottom));
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [insets.bottom]);
  const [contentHeight, setContentHeight] = useState(0);
  const scrollEnabled = !scrollOnlyWhenNeeded || viewportHeight === 0 || contentHeight > viewportHeight + 1;
  const resolvedSafeAreaEdges: Edge[] = safeAreaEdges ?? (Platform.OS === "web" ? [] : ["top", "bottom"]);
  // Every screen gets the shared ambient gradient unless it supplies its own
  // (e.g. the auth hero). Foreground content scrolls over a transparent layer.
  const resolvedBackground = background ?? <AppBackground />;
  // Tab screens sit under the floating (absolute) tab bar, so their content
  // needs extra bottom clearance to scroll out from beneath it. Stack screens
  // pushed over the tabs don't show the bar, so they keep the normal padding.
  const segments = useSegments();
  const inTabs = segments[0] === "(tabs)";
  const bottomPadding = inTabs ? 96 : spacing.xxl;
  // Whatever padding actually applies once the caller's style is merged — the
  // keyboard inset is added on top of that rather than replacing it.
  const flattenedContentStyle = StyleSheet.flatten(contentContainerStyle) as { paddingBottom?: number } | undefined;
  const callerPaddingBottom =
    typeof flattenedContentStyle?.paddingBottom === "number" ? flattenedContentStyle.paddingBottom : bottomPadding;

  async function handleRefresh() {
    setRefreshing(true);

    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        dispatch(fetchCurrentLocation());
        dispatch(
          api.util.invalidateTags([
            "Profile",
            "Property",
            "Tenancy",
            "BillingCycle",
            "Concern",
            "Notice",
            "Notification",
            "Discovery",
            "Payment",
            "Staff",
          ]),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 650));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView edges={resolvedSafeAreaEdges} style={{ backgroundColor: colors.background, flex: 1 }}>
      <View
        pointerEvents="none"
        style={{
          bottom: 0,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      >
        {resolvedBackground}
      </View>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollOnlyWhenNeeded ? (_width, height) => setContentHeight(height) : undefined}
        onLayout={scrollOnlyWhenNeeded ? (event) => setViewportHeight(event.nativeEvent.layout.height) : undefined}
        scrollEnabled={scrollEnabled}
        refreshControl={
          refreshable ? (
            <RefreshControl
              colors={[colors.primary]}
              onRefresh={handleRefresh}
              progressBackgroundColor={colors.surface}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          ) : undefined
        }
        style={[{ backgroundColor: "transparent", flex: 1 }, style]}
        contentContainerStyle={[
          {
            flexGrow: centerContent ? 1 : undefined,
            gap: spacing.lg,
            justifyContent: centerContent ? "center" : undefined,
            paddingBottom: bottomPadding,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          },
          contentContainerStyle,
          // LAST, so it cannot be overridden. The inset used to live in the
          // default object above, where any caller passing its own
          // paddingBottom silently wiped it — which is why the auth screen kept
          // the keyboard-over-input bug after every other screen was fixed: it
          // is the one screen that sets paddingBottom: 0, because its sheet owns
          // its own padding.
          { paddingBottom: callerPaddingBottom + keyboardInset },
        ]}
        {...props}
      >
      {children}
      </ScrollView>
    </SafeAreaView>
  );
}
