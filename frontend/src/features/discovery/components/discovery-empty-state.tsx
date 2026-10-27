import { Text, View } from "react-native";

import { Card } from "@/components/card";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type DiscoveryEmptyStateProps = {
  title: string;
  /** Kept compatible with existing callers; empty-state helper text is not displayed. */
  description?: string;
};

export function DiscoveryEmptyState({ title }: DiscoveryEmptyStateProps) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          Discovery
        </Text>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 19,
            letterSpacing: -0.3,
            lineHeight: 24,
          }}
        >
          {title}
        </Text>
      </View>
    </Card>
  );
}
