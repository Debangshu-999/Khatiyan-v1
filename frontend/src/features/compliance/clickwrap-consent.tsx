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
  expanded = false,
  onToggle,
  statement,
}: {
  checked: boolean;
  /**
   * Show the declaration in full, scrolling, with the tick beneath it.
   *
   * <p>For a screen that has room. The two-line form exists because five
   * paragraphs above a button is five paragraphs nobody reads and it pushed the
   * button off the screen — neither is true on a step whose whole job is this
   * one decision, and there the summary makes somebody open a window to read
   * what they are about to agree to.
   *
   * <p>Off by default, so the owner's onboarding declaration keeps the compact
   * form it was designed for.
   */
  expanded?: boolean;
  onToggle: () => void;
  statement: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);

  if (expanded) {
    return (
      // No box of its own. This already sits inside the step's card, and a
      // second border around it drew a card inside a card — the scrollbar is
      // what says the text continues, not a frame.
      <View style={{ gap: spacing.md }}>
        {/* A fixed height, not one that grows with the text. The tick has to
            stay where it is whichever declaration is showing, and a body that
            resized with the wording would move the control under the reader's
            thumb. */}
        <ScrollView
          contentContainerStyle={{ paddingRight: spacing.sm }}
          nestedScrollEnabled
          // Kept on screen rather than fading after a moment. It is the only
          // thing telling a reader there is more declaration below the fold,
          // and a bar that has already faded tells them nothing.
          persistentScrollbar
          showsVerticalScrollIndicator
          style={{ height: 230 }}
        >
          <Text style={[type.caption, { color: colors.inkSoft, lineHeight: 20 }]}>{statement}</Text>
        </ScrollView>

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        {/* Pinned under the words it agrees to. Pressing the text scrolls it,
            pressing the box agrees — the same separation the compact form
            keeps, for the same reason. */}
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <ConsentTick checked={checked} onToggle={onToggle} />
          <Text
            onPress={onToggle}
            style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 13.5 }}
            suppressHighlighting
          >
            I have read and agree to this declaration
          </Text>
        </View>
      </View>
    );
  }

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
