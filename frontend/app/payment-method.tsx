import { useEffect, useState, type ComponentType } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  CreditCard,
  QrCode,
  Smartphone,
  Wallet,
  type LucideProps,
} from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { useAppSelector } from "@/store/hooks";
import { useCreatePaymentOrderMutation } from "@/store/services/payment-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type CheckoutMethod = "upi" | "card" | "netbanking" | "wallet";

type MethodOption = {
  id: string;
  label: string;
  sublabel: string;
  icon: ComponentType<LucideProps>;
  method: CheckoutMethod;
};

// Data-driven option list. Selecting any option opens Razorpay Checkout
// pre-focused on the chosen method (where the account has it enabled). The
// real method used is recorded from the payment webhook.
const SECTIONS: { title: string; options: MethodOption[] }[] = [
  {
    title: "UPI",
    options: [
      { id: "gpay", label: "Google Pay", sublabel: "UPI", icon: Smartphone, method: "upi" },
      { id: "phonepe", label: "PhonePe", sublabel: "UPI", icon: Smartphone, method: "upi" },
      { id: "paytm", label: "Paytm", sublabel: "UPI", icon: Smartphone, method: "upi" },
      { id: "upi-other", label: "Other UPI app / UPI ID", sublabel: "UPI", icon: QrCode, method: "upi" },
    ],
  },
  {
    title: "Cards",
    options: [{ id: "card", label: "Credit / Debit card", sublabel: "Visa, Mastercard, RuPay", icon: CreditCard, method: "card" }],
  },
  {
    title: "More options",
    options: [
      { id: "netbanking", label: "Net banking", sublabel: "All major banks", icon: Building2, method: "netbanking" },
      { id: "wallet", label: "Wallets", sublabel: "Paytm, Mobikwik and more", icon: Wallet, method: "wallet" },
    ],
  },
];

function normalizedBaseUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function newIdempotencyKey(cycleId: string) {
  return `pay-${cycleId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatMoney(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(paise / 100);
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "data" in error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  }
  return "Could not start payment. Please try again.";
}

export default function PaymentMethodScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const params = useLocalSearchParams<{ billingCycleId?: string; amountPaise?: string }>();
  const apiBaseUrl = useAppSelector((state) => state.appConfig.apiBaseUrl);
  const [createPaymentOrder] = useCreatePaymentOrderMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  const billingCycleId = params.billingCycleId ?? "";
  const amountPaise = Number(params.amountPaise ?? "0");

  useEffect(() => {
    if (!status) {
      return;
    }
    const timeoutId = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timeoutId);
  }, [status]);

  async function handleSelect(option: MethodOption) {
    if (!billingCycleId || busyId) {
      return;
    }
    setBusyId(option.id);
    setStatus(null);
    try {
      const order = await createPaymentOrder({
        billingCycleId,
        idempotencyKey: newIdempotencyKey(billingCycleId),
      }).unwrap();
      await Linking.openURL(
        `${normalizedBaseUrl(apiBaseUrl)}/api/v1/payments/checkout/${order.id}?method=${option.method}`,
      );
      setStatus({ text: "Payment checkout opened in your browser. Complete it, then return and pull to refresh.", error: false });
    } catch (error) {
      setStatus({ text: errorMessage(error), error: true });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
        <AnimatedPressable
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={{
            alignItems: "center",
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
        </AnimatedPressable>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
            Amount payable
          </Text>
          <Text
            style={{ color: colors.ink, fontFamily: fonts.mono, fontSize: 20, fontWeight: "800" }}
            selectable
          >
            {formatMoney(amountPaise)}
          </Text>
        </View>
      </View>

      <Text
        style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 28, fontWeight: "500", letterSpacing: -0.4 }}
        selectable
      >
        Choose a{" "}
        <Text style={{ color: colors.primary, fontStyle: "italic", fontWeight: "400" }} selectable>
          payment method.
        </Text>
      </Text>

      {status ? (
        <Card tone="sunken">
          <Text style={[type.body, { color: status.error ? colors.danger : colors.primary, fontWeight: "800" }]} selectable>
            {status.text}
          </Text>
        </Card>
      ) : null}

      {SECTIONS.map((section) => (
        <Section key={section.title} eyebrow="Pay with" title={section.title}>
          {section.options.map((option) => (
            <MethodRow
              key={option.id}
              option={option}
              busy={busyId === option.id}
              disabled={Boolean(busyId) && busyId !== option.id}
              onPress={() => void handleSelect(option)}
            />
          ))}
        </Section>
      ))}

      <Text style={[type.caption, { color: colors.kicker }]} selectable>
        Payments are processed securely by Razorpay. Available methods depend on what is enabled for the property's account.
      </Text>
    </ScreenScrollView>
  );
}

function MethodRow({
  option,
  busy,
  disabled,
  onPress,
}: {
  option: MethodOption;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  const Icon = option.icon;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Pay with ${option.label}`}
      onPress={disabled ? () => {} : onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        opacity: disabled ? 0.5 : 1,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.primarySoft,
          borderRadius: 10,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <Icon color={colors.primary} size={20} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
          {option.label}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]} selectable>
          {option.sublabel}
        </Text>
      </View>
      {busy ? <ActivityIndicator color={colors.primary} /> : <ChevronRight color={colors.kicker} size={18} />}
    </AnimatedPressable>
  );
}
