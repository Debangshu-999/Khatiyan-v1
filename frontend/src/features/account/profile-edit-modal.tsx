import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { emailProblem } from "@/features/forms/email-validation";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput } from "@/features/owner/owner-ui";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type ProfileEditField = "name" | "email";

/**
 * Edits one field of the signed-in user's profile, in the shared bottom sheet
 * (user, 2026-11-09): title, title line, then for an email the note that a new
 * one has to be verified again.
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
  const { colors, type } = useTheme();
  const toast = useToast();
  const [value, setValue] = useState(initialValue);
  const form = useFormErrors<"value">();
  const isEmail = field === "email";

  // Re-seed whenever a different field is opened; the sheet is reused, so
  // state would otherwise carry over from the previous edit.
  useEffect(() => {
    setValue(initialValue);
    form.clearAll();
  }, [field, form.clearAll, initialValue]);

  if (field === null) {
    return null;
  }

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

    // Saving an untouched field would send a request, close the sheet, and
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
    <SheetShell
      footer={<ActionButton disabled={busy || form.blocked} label={busy ? "Saving" : "Save"} onPress={() => void submit()} />}
      onClose={onClose}
      size="content"
      title={isEmail ? "Edit email" : "Edit name"}
    >
      <View style={{ gap: spacing.md }}>
        {isEmail ? (
          <Text style={[type.description, { color: colors.muted }]}>
            Changing the current email will require you to re-verify your email. We will send a verification link to
            the new email address.
          </Text>
        ) : null}
        <FormInput
          autoCapitalize={isEmail ? "none" : "words"}
          error={form.errors.value}
          keyboardType={isEmail ? "email-address" : undefined}
          label={isEmail ? "Email" : "Full name"}
          onChangeText={(next) => {
            setValue(next);
            form.clearField("value");
          }}
          placeholder={isEmail ? "you@example.com" : "Your full name"}
          required
          value={value}
        />
      </View>
      {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
    </SheetShell>
  );
}
