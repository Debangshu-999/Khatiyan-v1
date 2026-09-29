import { useState } from "react";
import {
  AppState,
  Image,
  Linking,
  NativeModules,
  Platform,
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AtSign, Check, ChevronDown, Copy, Phone, ScanLine } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { PickerOptionRow } from "@/components/picker-option-row";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { ActionButton, formatMoneyPaise } from "@/features/owner/owner-ui";
import { METHOD_ICON, METHOD_LABEL, METHOD_ORDER, type TenderMethod } from "@/features/billing/payment-methods";
import { RaiseClaimCard } from "@/features/billing/raise-claim-modal";
import type { ManualPaymentMethod } from "@/store/services/billing-api";
import {
  useStartPaymentMutation,
  type PayeeDetails,
  type PaymentIntent,
} from "@/store/services/payment-intent-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type UpiAppKey = "GOOGLE_PAY" | "PHONEPE" | "PAYTM" | "BHIM";

type UpiAppOption = {
  androidPackage: string;
  androidScheme: string;
  key: UpiAppKey;
  label: string;
  logo: ImageSourcePropType;
};

const UPI_APPS: UpiAppOption[] = [
  {
    androidPackage: "com.google.android.apps.nbu.paisa.user",
    androidScheme: "tez://upi/pay",
    key: "GOOGLE_PAY",
    label: "Gpay",
    logo: require("../../../assets/upi-apps/google-pay.jpg"),
  },
  {
    androidPackage: "com.phonepe.app",
    androidScheme: "phonepe://pay",
    key: "PHONEPE",
    label: "PhonePe",
    logo: require("../../../assets/upi-apps/phonepe.jpg"),
  },
  {
    androidPackage: "net.one97.paytm",
    androidScheme: "paytmmp://pay",
    key: "PAYTM",
    label: "Paytm",
    logo: require("../../../assets/upi-apps/paytm.jpg"),
  },
  {
    androidPackage: "in.org.npci.upiapp",
    androidScheme: "bhim://upi/pay",
    key: "BHIM",
    label: "BHIM UPI",
    logo: require("../../../assets/upi-apps/bhim-upi.jpg"),
  },
];

type UpiIntentLauncher = {
  openUpiApp: (upiUri: string, packageName: string) => Promise<boolean>;
};

