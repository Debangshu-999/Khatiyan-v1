import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { openDialer } from "@/lib/dial";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronRight, Info, MessageCircle, Phone, Settings } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { useGetManagedTenancyDepositQuery } from "@/store/services/billing-api";
import { useAppSelector } from "@/store/hooks";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerActiveTenancyDetailScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{
    billingStarted?: string;
    billingType?: string;
    dailyRatePaise?: string;
    depositAmountPaise?: string;
    plannedEndDate?: string;
    referenceCode?: string;
    rentAmountPaise?: string;
    roomLabel?: string;
    startDate?: string;
    status?: string;
    tenantName?: string;
    tenantPhone?: string;
    tenantPhoneVerified?: string;
    tenantProfileCompleted?: string;
    tenancyId?: string;
    userId?: string;
  }>();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  // Both refusals here happen on tap, with nothing on screen to correct.
  const opErrors = useFormErrors<never>();
  const tenantName = stringParam(params.tenantName) || "Unnamed tenant";
  const tenantPhone = stringParam(params.tenantPhone);
  const roomLabel = stringParam(params.roomLabel) || "-";
  const rentAmountPaise = numberParam(params.rentAmountPaise);
  const dailyRatePaise = numberParam(params.dailyRatePaise);
  const depositAmountPaise = numberParam(params.depositAmountPaise);
  const billingType = stringParam(params.billingType) || "-";
  const billingAmount = billingType === "DAILY" ? dailyRatePaise ?? rentAmountPaise : rentAmountPaise ?? dailyRatePaise;
  const tenancyId = stringParam(params.tenancyId);

  // A deposit account is only created once the tenant's first cycle is paid, so
  // its presence is our "first cycle paid" signal. Until then we hold back the
  // amount and show UNPAID.
  // Daily stays are billed per night and never carry a security deposit, so the
  // deposit ledger does not apply to them.
  // Read from the tenancy record rather than threaded through as more route
  // params: whether a stay is fixed-term, and the date it ends, are exactly the
  // fields a stale param would get wrong — and the caller had neither.
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const tenanciesQuery = useListPropertyTenanciesQuery(
    { includePast: true, propertyId: selectedPropertyId ?? "" },
    { skip: !selectedPropertyId },
  );
  const tenancy = tenanciesQuery.data?.find((item) => item.id === tenancyId) ?? null;

  // Only a fixed term has an end date to state. An indefinite stay runs until
  // somebody gives notice, so both fields stay blank rather than inventing a
  // date from a notice period that has not been served.
  const fixedTerm = Boolean(tenancy?.fixedTerm);
  const agreedEndDate = fixedTerm ? tenancy?.endDate ?? tenancy?.agreementEndDate ?? null : null;
  const stayStartDate = tenancy?.startDate ?? (stringParam(params.startDate) || null);

  const depositEligible = billingType !== "DAILY";
  const depositQuery = useGetManagedTenancyDepositQuery(tenancyId, { skip: !tenancyId || !depositEligible });
  const depositAccount = depositQuery.data;
  const firstCyclePaid = Boolean(depositAccount);
  const securityValue = !depositEligible
    ? "Not eligible"
    : depositQuery.isLoading
      ? "…"
      : firstCyclePaid
        ? formatMoney(depositAccount?.currentBalancePaise ?? depositAmountPaise)
        : "UNPAID";

  function openDepositManager() {
    if (!tenancyId) {
      opErrors.failFromServer("This tenancy has no deposit ledger yet.");
      return;
    }
    router.push({ params: { tenancyId }, pathname: "/owner-deposit-manager" });
  }

  async function handleCall() {
    if (!tenantPhone) {
      opErrors.failFromServer("No phone number available for this tenant.");
      return;
    }
    openDialer(tenantPhone);
  }

  function handleChat() {
    toast.info("Chat will be enabled later.");
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        // Nested under the tenancy workspace, so the eyebrow names the parent
        // and carries the inline arrow — the same shape as the agreement screen
        // reached from the same list. It had an eyebrow but no `onBack`, which
        // is what left it with no back control at all.
        eyebrow="Tenancy"
        onBack={() => router.back()}
        title="Tenant"
        italicTail="profile."
        subtitle="Stay, rent and contact details for this tenant."
        trailing={
          <HeaderIconButton label="Settings" onPress={() => toast.info("Tenant settings are not available yet.")} />
        }
      />

      <View style={{ alignItems: "center", gap: spacing.md }}>
        <InitialsAvatar name={tenantName} />
        <View style={{ alignItems: "center", gap: spacing.xxs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 20, }}>
            {tenantName}
          </Text>
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            {params.referenceCode ?? "-"} {roomLabel !== "-" ? `(${roomLabel})` : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, width: "100%" }}>
          <ProfileActionButton icon={Phone} label="Call now" onPress={handleCall} primary />
          <ProfileActionButton icon={MessageCircle} label="Chat" onPress={handleChat} />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Rent details" />
        <Card style={{ padding: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ProfileInfoBox label="Start date" value={formatDate(stringParam(params.startDate))} />
            <ProfileInfoBox label="Room" value={roomLabel} />
          </View>
          {/* Blank for an indefinite agreement, on purpose — see above. */}
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ProfileInfoBox label="End date" value={fixedTerm ? formatDate(agreedEndDate) : "-"} />
            <ProfileInfoBox label="Stay duration" value={fixedTerm ? formatDuration(stayStartDate, agreedEndDate) : "-"} />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ProfileInfoBox label={billingType === "DAILY" ? "Daily rent" : "Monthly rent"} value={formatMoney(billingAmount)} />
            <ProfileInfoBox
              accent={!depositEligible || firstCyclePaid ? "default" : "danger"}
              // Names what it opens. The box is a doorway into the deposit
              // ledger, not a standalone figure — and every other screen calls
              // that the deposit account.
              label="Deposit account"
              value={securityValue}
              {...(depositEligible
                ? { onPress: openDepositManager }
                : {
                    onInfoPress: () =>
                      toast.info("Daily tenancies are billed per night and do not carry a refundable security deposit."),
                  })}
            />
          </View>
        </Card>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Tenant details" />
        <Card style={{ gap: spacing.sm, padding: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <ProfileInfoBox label="Phone verified" value={params.tenantPhoneVerified === "true" ? "Verified" : "Pending"} />
            <ProfileInfoBox label="Document verified" value="Pending" />
          </View>
          <ReadonlyField label="Tenant name" value={tenantName} />
          <ReadonlyField label="Phone" value={tenantPhone || "-"} />
          <ReadonlyField label="Tenant ID" value={stringParam(params.referenceCode) || shortId(stringParam(params.tenancyId))} mono />
          <ReadonlyField label="User ID" value={shortId(stringParam(params.userId))} mono />
          <ReadonlyField label="Profile completion" value={params.tenantProfileCompleted === "true" ? "Complete" : "Basic"} />
        </Card>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Tenancy details" />
        <Card style={{ gap: spacing.sm, padding: spacing.md }}>
          <ReadonlyField label="Tenancy status" value={humanizeToken(stringParam(params.status) || "-")} />
          <ReadonlyField label="Billing type" value={humanizeToken(billingType)} />
          <ReadonlyField label="Billing started" value={params.billingStarted === "true" ? "Yes" : "No"} />
          <ReadonlyField label="Planned checkout" value={formatDate(stringParam(params.plannedEndDate))} />
          <ReadonlyField label="Internal tenancy ID" value={shortId(stringParam(params.tenancyId))} mono />
        </Card>
      </View>
      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
    </ScreenScrollView>
  );
}

function HeaderIconButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 22,
        borderWidth: 1,
        height: 44,
        justifyContent: "center",
        width: 44,
      }}
    >
      <Settings color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function InitialsAvatar({ name }: { name: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      // No fill, and the same 40px initials as the owner profile. The tinted
      // disc made the tenant avatar read as a placeholder next to the owner's.
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 54,
        borderWidth: 1,
        height: 108,
        justifyContent: "center",
        overflow: "hidden",
        width: 108,
      }}
    >
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 40, letterSpacing: 0.5 }}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

