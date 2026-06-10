import { Text, View } from "react-native";

import { Card } from "@/components/card";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type DiscoveryEmptyStateProps = {
  title: string;
  description: string;
};

export function DiscoveryEmptyState({ title, description }: DiscoveryEmptyStateProps) {
  const { colors, fonts, type } = useTheme();

  return (
    <Card tone="sunken">
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          Discovery
        </Text>
        <Text
          style={{
            color: colors.ink,
            fontFamily: fonts.display,
            fontSize: 19,
            fontWeight: "500",
            letterSpacing: -0.3,
            lineHeight: 24,
          }}
          selectable
        >
          {title}
        </Text>
        <Text style={[type.body, { color: colors.muted }]} selectable>
          {description}
        </Text>
      </View>
    </Card>
  );
}
