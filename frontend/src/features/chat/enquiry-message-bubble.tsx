import { Text, View } from "react-native";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * "View enquiry message": a full-width row pinned under an enquiry chat's
 * header (user, 2026-10-03). Always there, whatever the chat holds, with the
 * messages scrolling beneath it. Opening it lays the question over the
 * messages rather than pushing them down. The screen owns whether it is open,
 * because the dimmed backdrop that closes it lives in the messages area.
 *
 * @param onPanelHeight how tall the open question is, so the screen can move
 *                      what sits under it out of the way
 */
export function EnquiryMessageRow({
  message,
  onPanelHeight,
  onToggle,
  open,
}: {
  message: string;
  onPanelHeight?: (height: number) => void;
  onToggle: () => void;
  open: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    // Above the message list and its backdrop, so the open panel draws over both.
    <View style={{ elevation: 6, zIndex: 10 }}>
      <AnimatedPressable
        accessibilityLabel={open ? "Hide enquiry message" : "View enquiry message"}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          alignItems: "center",
          backgroundColor: colors.neutralSoft,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
        }}
      >
        <MessageSquare color={colors.muted} size={15} strokeWidth={2.2} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13 }}>View enquiry message</Text>
        {open ? (
          <ChevronUp color={colors.muted} size={18} strokeWidth={2.4} />
        ) : (
          <ChevronDown color={colors.muted} size={18} strokeWidth={2.4} />
        )}
      </AnimatedPressable>

      {open ? (
        <View
          onLayout={(event) => onPanelHeight?.(event.nativeEvent.layout.height)}
          style={{
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            borderBottomWidth: 1,
            elevation: 6,
            left: 0,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            position: "absolute",
            right: 0,
            shadowColor: colors.shadow,
            shadowOffset: { height: 4, width: 0 },
            shadowOpacity: 0.12,
            shadowRadius: 10,
            top: "100%",
          }}
        >
          <Text style={[type.description, { color: colors.ink, fontFamily: fonts.sansSemiBold }]}>{message}</Text>
        </View>
      ) : null}
    </View>
  );
}
