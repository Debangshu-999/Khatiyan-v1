import { useRef } from "react";
import { Text, View } from "react-native";
import { AlertTriangle, BedDouble, LogOut } from "lucide-react-native";

import { CenterModal } from "@/components/center-modal";
import { ModalTitle } from "@/components/modal-title";
import { ActionButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/** A second tap of the press that opened it must not end a stay. */
const CONFIRM_ARMS_AFTER_MS = 450;

/**
 * The last word before a stay ends (user, 2026-10-31): who is leaving, the money
 * as it will settle, what happens to the bed, and that it cannot be undone. A
 * statement to read, not a list of bullets, and only what applies to this exit.
 */
export function EndTenancyConfirm({
  billedPaise,
  depositHeldPaise,
  depositPayable,
  fromDepositPaise,
  hasDeposit,
  onCancel,
  onConfirm,
  roomNumber,
  tenantName,
  waivedPaise,
}: {
  /** The early-exit charge and Other charges, recorded paid at move-out. */
  billedPaise: number;
  depositHeldPaise: number;
  depositPayable: boolean;
  fromDepositPaise: number;
  hasDeposit: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  roomNumber: string | null;
  tenantName: string;
  waivedPaise: number;
}) {
  const { colors, fonts, type } = useTheme();
  const openedAt = useRef(Date.now());
  const remainderPaise = Math.max(depositHeldPaise - fromDepositPaise, 0);
  const showsMoney = hasDeposit || billedPaise > 0 || waivedPaise > 0;

  return (
    <CenterModal navigationBarTranslucent onRequestClose={onCancel} statusBarTranslucent transparent visible>
      <View style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 420,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                borderColor: colors.danger,
                borderRadius: 999,
                borderWidth: 1.5,
                height: 44,
                justifyContent: "center",
                width: 44,
              }}
            >
              <LogOut color={colors.danger} size={20} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <ModalTitle style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 21 }}>End this tenancy?</ModalTitle>
              <Text numberOfLines={1} style={[type.caption, { color: colors.muted }]}>
                {roomNumber ? `${tenantName} · Room ${roomNumber}` : tenantName}
              </Text>
            </View>
          </View>

          {showsMoney ? (
            <View style={{ backgroundColor: colors.surfaceSunken, borderCurve: "continuous", borderRadius: radii.card, overflow: "hidden" }}>
              <View style={{ gap: spacing.xs, padding: 12 }}>
                {hasDeposit ? <Line label="Deposit held" value={formatMoneyPaise(depositHeldPaise)} /> : null}
                {fromDepositPaise > 0 ? <Line danger label="Comes off the deposit" value={`− ${formatMoneyPaise(fromDepositPaise)}`} /> : null}
                {billedPaise > 0 ? <Line label="Billed and recorded paid" value={formatMoneyPaise(billedPaise)} /> : null}
                {waivedPaise > 0 ? <Line label="Damage waived" value={formatMoneyPaise(waivedPaise)} /> : null}
              </View>
              {hasDeposit ? (
                <View
                  style={{
                    alignItems: "center",
                    borderTopColor: colors.border,
                    borderTopWidth: 1,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    padding: 12,
                  }}
                >
                  <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
                    {depositPayable ? "To refund the tenant" : "Deposit kept"}
                  </Text>
                  <Text selectable style={[type.metric, { color: colors.ink, fontSize: 19, lineHeight: 24 }]}>
                    {formatMoneyPaise(remainderPaise)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ gap: spacing.xs }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <BedDouble color={colors.muted} size={18} strokeWidth={2.2} />
              <Text style={[type.body, { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 18 }]}>
                The stay ends and the bed is freed.
              </Text>
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
              <AlertTriangle color={colors.danger} size={18} strokeWidth={2.2} />
              <Text style={{ color: colors.danger, flex: 1, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 }}>
                This cannot be undone.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ActionButton label="Cancel" onPress={onCancel} variant="secondary" />
            <ActionButton
              label="End tenancy"
              onPress={() => {
                if (Date.now() - openedAt.current >= CONFIRM_ARMS_AFTER_MS) {
                  onConfirm();
                }
              }}
              variant="dangerFilled"
            />
          </View>
        </View>
      </View>
    </CenterModal>
  );
}

function Line({ danger, label, value }: { danger?: boolean; label: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
      <Text style={[type.body, { color: colors.muted, flexShrink: 1, fontSize: 13, lineHeight: 18 }]}>{label}</Text>
      <Text selectable style={{ color: danger ? colors.danger : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 }}>{value}</Text>
    </View>
  );
}
