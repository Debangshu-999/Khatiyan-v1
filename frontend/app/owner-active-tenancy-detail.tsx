import type { PropsWithChildren, ReactNode } from "react";
import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { openDialer } from "@/lib/dial";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ChevronRight, Info, MessageCircle, Phone } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
// Written here, now shared — the tenant's side of a stay renders the same rows.
import { CardRule, FieldPair, FieldRow, FlatCard, ReadonlyField } from "@/components/field-card";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import { useGetManagedTenancyDepositQuery } from "@/store/services/billing-api";
import { useAppSelector } from "@/store/hooks";
import { useListPropertyTenanciesQuery } from "@/store/services/tenancy-api";
import { useListTenantThreadsQuery, useOpenTeamThreadMutation, type ChatThread } from "@/store/services/chat-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function OwnerActiveTenancyDetailScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{
    billingStarted?: string;
    billingType?: string;
    dailyRatePaise?: string;
    depositAmountPaise?: string;
    guestStay?: string;
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
  // Both refusals here happen on tap, with nothing on screen to correct.
  const opErrors = useFormErrors<never>();
  // A daily guest has no account, so the three "is this person set up" fields
  // below have nothing to report. They are not pending — there is nothing to
  // verify and nothing to complete, and showing them half-done reads as work
  // outstanding rather than a stay that never needed any.
  const guestStay = stringParam(params.guestStay) === "true";
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

  // The Tenants roster, which carries a row per tenancy whether or not a
  // conversation exists behind it. Skipped for a guest — there is no account to
  // hold a thread, and asking would be a query whose answer cannot be used.
  const tenantThreadsQuery = useListTenantThreadsQuery(selectedPropertyId ?? "", {
    skip: !selectedPropertyId || guestStay,
  });
  const existingThread = tenantThreadsQuery.data?.find((thread) => thread.originId === tenancyId) ?? null;
  const [openTeamThread] = useOpenTeamThreadMutation();
  const [confirmChat, setConfirmChat] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Only a fixed term has an end date to state. An indefinite stay runs until
  // somebody gives notice, so both fields stay blank rather than inventing a
  // date from a notice period that has not been served.
  const fixedTerm = Boolean(tenancy?.fixedTerm);
  const agreedEndDate = fixedTerm ? tenancy?.endDate ?? tenancy?.agreementEndDate ?? null : null;
  const stayStartDate = tenancy?.startDate ?? (stringParam(params.startDate) || null);

  /**
   * The date this stay ends, whichever field actually holds it.
   *
   * <p>A daily stay always has a checkout, but it lives in `plannedEndDate` —
   * `endDate` stays null while the stay is running. Reading only the fixed-term
   * fields left every daily guest with a blank End date AND a blank Stay
   * duration, on a stay whose whole point is that it ends on a known day.
   */
  const isDaily = billingType === "DAILY";
  const plannedEndDate = stringParam(params.plannedEndDate) || tenancy?.plannedEndDate || null;
  const stayEndDate = isDaily ? plannedEndDate : agreedEndDate;

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

  /**
   * The tenant's team thread, opened or created.
   *
   * <p>Creating one is a visible act — it puts a row in the property's Tenants
   * list and can notify the tenant — so an existing conversation opens straight
   * away and a new one asks first. The roster answers which case this is: a
   * tenant with no conversation yet still has a row, with a null `id`.
   */
  function handleChat() {
    // The server refuses this outright for a guest, and rightly: a guest stay
    // has no account, so there is no second person to put in the thread.
    if (guestStay) {
      opErrors.failFromServer("This is a guest stay with no account, so there is nobody to chat with.");
      return;
    }
    if (!tenancyId) {
      opErrors.failFromServer("This tenancy has no conversation yet.");
      return;
    }
    if (existingThread?.id) {
      router.push(threadRoute(existingThread.id, existingThread));
      return;
    }
    setConfirmChat(true);
  }

  async function startChat() {
    setConfirmChat(false);
    try {
      const opened = await openTeamThread(tenancyId).unwrap();
      if (opened.id) {
        router.push(threadRoute(opened.id, opened));
      }
    } catch (error) {
      opErrors.failFromServer(errorMessage(error) || "Could not start this conversation.");
    }
  }

  return (
    <ScreenScrollView
      // The same opening band as the overhauled workspace screens: a pale blue
      // wash fading into the page rather than a flat sheet.
      background={
        <View style={{ backgroundColor: colors.surface, flex: 1 }}>
          <LinearGradient
            colors={[colors.primarySoft, colors.surface]}
            end={{ x: 0.5, y: 1 }}
            locations={[0, 1]}
            start={{ x: 0.5, y: 0 }}
            style={{ height: 260 }}
          />
        </View>
      }
      safeAreaEdges={["top", "bottom"]}
      surface={colors.surface}
    >
      {/* No eyebrow row and no back arrow, matching the owner's own profile.
          The way back is the device gesture. */}
      <ScreenHeader
        title="Tenant"
        italicTail="profile."
        subtitle="Stay, rent and contact details for this tenant."
      />

      <View style={{ alignItems: "center", gap: spacing.md }}>
        <InitialsAvatar name={tenantName} />
        <View style={{ alignItems: "center", gap: spacing.xxs }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 20, }}>
            {tenantName}
          </Text>
          {/* The reference code alone. The room already has its own field in
              Rent details, and repeating it in brackets here made the code look
              like it contained the room. */}
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            {params.referenceCode ?? "-"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm, width: "100%" }}>
          <ProfileActionButton icon={Phone} label="Call now" onPress={handleCall} primary />
          <ProfileActionButton icon={MessageCircle} label="Chat" onPress={handleChat} />
        </View>
      </View>

      {/* Flat cards with ruled rows, the same shape as the owner's own profile.
          This screen used boxed values in a grid, so the two places that answer
          "who is this person and what are their details" looked like different
          products. */}
      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Rent details" />
        <FlatCard>
          <FieldPair
            left={<ReadonlyField label="Start date" value={formatDate(stringParam(params.startDate))} />}
            right={<ReadonlyField label="Room" value={roomLabel} />}
          />
          <CardRule />
          {/* Blank for an indefinite agreement, on purpose — see above. */}
          <FieldPair
            left={<ReadonlyField label={isDaily ? "Checkout" : "End date"} value={formatDate(stayEndDate)} />}
            right={<ReadonlyField label="Stay duration" value={formatDuration(stayStartDate, stayEndDate)} />}
          />
          <CardRule />
          <FieldRow>
            <ReadonlyField
              label={billingType === "DAILY" ? "Daily rent" : "Monthly rent"}
              value={formatMoney(billingAmount)}
            />
          </FieldRow>
          <CardRule />
          <FieldRow>
            {/* Names what it opens. The row is a doorway into the deposit
                ledger, not a standalone figure — and every other screen calls
                that the deposit account. */}
            <ReadonlyField
              label="Deposit account"
              value={securityValue}
              tone={!depositEligible || firstCyclePaid ? "default" : "danger"}
              {...(depositEligible
                ? { onPress: openDepositManager }
                : {
                    // A dialog, not a toast. This explains WHY a field reads
                    // "Not eligible", and a message that slides away on its own
                    // is the wrong home for the answer to a question the reader
                    // just asked by tapping.
                    onInfoPress: () =>
                      setInfoMessage(
                        "Daily tenancies are billed per night and do not carry a refundable security deposit.",
                      ),
                  })}
            />
          </FieldRow>
        </FlatCard>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Tenant details" />
        <FlatCard>
          {guestStay ? null : (
            <>
              <FieldPair
                left={
                  <ReadonlyField
                    label="Phone verified"
                    status={params.tenantPhoneVerified === "true" ? "Verified" : "Pending"}
                    value={params.tenantPhoneVerified === "true" ? "Verified" : "Pending"}
                  />
                }
                right={<ReadonlyField label="Document verified" value="Pending" />}
              />
              <CardRule />
            </>
          )}
          <FieldRow>
            <ReadonlyField label={guestStay ? "Guest name" : "Tenant name"} value={tenantName} />
          </FieldRow>
          <CardRule />
          <FieldRow>
            <ReadonlyField label="Phone" prefix={<DialCodePrefix />} value={formatLocalPhone(tenantPhone)} />
          </FieldRow>
          <CardRule />
          <FieldRow>
            <ReadonlyField
              label="Tenant ID"
              mono
              value={stringParam(params.referenceCode) || shortId(stringParam(params.tenancyId))}
            />
          </FieldRow>
          <CardRule />
          {guestStay ? (
            <FieldRow>
              <ReadonlyField label="Account" value="No account, guest stay" />
            </FieldRow>
          ) : (
            <FieldPair
              left={<ReadonlyField label="User ID" mono value={shortId(stringParam(params.userId))} />}
              right={
                <ReadonlyField
                  label="Profile completion"
                  value={params.tenantProfileCompleted === "true" ? "Complete" : "Basic"}
                />
              }
            />
          )}
        </FlatCard>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title="Tenancy details" />
        <FlatCard>
          <FieldPair
            left={<ReadonlyField label="Tenancy status" value={humanizeToken(stringParam(params.status) || "-")} />}
            right={<ReadonlyField label="Billing type" value={humanizeToken(billingType)} />}
          />
          <CardRule />
          <FieldPair
            left={<ReadonlyField label="Billing started" value={params.billingStarted === "true" ? "Yes" : "No"} />}
            right={
              <ReadonlyField label="Planned checkout" value={formatDate(stringParam(params.plannedEndDate))} />
            }
          />
          <CardRule />
          <FieldRow>
            <ReadonlyField label="Internal tenancy ID" mono value={shortId(stringParam(params.tenancyId))} />
          </FieldRow>
        </FlatCard>
      </View>
      {confirmChat ? (
        <ConfirmDialog
          confirmLabel="Start chat"
          message={`Do you want to start a chat with ${tenantName}?`}
          onCancel={() => setConfirmChat(false)}
          onConfirm={() => void startChat()}
          title="Start a conversation"
        />
      ) : null}

      {infoMessage ? <AlertModal message={infoMessage} onClose={() => setInfoMessage(null)} /> : null}

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
    </ScreenScrollView>
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

