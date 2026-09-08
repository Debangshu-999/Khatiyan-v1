import { useState } from "react";
import { AppState, Image, Linking, Modal, ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { AtSign, Copy, Phone, ScanLine, X } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { useToast } from "@/components/toast";
import { ActionButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import {
  useStartPaymentMutation,
  type PayeeDetails,
  type PaymentIntent,
} from "@/store/services/payment-intent-api";
import { DIALOG_MAX_WIDTH, radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type PayTab = "upi" | "bank";

/**
 * How long to wait for a backgrounding that may never come.
 *
 * <p>Long enough that a real switch to a banking app wins the race, short
 * enough that a tenant whose phone reports nothing is not left stranded.
 */
const RETURN_FALLBACK_MS = 5_000;

/**
 * How a tenant pays a bill.
 *
 * <p>Opening this creates the payment intent, because the intent is what blocks
 * a second attempt — and the moment worth blocking from is the moment they are
 * given a way to pay, not the moment they come back and say they did.
 *
 * <p>The QR leads and the deep link sits under it. A link only works on the
 * device the app is running on, and the app that opens it is whichever one the
 * phone picked — a QR covers the tenant scanning from a second phone, and the
 * one whose banking app never came to the front.
 */
export function PayBillSheet({
  amountPaise,
  billingCycleId,
  hasPayLink,
  onClose,
  onStarted,
  payee,
  referenceCode,
}: {
  amountPaise: number;
  billingCycleId: string;
  hasPayLink: boolean;
  onClose: () => void;
  /** Fires once an intent exists, so the caller can show the decision modal. */
  onStarted: (intent: PaymentIntent) => void;
  payee: PayeeDetails;
  referenceCode: string;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [startPayment, startState] = useStartPaymentMutation();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PayTab>("upi");

  async function openUpiApp() {
    try {
      const started = await startPayment(billingCycleId).unwrap();
      if (!started.upiLink) {
        setError("This property has no UPI address to open. Scan the QR code instead.");
        return;
      }

      // The intent exists before the app leaves. If we opened the link first and
      // the tenant never came back, there would be nothing recording that they
      // were handed a way to pay.
      const opened = await Linking.canOpenURL(started.upiLink);
      if (!opened) {
        setError("No UPI app was found on this phone. Scan the QR code instead.");
        return;
      }
      await Linking.openURL(started.upiLink);

      // Wait for the app to come back rather than asking straight away.
      //
      // We cannot know what happened in the banking app — `upi://pay` returns
      // its result through Android's startActivityForResult, which Linking does
      // not use, so no outcome ever reaches us. What we can observe is the
      // return itself, and that is the right moment to ask: firing the question
      // immediately would leave it stacked up behind the UPI app, arriving as a
      // modal the tenant never saw open.
      //
      // If the app is killed instead of switched away, this never fires — and
      // that case needs nothing, because the intent stays CREATED and the bill
      // asks again next time they open it.
      waitForReturn(() => onStarted(started.intent));
    } catch (caught) {
      setError(readErrorMessage(caught) ?? "Could not start the payment. Try again.");
    }
  }

  async function copy(value: string, what: string) {
    await Clipboard.setStringAsync(value);
    toast.success(`${what} copied.`);
  }

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      {/* Centred, not a bottom sheet. This is a dialog you read — a QR to scan
          and details to copy — rather than a form you fill in, and it carries no
          text input, so it needs none of the keyboard handling a sheet exists to
          provide. */}
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
            gap: spacing.md,
            maxHeight: "88%",
            maxWidth: DIALOG_MAX_WIDTH,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20 }}>
                Pay {formatMoneyPaise(amountPaise)}
              </Text>
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                {payee.payeeName ?? "This property"} · <Text style={{ fontFamily: fonts.mono }}>{referenceCode}</Text>
              </Text>
            </View>
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

          {/* Only when there is a second thing to choose. A chooser offering one
              option reads as something that failed to load. */}
          {payee.hasBankDetails ? (
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              <PayTabBubble active={tab === "upi"} label="UPI" onPress={() => setTab("upi")} />
              <PayTabBubble active={tab === "bank"} label="Bank" onPress={() => setTab("bank")} />
            </View>
          ) : null}

          {/* The body scrolls, the title and close do not. A QR plus copy rows
              can outgrow a short phone, and a dialog whose close has scrolled
              out of reach is stuck. */}
          <ScrollView
            contentContainerStyle={{ gap: spacing.md }}
            showsVerticalScrollIndicator={false}
            style={{ flexGrow: 0, flexShrink: 1 }}
          >
            {tab === "upi" ? (
              <UpiTab
                busy={startState.isLoading}
                hasPayLink={hasPayLink}
                onCopy={copy}
                onScanAndPay={() => void openUpiApp()}
                payee={payee}
              />
            ) : (
              <BankTab onCopy={copy} payee={payee} referenceCode={referenceCode} />
            )}
          </ScrollView>
        </View>
      </View>

      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </Modal>
  );
}

function UpiTab({
  busy,
  hasPayLink,
  onCopy,
  onScanAndPay,
  payee,
}: {
  busy: boolean;
  hasPayLink: boolean;
  onCopy: (value: string, what: string) => void;
  onScanAndPay: () => void;
  payee: PayeeDetails;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      {payee.upiQrImageUrl ? (
        <View
          style={{
            alignItems: "center",
            borderColor: colors.border,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: 1,
            gap: spacing.sm,
            padding: spacing.md,
          }}
        >
          <Image
            accessibilityLabel="UPI QR code"
            resizeMode="contain"
            source={{ uri: payee.upiQrImageUrl }}
            style={{ backgroundColor: colors.surface, borderRadius: 8, height: 190, width: 190 }}
          />
          <Text style={[type.caption, { color: colors.muted, lineHeight: 17, textAlign: "center" }]}>
            {hasPayLink
              ? "Scan from another phone, or tap below to pay on this one."
              : "Scan this with any UPI app to pay."}
          </Text>
        </View>
      ) : null}

      {/* Hidden without an address: there is no link to fire, and a button that
          cannot do anything is worse than no button. */}
      {hasPayLink ? (
        <ActionButton
          disabled={busy}
          icon={ScanLine}
          label={busy ? "Opening…" : "Scan and pay"}
          onPress={onScanAndPay}
        />
      ) : null}

      {payee.upiVpa || payee.upiPhone ? (
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1 }}>
          {payee.upiVpa ? (
            <CopyRow icon={AtSign} label="UPI address" onCopy={onCopy} value={payee.upiVpa} />
          ) : null}
          {payee.upiPhone ? (
            <CopyRow icon={Phone} label="UPI number" onCopy={onCopy} value={payee.upiPhone} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function BankTab({
  onCopy,
  payee,
  referenceCode,
}: {
  onCopy: (value: string, what: string) => void;
  payee: PayeeDetails;
  referenceCode: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={{
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        {payee.bankAccountHolder ? (
          <View style={{ gap: 2 }}>
            <Text style={[type.caption, { color: colors.muted }]}>Account holder</Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
              {payee.bankAccountHolder}
            </Text>
          </View>
        ) : null}
        <CopyRow label="Account number" onCopy={onCopy} value={payee.bankAccountNumber ?? "-"} />
        <CopyRow label="IFSC" onCopy={onCopy} value={payee.bankIfsc ?? "-"} />
      </View>

      {/* A bank transfer carries no note of its own, unlike the UPI link. Without
          this the owner gets an unlabelled credit and cannot match it to a bill. */}
      <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
        Add <Text style={{ fontFamily: fonts.mono }}>{referenceCode}</Text> as the transfer reference so they can find
        your payment.
      </Text>
    </View>
  );
}

function CopyRow({
  icon: Icon,
  label,
  onCopy,
  value,
}: {
  icon?: typeof AtSign;
  label: string;
  onCopy: (value: string, what: string) => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs }}>
      {Icon ? <Icon color={colors.muted} size={16} strokeWidth={2.2} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.mono, fontSize: 14 }}>
          {value}
        </Text>
      </View>
      <AnimatedPressable
        accessibilityLabel={`Copy ${label.toLowerCase()}`}
        accessibilityRole="button"
        hitSlop={10}
        onPress={() => onCopy(value, label)}
      >
        <Copy color={colors.primary} size={17} strokeWidth={2.2} />
      </AnimatedPressable>
    </View>
  );
}

function PayTabBubble({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : "transparent",
        borderColor: active ? colors.primary : colors.borderStrong,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.muted, fontFamily: fonts.sansBold, fontSize: 13 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * Runs {@code onReturn} the next time the app is foregrounded.
 *
 * <p>
 * One shot: the subscription removes itself, so a tenant who switches apps
 * again later is not asked a second time about the same attempt.
 *
 * <p>
 * The state has to leave "active" first. Firing the link does not always
 * background the app instantly, and without that guard the very first event —
 * which can be "active" again a frame later — would count as the return.
 */
function waitForReturn(onReturn: () => void) {
  let leftForeground = false;

  const subscription = AppState.addEventListener("change", (next) => {
    if (next !== "active") {
      leftForeground = true;
      return;
    }
    if (leftForeground) {
      subscription.remove();
      onReturn();
    }
  });

  // A safety net for the phone that never reports a background state at all —
  // some launchers and some web contexts do not. Without it the tenant would be
  // left with a bill that looks paid-in-progress and no way to say so.
  setTimeout(() => {
    if (!leftForeground) {
      subscription.remove();
      onReturn();
    }
  }, RETURN_FALLBACK_MS);
}

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}