function ProfileActionButton({
  icon: Icon,
  label,
  onPress,
  primary,
}: {
  icon: typeof Phone;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: primary ? colors.primary : colors.ink,
        borderRadius: 12,
        flex: 1,
        flexDirection: "row",
        gap: spacing.sm,
        justifyContent: "center",
        minHeight: 48,
      }}
    >
      <Icon color={primary ? colors.onPrimary : colors.surface} size={16} strokeWidth={2.2} />
      <Text style={{ color: primary ? colors.onPrimary : colors.surface, fontFamily: fonts.sansBold, fontSize: 14, }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * Section heading for this screen.
 *
 * <p>Delegates to the shared {@link Section}, exactly as the owner profile
 * does. This screen kept drawing a lone terracotta line of bold sans after the
 * owner side had moved on, which left the two profiles — the same kind of
 * screen, reached from the same app — looking like different products.
 */
function SectionTitle({ title }: { title: string }) {
  return <Section title={title} />;
}

function ProfileInfoBox({
  accent = "default",
  label,
  onInfoPress,
  onPress,
  value,
}: {
  accent?: "default" | "danger" | "primary";
  label: string;
  onInfoPress?: () => void;
  onPress?: () => void;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const valueColor = accent === "danger" ? colors.danger : accent === "primary" ? colors.primary : colors.ink;
  const style = {
    backgroundColor: colors.surfaceRaised,
    borderColor: onPress ? colors.primary : colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  } as const;
  const body = (
    <>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs, justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.inkSoft, fontWeight: "700" }]}>
          {label}
        </Text>
        {onPress ? <ChevronRight color={colors.primary} size={15} strokeWidth={2.2} /> : null}
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <Text
          style={{ color: valueColor, flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 15, }}
          numberOfLines={1}
        >
          {value}
        </Text>
        {onInfoPress ? (
          <AnimatedPressable accessibilityLabel="Why" accessibilityRole="button" hitSlop={10} onPress={onInfoPress}>
            <Info color={colors.muted} size={15} strokeWidth={2.2} />
          </AnimatedPressable>
        ) : null}
      </View>
    </>
  );

  return onPress ? (
    <AnimatedPressable accessibilityRole="button" onPress={onPress} style={style}>
      {body}
    </AnimatedPressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

function ReadonlyField({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "900", letterSpacing: 0.2 }]}>
        {label}
      </Text>
      <View style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 46, paddingHorizontal: spacing.md }}>
        <Text style={{ color: colors.ink, fontFamily: mono ? fonts.mono : fonts.sans, fontSize: 15, fontWeight: "700" }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length ? parts : ["Khatiyan", "User"])
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function numberParam(value: string | string[] | undefined) {
  const raw = stringParam(value);
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function shortId(value: string) {
  return value ? value.slice(0, 8).toUpperCase() : "-";
}

function humanizeToken(value: string) {
  if (!value || value === "-") {
    return "-";
  }
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(value?: number | null) {
  if (value == null) {
    return "Not set";
  }
  return `₹${Math.round(value / 100).toLocaleString("en-IN")}`;
}

/**
 * Span between two dates, as someone would say it: "6 months", "1 year 2 months",
 * "3 months 12 days".
 *
 * <p>Calendar months, not 30-day blocks — a stay from the 5th of one month to
 * the 5th of the next is one month whatever its length, and dividing by 30
 * would report it as "1 month 1 day" for the long ones.
 */
function formatDuration(start?: string | null, end?: string | null) {
  if (!start || !end) {
    return "-";
  }
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return "-";
  }

  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  // Borrow a month when the day-of-month has not come round yet, then count the
  // leftover days from that borrowed anniversary.
  const anniversary = new Date(from);
  anniversary.setMonth(from.getMonth() + months);
  if (anniversary > to) {
    months -= 1;
    anniversary.setMonth(anniversary.getMonth() - 1);
  }
  const days = Math.round((to.getTime() - anniversary.getTime()) / 86_400_000);

  const parts: string[] = [];
  const years = Math.floor(months / 12);
  const monthsLeft = months % 12;
  if (years > 0) {
    parts.push(`${years} year${years === 1 ? "" : "s"}`);
  }
  if (monthsLeft > 0) {
    parts.push(`${monthsLeft} month${monthsLeft === 1 ? "" : "s"}`);
  }
  // Days only matter when they are not drowned out by a year of context.
  if (days > 0 && years === 0) {
    parts.push(`${days} day${days === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" ") : "0 days";
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
