import type { ComponentType, ReactNode } from "react";
import { Text, View, type ViewStyle } from "react-native";
import type { LucideProps } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type LucideIcon = ComponentType<LucideProps>;

/**
 * A titled block of choices: an icon disc, a caps title, one line saying what
 * is being asked, and the choices indented under the words.
 *
 * <p>Born in the discovery filter sheet and shared with the property editor, so
 * a searcher filtering on "Attached bathroom" and an owner declaring one are
 * looking at the same control.
 */
export function ChoiceSection({
  below,
  children,
  contentStyle,
  description,
  footnote,
  icon: Icon,
  title,
}: {
  /**
   * Full-width content under the indented choices, for fields a choice opens
   * up (the daily rates under "Offers daily stays"). Indented, two inputs side
   * by side would be too narrow to read their labels.
   */
  below?: ReactNode;
  children: ReactNode;
  contentStyle?: ViewStyle;
  description: string;
  /** A short line under the choices, for what an empty selection means. */
  footnote?: string;
  icon: LucideIcon;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <ChoiceCard>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: colors.neutralSoft,
            borderRadius: 999,
            height: 48,
            justifyContent: "center",
            width: 48,
          }}
        >
          <Icon color={colors.inkSoft} size={23} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text
            style={[
              type.eyebrow,
              {
                color: colors.inkSoft,
                fontFamily: fonts.sansBold,
                fontSize: 11.5,
                letterSpacing: 0.65,
              },
            ]}
          >
            {title}
          </Text>
          <Text style={[type.caption, { color: colors.muted, fontSize: 12.5, lineHeight: 17 }]}>
            {description}
          </Text>
        </View>
      </View>
      <View style={[{ gap: spacing.sm, marginLeft: 62 }, contentStyle]}>
        {children}
        {footnote ? (
          <Text style={[type.caption, { color: colors.kicker, fontSize: 11.5, lineHeight: 16 }]}>{footnote}</Text>
        ) : null}
      </View>
      {below}
    </ChoiceCard>
  );
}

/**
 * The raised card a {@link ChoiceSection} sits in, on its own.
 *
 * <p>For fields that are not a row of chips — a picker, a board — but sit among
 * choice sections and should read as the same kind of block.
 */
export function ChoiceCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          elevation: 1,
          gap: spacing.sm,
          padding: spacing.md,
          shadowColor: colors.shadow,
          shadowOffset: { height: 3, width: 0 },
          shadowOpacity: 0.28,
          shadowRadius: 9,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Pick exactly one. */
export function ChoiceGrid<T extends string>({
  getIcon,
  getLabel,
  onSelect,
  options,
  selected,
}: {
  /** Undefined for an option that should be a word only. */
  getIcon?: (value: T) => LucideIcon | undefined;
  getLabel: (value: T) => string;
  onSelect: (value: T) => void;
  options: readonly T[];
  selected: T | null;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((option) => (
        <ChoiceChip
          icon={getIcon?.(option)}
          key={option}
          label={getLabel(option)}
          onPress={() => onSelect(option)}
          selected={option === selected}
        />
      ))}
    </View>
  );
}

/** Pick any number, including none. */
export function MultiChoiceGrid<T extends string>({
  getLabel,
  onToggle,
  options,
  selected,
}: {
  getLabel: (value: T) => string;
  onToggle: (value: T) => void;
  options: readonly T[];
  selected: readonly T[];
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {options.map((option) => (
        <ChoiceChip
          key={option}
          label={getLabel(option)}
          onPress={() => onToggle(option)}
          selected={selected.includes(option)}
        />
      ))}
    </View>
  );
}

export function ChoiceChip({
  columns = 3,
  icon: Icon,
  label,
  onPress,
  selected,
}: {
  columns?: 2 | 3;
  icon?: LucideIcon;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.inkSoft : colors.surface,
        borderColor: selected ? colors.inkSoft : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flexBasis: columns === 2 ? "46%" : "28%",
        flexDirection: "row",
        flexGrow: 1,
        flexShrink: 1,
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 48,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
      }}
    >
      {Icon ? <Icon color={selected ? colors.surface : colors.inkSoft} size={17} strokeWidth={2.3} /> : null}
      <Text
        numberOfLines={1}
        style={[
          type.caption,
          {
            color: selected ? colors.surface : colors.ink,
            fontFamily: fonts.sansBold,
            fontSize: label.length > 11 ? 10.25 : label.length > 8 ? 11.25 : 12.5,
            textAlign: "center",
          },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
