import { useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Plus, X } from "lucide-react-native";

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
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const form = useFormErrors<"body" | "heading">();

  function submit() {
    const cleared = form.validate({
      ...(heading.trim() ? {} : { heading: "Give the clause a heading." }),
      ...(body.trim() ? {} : { body: "Write the clause body." }),
    });
    if (!cleared) {
      return;
    }
    onAdd(heading.trim(), body.trim());
  }

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible>
      {/* Expo 56 Android is edge-to-edge, where adjustResize no longer resizes
          the modal window — KeyboardAvoidingView with "padding" is what lifts
          the sheet above the keyboard on BOTH platforms. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "92%",
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }} numberOfLines={1}>
                New clause
              </Text>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>
            <ScrollView
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
                <ActionButton disabled={form.blocked} icon={Plus} label="Add clause" onPress={submit} />
            </ScrollView>
            <SafeAreaView edges={["bottom"]} style={{ paddingBottom: spacing.md }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
