import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { HeaderNote } from "@/components/header-note";
import { SCREEN_HEADER_COLLAPSE_DISTANCE } from "@/components/header-scroll-layout";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export const ScreenHeaderScrollContext = createContext<{
  scrollY?: Animated.Value;
  sticky: boolean;
  surface?: string;
}>({ sticky: false });

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  titleAdjustsFontSizeToFit?: boolean;
  titleMinimumFontScale?: number;
  titleNumberOfLines?: number;
  titleStyle?: TextStyle;
  italicTail?: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  // A status that qualifies the whole screen — "View only" is the case. Sits on
  // the TITLE row, right of the title, because that is the screen's name and the
  // badge is a fact about it. Sharing the row with `trailing` is fine: they
  // render side by side.
  badge?: ReactNode;
  style?: ViewStyle;
};

export function ScreenHeader({ badge, eyebrow, italicTail, style, subtitle, title, titleAdjustsFontSizeToFit, titleMinimumFontScale, titleNumberOfLines, titleStyle, trailing }: ScreenHeaderProps) {
  const { colors, type } = useTheme();
  const { scrollY, sticky, surface } = useContext(ScreenHeaderScrollContext);
  const restingScrollY = useRef(new Animated.Value(0)).current;
  const subtitleHeight = useRef(new Animated.Value(40)).current;
  // Follow the gesture in both directions; no threshold or timed animation
  // continues after the user has already returned to the top.
  const collapseProgress = useMemo(() => (scrollY ?? restingScrollY).interpolate({
    inputRange: [0, SCREEN_HEADER_COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: "clamp",
  }), [restingScrollY, scrollY]);
  const visibleSubtitleHeight = useMemo(() => Animated.multiply(
    subtitleHeight,
    collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  ), [collapseProgress, subtitleHeight]);
  const flattenedTitleStyle = StyleSheet.flatten(titleStyle);
  const titleSize = typeof flattenedTitleStyle?.fontSize === "number" ? flattenedTitleStyle.fontSize : 30;
  const titleLineHeight = typeof flattenedTitleStyle?.lineHeight === "number" ? flattenedTitleStyle.lineHeight : titleSize + 6;
  const compactTitleSize = Math.min(titleSize, 23);
  const compactLineHeight = compactTitleSize + 5;
  const animatedTitleSize = collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [titleSize, compactTitleSize] });
  const animatedTitleLineHeight = collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [titleLineHeight, compactLineHeight] });
  return (
    <View
      style={[
        {
          marginHorizontal: sticky ? -spacing.lg : 0,
          paddingHorizontal: sticky ? spacing.lg : 0,
          paddingBottom: spacing.sm,
          // Always opaque: native scrolling can move content beneath the
          // sticky header before the JS collapse animation has started.
          backgroundColor: sticky ? surface ?? colors.background : undefined,
          position: "relative",
        },
        style,
      ]}
    >
      {sticky ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={{
              backgroundColor: colors.borderStrong,
              bottom: 0,
              height: 1,
              left: 0,
              opacity: collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.72] }),
              position: "absolute",
              right: 0,
            }}
          />
        </>
      ) : null}

      {eyebrow ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={[type.eyebrow, { color: colors.accent }]}>{eyebrow}</Text>
          <View style={{ backgroundColor: colors.borderStrong, flex: 1, height: 1, opacity: 0.55 }} />
        </View>
      ) : null}

      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Animated.Text
            adjustsFontSizeToFit={titleAdjustsFontSizeToFit}
            minimumFontScale={titleMinimumFontScale ?? 0.72}
            numberOfLines={titleNumberOfLines}
            style={[
              type.brand,
              { color: colors.ink },
              titleStyle,
              { fontSize: animatedTitleSize, lineHeight: animatedTitleLineHeight },
            ]}
          >
            {title}
            {italicTail ? (
              <Animated.Text
                style={[
                  type.brandItalic,
                  { color: colors.accent },
                  titleStyle,
                  { fontSize: animatedTitleSize, lineHeight: animatedTitleLineHeight },
                ]}
              >
                {" "}
                {italicTail}
              </Animated.Text>
            ) : null}
          </Animated.Text>
        </View>

        {badge || trailing ? (
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            {badge}
            {trailing}
          </View>
        ) : null}
      </View>

      {subtitle ? (
        <Animated.View
          style={{
            marginTop: collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [spacing.xs, 0] }),
            height: visibleSubtitleHeight,
            opacity: collapseProgress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [1, 0, 0] }),
            overflow: "hidden",
            transform: [{ translateY: collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
          }}
        >
          <View
            collapsable={false}
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              if (height > 0) subtitleHeight.setValue(height);
            }}
            // Measure natural content independently of the clipped viewport.
            // A child in normal flow can measure as zero when its parent
            // collapses, permanently losing its expanded height.
            style={{ left: 0, position: "absolute", right: 0, top: 0 }}
          >
            <HeaderNote>{subtitle}</HeaderNote>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
