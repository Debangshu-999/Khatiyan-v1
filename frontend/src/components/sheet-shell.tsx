import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The app's one bottom sheet: grabber handle, serif title with a close button,
// safe-area padding and keyboard avoidance. Every modal sheet should render
// through this so they all open, pad and scroll identically.
export function SheetShell({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingBottom: Math.max(insets.bottom, spacing.md),
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
            }}
          >
            <View style={{ alignSelf: "center", backgroundColor: colors.borderStrong, borderRadius: 999, height: 4, marginBottom: spacing.sm, width: 36 }} />
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 22, fontWeight: "600" }} numberOfLines={1} selectable>
                {title}
              </Text>
              <AnimatedPressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 32,
                  justifyContent: "center",
                  width: 32,
                }}
              >
                <X color={colors.ink} size={16} strokeWidth={2.4} />
              </AnimatedPressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