const upiIntentLauncher = NativeModules.UpiIntentLauncher as UpiIntentLauncher | undefined;

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
  billVersion,
  cashOtpRequired,
  hasPayLink,
  methods,
  onClose,
  onStarted,
  payee,
  referenceCode,
}: {
  amountPaise: number;
  billingCycleId: string;
  /** The bill's version as shown (2026-09-29): one whose amount changed is refused. */
  billVersion: number;
  /** Cash needs a code sent to the tenant's phone. */
  cashOtpRequired: boolean;
  hasPayLink: boolean;
  /**
   * The ways this tenant can pay. Cash is the initial selection when offered;
   * UPI starts its claim flow after the tenant returns from the payment app.
   */
  methods: ManualPaymentMethod[];
  onClose: () => void;
  /** Fires after the tenant returns from the UPI app. */
  onStarted: (intent: PaymentIntent) => void;
  /** Null when neither UPI nor bank transfer is offered. */
  payee: PayeeDetails | null;
  referenceCode: string;
}) {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const [startPayment, startState] = useStartPaymentMutation();
  const [error, setError] = useState<string | null>(null);
  const tabs = METHOD_ORDER.filter((method) => methods.includes(method));
  const [tab, setTab] = useState<TenderMethod>(tabs[0] ?? "CASH");
  const [claimMethod, setClaimMethod] = useState<Exclude<TenderMethod, "CASH"> | null>(null);
  const [selectedUpiApp, setSelectedUpiApp] = useState<UpiAppKey>("GOOGLE_PAY");

  async function openUpiApp() {
    try {
      const started = await startPayment({ billingCycleId, version: billVersion }).unwrap();
      if (!started.upiLink) {
        setError("This property has no UPI address to open. Scan the QR code instead.");
        return;
      }

      // The server-generated URI remains the single payment payload. Only its
      // scheme/path is swapped when an app exposes a dedicated deep link; all
      // payment parameters continue to come from the backend. A rebuilt native
      // app can additionally pin the original UPI URI to an Android package.
      // The unchanged generic URI is used only as the final chooser fallback.
      const selected = UPI_APPS.find((app) => app.key === selectedUpiApp) ?? UPI_APPS[0];
      const selectedOpened = await openSelectedUpiApp(started.upiLink, selected);
      if (!selectedOpened) {
        const fallbackOpened = await Linking.canOpenURL(started.upiLink);
        if (!fallbackOpened) {
          setError(
            `${selected.label} could not be opened, and no other UPI app was found. Scan the QR code or copy the UPI address instead.`,
          );
          return;
        }
        await Linking.openURL(started.upiLink);
      }

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

  const raiseClaim = tab !== "CASH" && tab !== "UPI" ? (
    <ActionButton
      label="Raise claim"
      onPress={() => setClaimMethod(tab as Exclude<TenderMethod, "CASH">)}
    />
  ) : null;

  return (
    <SheetShell onClose={onClose} title={claimMethod ? "Raise a claim" : `Pay ${formatMoneyPaise(amountPaise)}`}>
      {claimMethod ? (
        <RaiseClaimCard
          billingCycleId={billingCycleId}
          billVersion={billVersion}
          key={claimMethod}
          method={claimMethod}
          onBack={() => setClaimMethod(null)}
          onSent={onClose}
          referenceCode={referenceCode}
        />
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            {payee?.payeeName ?? "This property"} · <Text style={{ fontFamily: fonts.mono }}>{referenceCode}</Text>
          </Text>

          {/* Only offer a choice when the property accepts multiple methods. */}
          {tabs.length > 1 ? (
            <PaymentMethodDropdown methods={tabs} onChange={setTab} value={tab} />
          ) : null}

          <View style={{ gap: spacing.md }}>
            {tab === "UPI" && payee ? (
              <UpiTab
                busy={startState.isLoading}
                hasPayLink={hasPayLink}
                onCopy={copy}
                onScanAndPay={() => void openUpiApp()}
                onSelectUpiApp={setSelectedUpiApp}
                payee={payee}
                selectedUpiApp={selectedUpiApp}
              />
            ) : tab === "BANK_TRANSFER" && payee ? (
              <BankTab onCopy={copy} payee={payee} referenceCode={referenceCode} />
            ) : tab === "CARD" ? (
              <DeskTab message="Pay by card at the desk, then raise a claim so the property can confirm it." method="CARD" />
            ) : tab === "CHEQUE" ? (
              <DeskTab message="Hand over a cheque at the desk, then raise a claim so the property can confirm it." method="CHEQUE" />
            ) : (
              <DeskTab
                message="Hand over the cash at the desk to pay your bill."
                method="CASH"
                note={cashOtpRequired ? "Verify the cash payment with an OTP that will be sent to your device." : undefined}
              />
            )}
            {raiseClaim}
          </View>
        </View>
      )}

      {error ? <AlertModal message={error} onClose={() => setError(null)} /> : null}
    </SheetShell>
  );
}

function UpiTab({
  busy,
  hasPayLink,
  onCopy,
  onScanAndPay,
  onSelectUpiApp,
  payee,
  selectedUpiApp,
}: {
  busy: boolean;
  hasPayLink: boolean;
  onCopy: (value: string, what: string) => void;
  onScanAndPay: () => void;
  onSelectUpiApp: (app: UpiAppKey) => void;
  payee: PayeeDetails;
  selectedUpiApp: UpiAppKey;
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
        <View style={{ gap: spacing.sm }}>
          <UpiAppSelector onSelect={onSelectUpiApp} selected={selectedUpiApp} />
          <ActionButton
            disabled={busy}
            icon={ScanLine}
            label={busy ? "Opening…" : "Scan and pay"}
            onPress={onScanAndPay}
          />
        </View>
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

function UpiAppSelector({
  onSelect,
  selected,
}: {
  onSelect: (app: UpiAppKey) => void;
  selected: UpiAppKey;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 12 }}>Pay with</Text>
      <ScrollView
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.xs }}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {UPI_APPS.map((app) => {
          const active = selected === app.key;
          return (
            <AnimatedPressable
              accessibilityLabel={`Pay with ${app.label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              key={app.key}
              onPress={() => onSelect(app.key)}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: active ? colors.primary : colors.border,
                borderCurve: "continuous",
                borderRadius: 13,
                borderWidth: active ? 1.5 : 1,
                gap: 5,
                minHeight: 72,
                paddingHorizontal: 7,
                paddingVertical: 7,
                position: "relative",
                width: 68,
              }}
            >
              <Image
                accessibilityIgnoresInvertColors
                accessible={false}
                resizeMode="cover"
                source={app.logo}
                style={{ borderRadius: 10, height: 38, width: 38 }}
              />
              <Text
                numberOfLines={1}
                style={{
                  color: active ? colors.primary : colors.inkSoft,
                  fontFamily: fonts.sansBold,
                  fontSize: 9.5,
                  textAlign: "center",
                }}
              >
                {app.label}
              </Text>
              {active ? (
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.primary,
                    borderRadius: 999,
                    height: 15,
                    justifyContent: "center",
                    position: "absolute",
                    right: 4,
                    top: 4,
                    width: 15,
                  }}
                >
                  <Check color={colors.onPrimary} size={9} strokeWidth={3} />
                </View>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </ScrollView>
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

function PaymentMethodDropdown({
  methods,
  onChange,
  value,
}: {
  methods: TenderMethod[];
  onChange: (method: TenderMethod) => void;
  value: TenderMethod;
}) {
  const { colors, fonts } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      <AnimatedPressable
        accessibilityLabel={`Payment method: ${METHOD_LABEL[value]}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: radii.sm,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.md,
        }}
      >
        <MaterialCommunityIcons color={colors.primary} name={METHOD_ICON[value]} size={20} />
        <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {METHOD_LABEL[value]}
        </Text>
        <ChevronDown color={colors.muted} size={18} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </AnimatedPressable>
      {open ? (
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, padding: spacing.xs }}>
          {methods.map((method) => (
            <PickerOptionRow
              icon={<MaterialCommunityIcons color={method === value ? colors.primary : colors.inkSoft} name={METHOD_ICON[method]} size={20} />}
              key={method}
              label={METHOD_LABEL[method]}
              onPress={() => {
                onChange(method);
                setOpen(false);
              }}
              selected={method === value}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A way to pay that happens at the property's desk: card, cheque or cash. Just
 * the instruction, and for cash the code step when the property wants one.
 */
function DeskTab({ message, method, note }: { message: string; method: "CASH" | "CARD" | "CHEQUE"; note?: string }) {
  const { colors, fonts, type } = useTheme();
  const title = method === "CARD" ? "Card at the desk" : method === "CHEQUE" ? "Cheque at the desk" : "Cash at the desk";
  return (
    <View
      style={{
        backgroundColor: colors.primarySoft,
        borderCurve: "continuous",
        borderRadius: radii.card,
        gap: spacing.sm,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
        <Image
          accessibilityLabel={method === "CARD" ? "Person paying at a card reader" : "Person handing payment to another person"}
          resizeMode="contain"
          source={method === "CARD"
            ? require("../../../assets/workspace/payment-card-swiper.png")
            : require("../../../assets/workspace/payment-cash-handover.png")}
          style={{ height: 100, width: 125 }}
        />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>{title}</Text>
          <Text style={[type.caption, { color: colors.inkSoft, fontSize: 13, lineHeight: 19 }]}>{message}</Text>
        </View>
      </View>
      {note ? <Text style={[type.caption, { color: colors.inkSoft, lineHeight: 18 }]}>{note}</Text> : null}
    </View>
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

async function openSelectedUpiApp(upiUri: string, app: UpiAppOption) {
  if (Platform.OS !== "android") {
    return false;
  }

  // Dedicated schemes are important during development too: they work after a
  // JavaScript refresh and do not require the newly added native module to be
  // present in the APK already installed on the device.
  const directUri = replaceUpiRoute(upiUri, app.androidScheme);
  if (directUri) {
    try {
      await Linking.openURL(directUri);
      return true;
    } catch {
      // The selected app is probably not installed. Continue to the exact
      // package launcher before allowing the normal device chooser to appear.
    }
  }

  if (!upiIntentLauncher?.openUpiApp) {
    return false;
  }

  try {
    return await upiIntentLauncher.openUpiApp(upiUri, app.androidPackage);
  } catch {
    return false;
  }
}

function replaceUpiRoute(upiUri: string, appRoute: string) {
  const queryStart = upiUri.indexOf("?");
  if (queryStart < 0) {
    return null;
  }
  return `${appRoute}${upiUri.slice(queryStart)}`;
}

function readErrorMessage(caught: unknown) {
  const data = (caught as { data?: { message?: string } } | undefined)?.data;
  return typeof data?.message === "string" ? data.message : null;
}
