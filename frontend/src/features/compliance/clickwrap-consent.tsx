import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Check, Expand, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// The click-wrap block, shared by the owner's ID declaration at onboarding and
// the tenant's agreement acceptance. Two consents with the same shape and the
// same trap to avoid, so they are one component rather than two that drift.

/**
 * A declaration in two lines, with the whole of it one tap away.
 *
 * <p>The full wording runs to five paragraphs, because it has to — it allocates
 * a statutory duty and disclaims a platform's role. Five paragraphs above a
 * button is five paragraphs nobody reads, and expanding them inline pushed the
 * button they gate off the screen. So the card stays two lines and the text
 * opens in a window of its own.
 *
 * <p>The window is for READING only. Agreeing happens on the card, in one
 * place, so there is a single control that means "I make this declaration"
 * rather than two that have to be kept in step.
 */
export function ClickwrapConsent({
  checked,
  onToggle,
  statement,
}: {
  checked: boolean;
  onToggle: () => void;
  statement: string;
}) {
  const { colors, type } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: checked ? colors.jade : colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      {/* Pressing the text opens it; pressing the box agrees to it. Making the
          whole block one press meant tapping to READ was tapping to AGREE. */}
      <ConsentTick checked={checked} onToggle={onToggle} />

      <AnimatedPressable
        accessibilityHint="Opens the full declaration"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{ flex: 1 }}
      >
        <Text numberOfLines={2} style={[type.caption, { color: colors.inkSoft, lineHeight: 19 }]}>
          {statement}
        </Text>
      </AnimatedPressable>

      <AnimatedPressable
        accessibilityLabel="Read the full declaration"
        accessibilityRole="button"
        hitSlop={10}
        onPress={() => setOpen(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceSunken,
          borderRadius: 8,
          height: 26,
          justifyContent: "center",
          width: 26,
        }}
      >
        <Expand color={colors.inkSoft} size={13} strokeWidth={2.4} />
      </AnimatedPressable>

      {open ? (
        <FullDeclarationModal onClose={() => setOpen(false)} statement={statement} />
      ) : null}
    </View>
  );
}

/** The box itself, shared by the card and the window so they cannot diverge. */
export function ConsentTick({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  const { colors } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel="I make this declaration"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={8}
      onPress={onToggle}
      style={{
        alignItems: "center",
        backgroundColor: checked ? colors.jade : "transparent",
        borderColor: checked ? colors.jade : colors.borderStrong,
        borderRadius: 6,
        borderWidth: 2,
        height: 22,
        justifyContent: "center",
        marginTop: 2,
        width: 22,
      }}
    >
      {checked ? <Check color="#FFFFFF" size={14} strokeWidth={3} /> : null}
    </AnimatedPressable>
  );
}

/**
 * The declaration at full length, in a window of a fixed size.
 *
 * <p>Centred and height-capped rather than growing with the text, so the frame
 * is the same whichever declaration it is showing and the words scroll inside
 * it. Read-only: the tick lives on the card.
 */
export function FullDeclarationModal({
  onClose,
  statement,
}: {
  onClose: () => void;
  statement: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            maxHeight: "72%",
            maxWidth: 460,
            width: "100%",
          }}
        >
          <View
            style={{
              alignItems: "center",
              borderBottomColor: colors.border,
              borderBottomWidth: 1,
              flexDirection: "row",
              gap: spacing.sm,
              padding: spacing.md,
            }}
          >
            <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.display, fontSize: 17 }}>
              Declaration
            </Text>
            <AnimatedPressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceSunken,
                borderRadius: 999,
                height: 28,
                justifyContent: "center",
                width: 28,
              }}
            >
              <X color={colors.inkSoft} size={15} strokeWidth={2.4} />
            </AnimatedPressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: spacing.md }}
            showsVerticalScrollIndicator
            style={{ flexShrink: 1 }}
          >
            <Text selectable style={[type.body, { color: colors.inkSoft, fontSize: 14, lineHeight: 21 }]}>
              {statement}
            </Text>
          </ScrollView>

        </View>
      </View>
    </Modal>
  );
}
