import { useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, type ScrollViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { api } from "@/store/api";
import { useAppDispatch } from "@/store/hooks";
import { fetchCurrentLocation } from "@/store/slices/location-slice";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ScreenScrollViewProps = ScrollViewProps & {
  children: ReactNode;
  centerContent?: boolean;
  onRefresh?: () => Promise<void> | void;
  safeAreaEdges?: Edge[];
};

export function ScreenScrollView({
  children,
  centerContent = false,
  contentContainerStyle,
  onRefresh,
  safeAreaEdges,
  style,
  ...props
}: ScreenScrollViewProps) {
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const [refreshing, setRefreshing] = useState(false);
  const resolvedSafeAreaEdges: Edge[] = safeAreaEdges ?? (Platform.OS === "web" ? [] : ["top", "bottom"]);

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
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={handleRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        }
        style={[{ backgroundColor: colors.background, flex: 1 }, style]}
        contentContainerStyle={[
          {
            flexGrow: centerContent ? 1 : undefined,
            gap: spacing.lg,
            justifyContent: centerContent ? "center" : undefined,
            paddingBottom: spacing.xxl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
          },
          contentContainerStyle,
        ]}
        {...props}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
