import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { Card } from "@/components/card";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type EmptyStateProps = {
  icon?: ComponentType<LucideProps>;
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ action, description, eyebrow, icon: Icon, title }: EmptyStateProps) {
  const { colors, type } = useTheme();

  return (
    <Card tone="sunken">
      <View style={{ alignItems: "flex-start", gap: spacing.md }}>
        {Icon ? (
          <View
            style={{
              alignItems: "center",
              borderColor: colors.ink,
              borderCurve: "continuous",
              borderRadius: 14,
              borderWidth: 1,
              height: 46,
              justifyContent: "center",
              width: 46,
            }}
          >
            <Icon color={colors.ink} size={21} strokeWidth={2} />
          </View>
        ) : null}

        <View style={{ gap: spacing.xs }}>
          {eyebrow ? (
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>
            {title}
          </Text>
          <Text style={[type.body, { color: colors.muted, maxWidth: 480 }]}>
            {description}
          </Text>
        </View>

        {action}
      </View>
    </Card>
  );
}
