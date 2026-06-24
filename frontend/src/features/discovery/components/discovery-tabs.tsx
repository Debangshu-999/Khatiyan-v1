import { useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, Pressable, Text, View } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type DiscoveryTab = "properties" | "locations";

export type DiscoveryTabItem = {
  label: string;
  value: DiscoveryTab;
};

type DiscoveryTabsProps = {
  activeTab: DiscoveryTab;
  tabs: DiscoveryTabItem[];
  onChange: (tab: DiscoveryTab) => void;
};

export function DiscoveryTabs({ activeTab, onChange, tabs }: DiscoveryTabsProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const animatedIndex = useRef(new Animated.Value(activeIndexFor(activeTab, tabs))).current;
  const segmentWidth = width > 0 ? width / tabs.length : 0;

  useEffect(() => {
    Animated.timing(animatedIndex, {
      duration: 220,
      toValue: activeIndexFor(activeTab, tabs),
      useNativeDriver: true,
    }).start();
  }, [activeTab, animatedIndex, tabs]);

  function handleLayout(event: LayoutChangeEvent) {
    setWidth(event.nativeEvent.layout.width);
  }

  return (
    <View
      onLayout={handleLayout}
      style={{
        alignSelf: "stretch",
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        flexDirection: "row",
        marginHorizontal: -spacing.lg,
        minHeight: 52,
        paddingHorizontal: spacing.lg,
      }}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            backgroundColor: colors.ink,
            bottom: -1,
            height: 2,
            left: 0,
            position: "absolute",
            transform: [{ translateX: Animated.multiply(animatedIndex, segmentWidth) }],
            width: segmentWidth,
          }}
        />
      ) : null}

      {tabs.map((tab) => {
        const isActive = activeTab === tab.value;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={tab.value}
            onPress={() => {
              if (!isActive) {
                onChange(tab.value);
              }
            }}
            style={{
              alignItems: "center",
              flex: 1,
              justifyContent: "center",
              minHeight: 50,
              paddingHorizontal: spacing.sm,
              zIndex: 1,
            }}
          >
            <Text
              style={{
                color: isActive ? colors.ink : colors.kicker,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 1.6,
                textAlign: "center",
                textTransform: "uppercase",
              }}
              selectable
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function activeIndexFor(activeTab: DiscoveryTab, tabs: DiscoveryTabItem[]) {
  return Math.max(
    tabs.findIndex((tab) => tab.value === activeTab),
    0,
  );
}