/**
 * The flag and "+91", set apart by a hairline.
 *
 * <p>The same chip the owner's own profile uses. Not a picker: every number in
 * this app is Indian, the field is read-only, and a control offering one choice
 * reads as something that failed to load.
 */
function DialCodePrefix() {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <Text style={{ fontSize: 16 }}>{String.fromCodePoint(0x1f1ee, 0x1f1f3)}</Text>
      <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>+91</Text>
      <View style={{ backgroundColor: colors.borderStrong, height: 20, marginLeft: spacing.xs, width: 1 }} />
    </View>
  );
}

/**
 * The number without its country code, grouped 5-5.
 *
 * <p>Takes the last ten digits rather than stripping a "+91" prefix, so it reads
 * the same whether the stored value carries the code or not — guest phones were
 * written without it for a long time.
 */
function formatLocalPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    return phone.trim() || "-";
  }
  const local = digits.slice(-10);
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

/**
 * The chat route, with the header seeded from the thread we already hold.
 *
 * <p>Same shape as the chats tab builds, so a thread opened from here and the
 * same thread opened from the list arrive with an identical header instead of
 * one of them flashing a placeholder.
 */
function threadRoute(
  threadId: string,
  thread: Pick<ChatThread, "counterpartPhotoUrl" | "counterpartUserId" | "kind" | "title">,
) {
  const query = new URLSearchParams({ title: thread.title });
  if (thread.counterpartPhotoUrl) {
    query.set("photo", thread.counterpartPhotoUrl);
  }
  // Only when the other side is the PROPERTY rather than a person.
  if (thread.kind === "TEAM" && thread.counterpartUserId === null) {
    query.set("team", "1");
  }
  return `/chat/${threadId}?${query.toString()}`;
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
