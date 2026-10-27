import { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { MessageSquare } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { GhostIcon, GhostText } from "@/components/skeletons/boundary";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** A consistent, bounded preview on both sides of an enquiry. */
export function EnquiryMessagePreview({ message }: { message: string }) {
  const { colors, fonts, type } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  return (
    <>
      <AnimatedPressable
        accessibilityLabel="Read full enquiry message"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          alignItems: "flex-start",
          backgroundColor: colors.neutralSoft,
          borderCurve: "continuous",
          borderRadius: radii.card,
          flexDirection: "row",
          gap: spacing.sm,
          height: 84,
          overflow: "hidden",
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
        }}
      >
        <View style={{ paddingTop: 2 }}>
          <GhostIcon color={colors.muted} icon={MessageSquare} size={15} strokeWidth={2.2} />
        </View>
        <GhostText
          ellipsizeMode="tail"
          ghostWidth="85%"
          numberOfLines={Math.max(1, Math.min(3, Math.floor(60 / (20 * fontScale))))}
          style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20 }}
        >
          {message}
        </GhostText>
      </AnimatedPressable>

      {open ? (
        <SheetShell dismissOnDrag onClose={() => setOpen(false)} title="Enquiry message">
          <Text selectable style={[type.description, { color: colors.ink, fontFamily: fonts.sansMedium }]}>
            {message}
          </Text>
        </SheetShell>
      ) : null}
    </>
  );
}
