import { Text, View } from "react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";
import { SectionHeading } from "@/components/section-heading";

type DiscoverySectionHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

export function DiscoverySectionHeader({ eyebrow, subtitle, title }: DiscoverySectionHeaderProps) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <SectionHeading title={title} />
      {subtitle ? (
        <Text style={[type.description, { color: colors.muted }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
