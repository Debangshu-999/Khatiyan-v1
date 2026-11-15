import { ModalTitleRule } from "@/components/modal-title-rule";
import { SheetCloseButton } from "@/components/help-modal-header";
import { ModalTitle } from "@/components/modal-title";
import { useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, X } from "lucide-react-native";

import { useKeyboardRoom, useRevealInputScroll } from "@/components/use-keyboard-inset";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { ActionButton, FormInput, IconButton } from "@/features/owner/owner-ui";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Writing one clause, in a sheet.
 *
 * <p>Shared by the property's agreement screen and by onboarding, which write
 * the same kind of clause and had no business each having their own idea of how
 * it is written. It was defined inside the agreement screen; onboarding grew a
 * second, worse version that appended blank inline fields instead.
 */
export function AddClauseSheet({ onAdd, onClose }: { onAdd: (heading: string, body: string) => void; onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  const { room: keyboardRoom } = useKeyboardRoom();
  // The list scrolls to the focused input with the keyboard up (user, 2026-11-08).
  const revealInput = useRevealInputScroll();
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const form = useFormErrors<"body" | "heading">();

  function submit(dismiss: (afterClose?: () => void) => void) {
    const cleared = form.validate({
      ...(heading.trim() ? {} : { heading: "Give the clause a heading." }),
      ...(body.trim() ? {} : { body: "Write the clause body." }),
    });
    if (!cleared) {
      return;
    }
    dismiss(() => onAdd(heading.trim(), body.trim()));
  }

  return (
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <>
      {/* iOS keeps the platform avoider, where it works. Android measures the
          keyboard itself and lifts the sheet by margin: "padding" there is
          broken under edge-to-edge — it infers the height from screen minus
          window, edge-to-edge makes the window the whole display, and the
          padding never returns to zero on dismissal, which left the sheet
          shoved up the screen after the keyboard closed. */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <SheetCloseButton onClose={() => dismiss()} />
          <Animated.View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              paddingBottom: keyboardRoom,
              maxHeight: "100%",
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <ModalTitle style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }} >
                New clause
              </ModalTitle>
            </View>
            <ModalTitleRule />
            <ScrollView {...revealInput}
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
                <FormInput
                  error={form.errors.heading}
                  label="Clause Heading"
                  onChangeText={(text) => {
                    setHeading(text);
                    form.clearField("heading");
                  }}
                  placeholder="e.g. Liability, Guests, Parking"
                  required
                  value={heading}
                />
                <FormInput
                  error={form.errors.body}
                  label="Clause Body"
                  multiline
                  onChangeText={(text) => {
                    setBody(text);
                    form.clearField("body");
                  }}
                  placeholder="Write the rule exactly as the tenant should read it"
                  required
                  value={body}
                />
            </ScrollView>
            {/* Fixed under the scrolling fields (user, 2026-11-01). */}
            <View style={{ flexDirection: "row", paddingTop: spacing.md }}>
              <ActionButton disabled={form.blocked} icon={Plus} label="Add clause" onPress={() => submit(dismiss)} />
            </View>
            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      </>}
    </BottomSheetModal>
  );
}
