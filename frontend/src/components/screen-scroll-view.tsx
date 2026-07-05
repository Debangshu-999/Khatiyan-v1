import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
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
      {/* iOS keyboard avoidance is handled by automaticallyAdjustKeyboardInsets
          on the ScrollView; Android needs an explicit KeyboardAvoidingView so
          low inputs (e.g. concern notes) aren't covered by the keyboard. */}
      <KeyboardAvoidingView behavior={Platform.OS === "android" ? "height" : undefined} style={{ flex: 1 }}>
        <ScrollView
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
          ]}
          {...props}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
