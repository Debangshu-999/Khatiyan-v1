import type { ComponentType, ReactNode } from "react";
import { Dimensions, Text, View } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type EmptyStateProps = {
  icon?: ComponentType<LucideProps>;
  title: string;
  description: string;
  action?: ReactNode;
  /**
   * Sits in the middle of the space the list would have filled. Off for empties
   * that share a screen with real content, where half a viewport of air reads
   * as the screen having failed rather than the list being empty.
   */
  compact?: boolean;
};

/**
 * Nothing to show, said calmly.
 *
 * <p>Centred and unboxed. It used to be a left-aligned sunken Card, which framed
 * absence as a thing — a filled panel announcing a gap — and on screens whose
 * ordinary state IS empty that made every visit look like a problem.
 *
 * <p>There is no eyebrow. Every caller had one ("All clear", "Nothing yet",
 * "Property required") sitting directly above a title that said the same thing
 * in more words.
 */
export function EmptyState({ action, compact, description, icon: Icon, title }: EmptyStateProps) {
  const { colors, fonts, type } = useTheme();

  // Roughly what is left below a header, filter row and section heading.
  const minHeight = compact ? undefined : Math.round(Dimensions.get("window").height * 0.46);

  return (
    <View
      style={{
        alignItems: "center",
        gap: spacing.md,
        justifyContent: "center",
        minHeight,
        paddingHorizontal: spacing.lg,
        paddingVertical: compact ? spacing.xl : 0,
      }}
    >
      {Icon ? (
        <View
          style={{
            alignItems: "center",
            borderColor: colors.ink,
            borderCurve: "continuous",
            borderRadius: 18,
            borderWidth: 1,
            height: 58,
            justifyContent: "center",
            width: 58,
          }}
        >
          <Icon color={colors.ink} size={26} strokeWidth={2} />
        </View>
      ) : null}

      <View style={{ alignItems: "center", gap: spacing.xs }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21 }}>
          {title}
        </Text>
        <Text style={[type.body, { color: colors.muted, maxWidth: 320, textAlign: "center" }]}>
          {description}
        </Text>
      </View>

      {action}
    </View>
  );
}
