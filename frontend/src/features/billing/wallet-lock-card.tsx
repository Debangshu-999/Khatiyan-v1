import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import Svg, { Path, Rect, Circle } from "react-native-svg";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useTheme } from "@/theme/use-theme";

function Padlock({ locked, color }: { locked: boolean; color: string }) {
  return <Svg width={17} height={19} viewBox="0 0 24 26" fill="none">
    <Path d={locked ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 10 0"} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Rect x={4} y={11} width={16} height={12} rx={3} fill={locked ? color : "none"} stroke={color} strokeWidth={2} />
    <Circle cx={12} cy={16} r={1.3} fill={locked ? "white" : color} />
    <Path d="M12 17v2" stroke={locked ? "white" : color} strokeWidth={1.8} strokeLinecap="round" />
  </Svg>;
}

export function WalletLockCard({ enabled, busy, onChange }: { enabled: boolean; busy: boolean; onChange: (enabled: boolean) => void }) {
  const { colors, fonts } = useTheme();
  const slide = useRef(new Animated.Value(enabled ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(slide, { toValue: enabled ? 1 : 0, duration: 220, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [enabled, slide]);
  return <View style={{ backgroundColor: colors.surface, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.neutralSoft, alignItems: "center", justifyContent: "center" }}>
      <Svg width={31} height={31} viewBox="0 0 32 32" fill="none">
        <Path d="M23 11V7H6a3 3 0 0 0 0 6h18M4 10v15a3 3 0 0 0 3 3h10M24 13v4M4 10h19" stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Rect x={20} y={23} width={9} height={8} rx={2} stroke={colors.ink} strokeWidth={1.9} />
        <Path d="M22 23v-2a2.5 2.5 0 0 1 5 0v2" stroke={colors.ink} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={24.5} cy={27} r={1} fill={colors.ink} />
      </Svg>
    </View>
    <Text style={{ flex: 1, color: colors.ink, fontFamily: fonts.display, fontSize: 17, lineHeight: 23 }}>Secure Wallet</Text>
    <AnimatedPressable accessibilityRole="switch" accessibilityLabel="Secure Wallet" accessibilityState={{ checked: enabled, disabled: busy }} disabled={busy} hitSlop={6} onPress={() => onChange(!enabled)} style={{ width: 62, height: 34, borderRadius: 17, padding: 4, backgroundColor: enabled ? "#FFF0F3" : colors.borderStrong, opacity: busy ? 0.6 : 1 }}>
      <Animated.View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "white", justifyContent: "center", alignItems: "center", transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }) }] }}>
        <Padlock locked={enabled} color={enabled ? colors.danger : colors.muted} />
      </Animated.View>
    </AnimatedPressable>
  </View>;
}
