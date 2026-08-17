import { Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Reusable previous/next pager for paginated history screens. Driven directly
 * by the backend {@link import("@/store/pagination").Page} flags.
 */
export function PaginationBar({
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  page,
  totalElements,
  totalPages,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  page: number;
  totalElements: number;
  totalPages: number;
}) {
  const { colors, fonts, type } = useTheme();
  const currentPage = totalPages === 0 ? 0 : page + 1;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
      <PagerButton disabled={!hasPrevious} icon={ChevronLeft} label="Prev" onPress={onPrevious} />
      <View style={{ alignItems: "center", gap: 1 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13, }}>
          Page {currentPage} of {Math.max(totalPages, 1)}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          {totalElements} total
        </Text>
      </View>
      <PagerButton disabled={!hasNext} icon={ChevronRight} iconTrailing label="Next" onPress={onNext} />
    </View>
  );
}

function PagerButton({
  disabled,
  icon: Icon,
  iconTrailing,
  label,
  onPress,
}: {
  disabled: boolean;
  icon: typeof ChevronLeft;
  iconTrailing?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts } = useTheme();
  const color = disabled ? colors.muted : colors.primary;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        minHeight: 42,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: spacing.md,
      }}
    >
      {iconTrailing ? null : <Icon color={color} size={17} strokeWidth={2.4} />}
      <Text style={{ color, fontFamily: fonts.sansBold, fontSize: 13, }}>
        {label}
      </Text>
      {iconTrailing ? <Icon color={color} size={17} strokeWidth={2.4} /> : null}
    </AnimatedPressable>
  );
}
