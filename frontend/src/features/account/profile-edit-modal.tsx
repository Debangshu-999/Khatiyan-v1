import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { emailProblem } from "@/features/forms/email-validation";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AlertModal } from "@/components/alert-modal";
import { AppTextInput } from "@/components/app-text-input";
import { Card } from "@/components/card";
import { FieldError } from "@/components/field-error";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type ProfileEditField = "name" | "email";


/**
 * Edits one field of the signed-in user's profile.
 *
 * <p>Lives beside the profile rather than inside settings: the name and email
 * are shown on the profile screen, and an edit affordance belongs next to the
 * value it changes, not one screen away from it.
 */
export function ProfileEditModal({
  busy,
  field,
  initialValue,
  onClose,
  onSave,
}: {
  busy: boolean;
  field: ProfileEditField | null;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [value, setValue] = useState(initialValue);
  const form = useFormErrors<"value">();
  const isEmail = field === "email";

  // Re-seed whenever a different field is opened; the modal is mounted once and
  // reused, so state would otherwise carry over from the previous edit.
  useEffect(() => {
    setValue(initialValue);
    form.clearAll();
  }, [field, form.clearAll, initialValue]);

  async function submit() {
    const trimmed = value.trim();
    const problem = isEmail
      ? emailProblem(trimmed, "Enter an email address.")
      : trimmed.length < 2
        ? "Enter your full name."
        : null;
    if (!form.validate(problem ? { value: problem } : {})) {
      return;
    }

    // Saving an untouched field would send a request, close the modal, and
    // report success for a change nobody made. Say so and stay put.
    if (isUnchanged({ value: initialValue }, { value: trimmed })) {
      toast.warning("No changes have been made.");
      return;
    }

    try {
      await onSave(trimmed);
    } catch (submitError) {
      form.failFromServer(errorMessage(submitError) || "Something went wrong. Try again.");
    }
  }

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent transparent visible={field !== null}>
      {/* A plain dim, not a blur.
          expo-blur can only blur content inside a BlurTargetView that the
          BlurView itself sits within. A React Native Modal renders in its own
          window on Android, so it can never be inside the screen's target — the
          blur silently fell back to a semi-transparent view and, once a method
          was named, warned about the missing target. Web blurred, Android did
          not, and the two never agreed. colors.overlay is what every other modal
          in the app uses: identical on both platforms and instant. */}
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.overlay,
          flex: 1,
          justifyContent: "center",
          padding: spacing.lg,
        }}
      >
        <KeyboardAvoidingView behavior="padding" style={{ maxWidth: 520, width: "100%" }}>
          <Card style={{ borderRadius: 18, gap: spacing.md }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22 }}>
                {isEmail ? "Edit email" : "Edit name"}
              </Text>
              <AnimatedPressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={onClose}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: 10,
                  borderWidth: 1,
                  height: 36,
                  justifyContent: "center",
                  width: 36,
                }}
              >
                <X color={colors.ink} size={18} strokeWidth={2.2} />
              </AnimatedPressable>
            </View>

            <AppTextInput
              autoCapitalize={isEmail ? "none" : "words"}
              autoCorrect={false}
              keyboardType={isEmail ? "email-address" : "default"}
              onChangeText={(next) => {
                setValue(next);
                form.clearField("value");
              }}
              placeholder={isEmail ? "you@example.com" : "Your full name"}
              style={{
                backgroundColor: colors.surfaceRaised,
                borderColor: form.errors.value ? colors.danger : colors.borderStrong,
                borderRadius: 12,
                borderWidth: 1,
                color: colors.ink,
                fontFamily: fonts.sans,
                fontSize: 16,
                minHeight: 52,
                paddingHorizontal: spacing.md,
              }}
              value={value}
            />

            {isEmail ? (
              <Text style={[type.caption, { color: colors.muted }]}>
                Changing this sends a fresh verification link.
              </Text>
            ) : null}

            <FieldError message={form.errors.value} />

            <AnimatedPressable
              onPress={busy || form.blocked ? undefined : () => void submit()}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 12,
                justifyContent: "center",
                minHeight: 52,
                padding: spacing.md,
              }}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 14 }}>Save</Text>
              )}
            </AnimatedPressable>
            <SafeAreaView edges={["bottom"]} />
          </Card>
          {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
