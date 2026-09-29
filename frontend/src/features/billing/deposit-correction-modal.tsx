import { useState } from "react";
import { Modal, Text, View } from "react-native";

import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, formatMoneyPaise, rupeesToPaise } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export type CorrectionMode = "add" | "deduct";

/**
 * Add to or deduct from a deposit, with a reason.
 *
 * <p>Shared by the Deposit manager and the deposit sheet on the end-tenancy
 * screen (2026-09-28), so a correction made while ending a stay is the same
 * correction, on the same ledger, as one made from the manager.
 */
export function DepositCorrectionModal({
  balancePaise,
  mode,
  onCancel,
  onSubmit,
}: {
  balancePaise: number;
  mode: CorrectionMode;
  onCancel: () => void;
  onSubmit: (amountPaise: number, reason: string) => Promise<void>;
}) {
  const { colors, fonts, type } = useTheme();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const form = useFormErrors<"amount" | "reason">();
  const isAdd = mode === "add";

  async function handleSubmit() {
    const amountPaise = rupeesToPaise(amount);
    const cleared = form.validate({
      ...(amountPaise == null || amountPaise <= 0
        ? { amount: "Enter an amount greater than zero." }
        : !isAdd && amountPaise > balancePaise
          ? { amount: "Deduction cannot exceed the current balance." }
          : {}),
      ...(reason.trim() ? {} : { reason: "Add a short reason for this change." }),
    });
    if (!cleared || amountPaise == null) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(amountPaise, reason.trim());
    } catch (caught) {
      form.failFromServer(errorMessage(caught) || "Could not save this deposit change. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal animationType="fade" navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 440,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21, }}>
            {isAdd ? "Add to deposit" : "Deduct from deposit"}
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            Current balance {formatMoneyPaise(balancePaise)}
          </Text>

          <FormInput
            error={form.errors.amount}
            keyboardType="decimal-pad"
            label="Amount"
            onChangeText={(next) => {
              setAmount(next);
              form.clearField("amount");
            }}
            placeholder="0"
            prefix="₹"
            required
            value={amount}
          />
          <FormInput
            error={form.errors.reason}
            label="Reason"
            maxLength={300}
            multiline
            onChangeText={(next) => {
              setReason(next);
              form.clearField("reason");
            }}
            placeholder={isAdd ? "Top-up reason" : "Deduction reason"}
            required
            value={reason}
          />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton disabled={submitting} label="Cancel" onPress={onCancel} variant="secondary" />
            <ActionButton disabled={submitting || form.blocked} label={isAdd ? "Add" : "Deduct"} onPress={() => void handleSubmit()} variant={isAdd ? "primary" : "danger"} />
          </View>
          {form.serverError ? <AlertModal message={form.serverError} onClose={form.dismissServerError} /> : null}
        </View>
      </View>
    </Modal>
  );
}
