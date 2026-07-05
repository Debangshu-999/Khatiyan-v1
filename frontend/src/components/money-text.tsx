import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text } from "react-native";

import { useTheme } from "@/theme/use-theme";

// Ledger figure: a de-emphasised rupee mark against a serif, tabular-numeral
// amount — every sum in the app should read like an entry in a printed ledger.
// Paise are dropped (the app records whole-rupee amounts); negatives keep a
// proper minus sign in the figure colour. `animate` counts the figure up to its
// value on mount — reserve it for one hero figure per screen.
export function MoneyText({
  animate = false,
  color,
  paise,
  size = 18,
  weight = "500",
}: {
  animate?: boolean;
  color?: string;
  paise: number;
  size?: number;
  weight?: "500" | "700";
}) {
  const { colors, fonts } = useTheme();
  const [display, setDisplay] = useState(animate ? 0 : paise);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      setDisplay(paise);
      return;
    }
    anim.setValue(0);
    const listener = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, { duration: 700, easing: Easing.out(Easing.cubic), toValue: paise, useNativeDriver: false }).start(() => setDisplay(paise));
    return () => anim.removeListener(listener);
  }, [animate, anim, paise]);

  const negative = display < 0;
  const figure = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(display) / 100);
  const figureColor = color ?? colors.ink;

  return (
    <Text
      style={{
        color: figureColor,
        fontFamily: fonts.display,
        fontSize: size,
        fontVariant: ["tabular-nums"],
        fontWeight: weight,
        letterSpacing: -0.3,
      }}
      selectable
    >
      {negative ? "−" : ""}
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: Math.round(size * 0.72), fontWeight: "600" }} selectable>
        {"₹"}
      </Text>
      {figure}
    </Text>
  );
}
