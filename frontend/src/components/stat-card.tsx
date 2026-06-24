import type { ComponentType } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type StatCardProps = {
  icon: ComponentType<LucideProps>;
  label: string;
  value: string;
  // Rendered after the value in a muted tone, e.g. "/150" in "140/150".
  valueSuffix?: string;
  tone?: "default" | "primary" | "danger";
};

// Reference-style summary tile: soft icon chip on top, muted label, then a
// large value with an optional de-emphasised suffix (e.g. collected/billed).
export function StatCard({ icon: Icon, label, tone = "default", value, valueSuffix }: StatCardProps) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "danger" ? colors.danger : colors.primary;
  const chipBackground = tone === "danger" ? colors.dangerSoft : colors.primarySoft;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: 20,
        borderWidth: 1,
        elevation: 1,
        flex: 1,
        gap: spacing.sm,
        padding: spacing.lg,
        shadowColor: colors.shadow,
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: 1,
        shadowRadius: 12,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: chipBackground,
          borderRadius: 12,
          height: 38,
          justifyContent: "center",
          width: 38,
        }}
      >
        <Icon color={accent} size={18} strokeWidth={2.2} />
      </View>
      <Text numberOfLines={1} style={[type.caption, { color: colors.muted, fontWeight: "600" }]} selectable>
        {label}
      </Text>
      <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 }} selectable>
        {value}
        {valueSuffix ? (
          <Text style={{ color: colors.kicker, fontSize: 17, fontWeight: "700" }} selectable>
            {valueSuffix}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}
