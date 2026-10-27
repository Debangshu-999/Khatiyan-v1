import { ExitTenancyIcon } from "@/components/artwork-icon";
import { useState, type ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BedDouble, CalendarClock, CalendarDays, ChevronRight, FileText, MessageSquare, TriangleAlert } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { TenantExitRequestSkeleton } from "@/components/skeletons/tenancy/exit-request";
import { StatusPill } from "@/components/status-pill";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import {
  exitRequestBlock,
} from "@/features/tenancy/request-blocked-modal";
import { REQUESTS_NOT_STARTED, tenancyNotStarted } from "@/features/tenancy/starts-soon-bubble";
import {
  useCreateExitRequestMutation,
  useGetExitCheckoutWindowQuery,
  useGetMyActiveTenancyQuery,
  useListMyExitRequestsQuery,
  useListMyRoomChangeRequestsQuery,
} from "@/store/services/tenancy-api";
import { NOTICE_PERIOD_LABELS } from "@/store/services/property-api";
import type { ExitCheckoutWindow, TenantActiveTenancy } from "@/store/services/tenancy-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function TenancyExitRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    reason?: string;
    reRaiseRequestId?: string;
    requestedCheckoutDate?: string;
  }>();
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const stay = activeTenancyQuery.data;
  const tenancy = stay?.tenancy;

  if (stay && !tenancyNotStarted(stay.tenancy.startDate) && stay.tenancy.agreementValidityMonths !== 1) {
    return (
      <ExitRequestGate
        initialReason={firstParam(params.reason)}
        initialRequestedCheckoutDate={firstParam(params.requestedCheckoutDate)}
        onDone={() => goToTenancy(router)}
        reRaiseRequestId={firstParam(params.reRaiseRequestId)}
        stay={stay}
      />
    );
  }

  return (
    <ExitRequestPage>
      {activeTenancyQuery.isFetching && !tenancy ? (
        <TenantExitRequestSkeleton />
      ) : activeTenancyQuery.error && !tenancy ? (
        <LoadError message={errorMessage(activeTenancyQuery.error)} onRetry={() => void activeTenancyQuery.refetch()} />
      ) : !tenancy ? (
        <EmptyState
          icon={ExitTenancyIcon}
          title="No current stay"
          description="Exit requests can be raised only from an active tenancy."
        />
      ) : tenancyNotStarted(tenancy.startDate) ? (
        <EmptyState icon={ExitTenancyIcon} title="Your tenancy has not started" description={REQUESTS_NOT_STARTED.exit} />
      ) : tenancy.agreementValidityMonths === 1 ? (
        <EmptyState icon={ExitTenancyIcon} title="Early exit unavailable" description="Your tenancy has a 1-month fixed agreement, so an early exit request is not available. Early exit applies only to fixed agreements of 2 months or more. Your stay ends on the agreed checkout date." />
      ) : null}
    </ExitRequestPage>
  );
}

/** Keep the header in the scroll view and the action outside it, like other forms. */
function ExitRequestPage({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme();
  const [footerHeight, setFooterHeight] = useState(PINNED_FOOTER_CLEARANCE);
  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        contentContainerStyle={footer ? { paddingBottom: footerHeight + spacing.lg } : undefined}
        safeAreaEdges={footer ? ["top"] : ["top", "bottom"]}
      >
        <ScreenHeader
          title="Exit"
          italicTail="request."
          subtitle="Choose your checkout date and let the property team know you plan to leave."
        />
        {children}
      </ScreenScrollView>
      {footer ? (
        <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
          {footer}
        </PinnedFooter>
      ) : null}
    </View>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: spacing.md }}>
      <EmptyState icon={ExitTenancyIcon} title="Could not load exit details" description={message} />
      <ActionButton label="Try again" onPress={onRetry} variant="secondary" />
    </View>
  );
}

/**
 * Last-line safety for a direct link or request-state race. Normal taps are
 * gated on the Tenancy tab before this screen is opened.
 *
 * <p>The server enforces one open request per tenancy, so without this the
 * tenant fills in a whole form and is rejected on submit. Worse, "live" now
 * includes decided-but-not-yet-expired requests, so the reason for the refusal
 * is genuinely invisible from here — it has to be spelled out.
 *
 * <p>The way forward is on the request itself: re-raise a lapsed one, or ask to
 * withdraw an approved one, both from its card.
 */
function ExitRequestGate({
  initialReason,
  initialRequestedCheckoutDate,
  onDone,
  reRaiseRequestId,
  stay,
}: {
  initialReason?: string;
  initialRequestedCheckoutDate?: string;
  onDone: () => void;
  reRaiseRequestId?: string;
  stay: TenantActiveTenancy;
}) {
  const requestsQuery = useListMyExitRequestsQuery();
  const roomRequestsQuery = useListMyRoomChangeRequestsQuery();

  if (requestsQuery.isLoading || roomRequestsQuery.isLoading) {
    return <ExitRequestPage><TenantExitRequestSkeleton /></ExitRequestPage>;
  }

  if (requestsQuery.error || roomRequestsQuery.error) {
    return (
      <ExitRequestPage>
        <LoadError
          message={errorMessage(requestsQuery.error ?? roomRequestsQuery.error)}
          onRetry={() => { void requestsQuery.refetch(); void roomRequestsQuery.refetch(); }}
        />
      </ExitRequestPage>
    );
  }

  const correction = (requestsQuery.data ?? []).find(
    (request) => request.id === reRaiseRequestId && request.reRaiseAllowed,
  );
  if (correction) {
    return (
      <ServeNoticeForm
        initialReason={initialReason}
        initialRequestedCheckoutDate={initialRequestedCheckoutDate}
        onDone={onDone}
        stay={stay}
      />
    );
  }

  if (reRaiseRequestId) {
    return (
      <ExitRequestPage>
        <EmptyState
          icon={ExitTenancyIcon}
          title="Correction window closed"
          description="This exit request can no longer be edited and raised again."
        />
      </ExitRequestPage>
    );
  }

  const requestBlock = exitRequestBlock(requestsQuery.data, roomRequestsQuery.data, stay.tenancy.id);

  if (!requestBlock) {
    return <ServeNoticeForm onDone={onDone} stay={stay} />;
  }

  return (
    <ExitRequestPage>
      <EmptyState
        icon={ExitTenancyIcon}
        title={requestBlock.title}
        description={`${requestBlock.referenceCode}: ${requestBlock.message}`}
      />
    </ExitRequestPage>
  );
}

function goToTenancy(router: ReturnType<typeof useRouter>) {
  router.replace({ pathname: "/tenancy", params: { exitRequestCreated: "1" } });
}

/**
 * The single exit route: the server computes what the notice period allows, and
 * the tenant picks a day inside it.
 *
 * <p>Whole-month notice has a single full-notice date; any permitted earlier
 * dates still come from the server's window. Sub-month notice is a *minimum lead time* —
 * five days' notice buys the right to leave in five days, it does not oblige
 * leaving on the fifth — so the tenant picks any day up to the cycle end. They
 * have already paid for the month; this is them deciding how much of it to use.
 */
function ServeNoticeForm({
  initialReason,
  initialRequestedCheckoutDate,
  onDone,
  stay,
}: {
  initialReason?: string;
  initialRequestedCheckoutDate?: string;
  onDone: () => void;
  stay: TenantActiveTenancy;
}) {
  const windowQuery = useGetExitCheckoutWindowQuery();

  if (windowQuery.isLoading) {
    return <ExitRequestPage><TenantExitRequestSkeleton /></ExitRequestPage>;
  }

  if (!windowQuery.data) {
    return (
      <ExitRequestPage>
        <LoadError
          message={windowQuery.error ? errorMessage(windowQuery.error) : "We could not load your notice period right now. Please try again shortly."}
          onRetry={() => void windowQuery.refetch()}
        />
      </ExitRequestPage>
    );
  }

  return (
    <NoticeWindowForm
      checkoutWindow={windowQuery.data}
      initialReason={initialReason}
      initialRequestedCheckoutDate={initialRequestedCheckoutDate}
      onDone={onDone}
      stay={stay}
    />
  );
}

/** The form proper, once the window is known. */
function NoticeWindowForm({
  checkoutWindow,
  initialReason,
  initialRequestedCheckoutDate,
  onDone,
  stay,
}: {
  checkoutWindow: ExitCheckoutWindow;
  initialReason?: string;
  initialRequestedCheckoutDate?: string;
  onDone: () => void;
  stay: TenantActiveTenancy;
}) {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const [createExit, createState] = useCreateExitRequestMutation();
  const [reason, setReason] = useState(initialReason ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Starts on the notice-served date — the one that carries no consequence. The
  // tenant can move it earlier, but never by accident: that takes a deliberate
  // tap on Change.
  const noticeDate = parseISODate(checkoutWindow.earliestCheckoutDate);
  const [chosenDate, setChosenDate] = useState<Date>(() => {
    if (!initialRequestedCheckoutDate) {
      return noticeDate;
    }
    return clamp(
      parseISODate(initialRequestedCheckoutDate),
      parseISODate(checkoutWindow.earliestPossibleDate),
      parseISODate(checkoutWindow.latestCheckoutDate),
    );
  });

  const chosenIso = toISODate(chosenDate);
  const premature = chosenIso < checkoutWindow.earliestCheckoutDate;

  // Server refusal — no field owns it, so it takes a modal.
  const opErrors = useFormErrors<never>();
  async function submit() {
    if (createState.isLoading) return;
    try {
      await createExit({ chosenCheckoutDate: chosenIso, reason: reason.trim() || null }).unwrap();
      onDone();
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught));
    }
  }

  return (
    <ExitRequestPage
      footer={
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.caption, { color: colors.muted, textAlign: "center" }]}>
            Checkout: {formatDateLong(chosenDate)}
          </Text>
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={createState.isLoading}
              label={createState.isLoading ? "Submitting..." : premature ? "Request early exit" : "Submit exit request"}
              onPress={() => void submit()}
            />
          </View>
        </View>
      }
    >
      <CurrentStayCard stay={stay} />

      {checkoutWindow.reRaise ? (
        <NoticeBar
          icon={CalendarClock}
          title="Your notice still counts"
          tone="info"
          message={`Your earlier request lapsed without a decision. Your notice still counts from ${formatDate(checkoutWindow.noticeAnchorDate)}, so you have not lost any time.`}
        />
      ) : null}

      {!checkoutWindow.prematureExitAllowed && checkoutWindow.restrictionMessage ? (
        <NoticeBar
          title="Early exit unavailable"
          tone="warning"
          message={`${checkoutWindow.restrictionMessage} You can still request an exit by serving your full notice period. The dates below reflect that.`}
        />
      ) : null}

      <Card>
        <SectionHeading icon={<CalendarClock color={colors.primary} size={20} />} title="Notice period" />
        <Text style={[type.label, { color: colors.ink, fontSize: 22, lineHeight: 28 }]}>{NOTICE_PERIOD_LABELS[checkoutWindow.noticePeriod]}</Text>
        <View style={{ borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingTop: spacing.md }}>
          <DateDetail label="Notice starts" value={checkoutWindow.noticeAnchorDate} />
          <DateDetail label="Full notice served" value={checkoutWindow.earliestCheckoutDate} />
        </View>
      </Card>

      <Card>
        <SectionHeading icon={<CalendarDays color={colors.primary} size={20} />} title="Checkout date" />
        <AnimatedPressable
          accessibilityLabel={`Change checkout date, ${formatDateLong(chosenDate)}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: createState.isLoading }}
          disabled={createState.isLoading}
          onPress={() => setPickerOpen(true)}
          style={{ alignItems: "center", backgroundColor: colors.neutralSoft, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 68, padding: spacing.md }}
        >
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text style={[type.caption, { color: colors.muted }]}>Your last day at the property</Text>
            <Text style={[type.label, { color: colors.ink, fontSize: 19, lineHeight: 26 }]}>{formatDateLong(chosenDate)}</Text>
          </View>
          <Text style={[type.caption, { color: colors.primary }]}>Change</Text>
          <ChevronRight color={colors.primary} size={18} />
        </AnimatedPressable>
        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <StatusPill
            label={premature ? "Early exit" : "Full notice"}
            style={{ alignSelf: "center" }}
            textStyle={{ fontFamily: fonts.sansBold }}
            tone={premature ? "warning" : "success"}
          />
          {premature ? (
            <View style={{ width: 145, maxWidth: "100%" }}>
              <ActionButton
                compact
                disabled={createState.isLoading}
                icon={FileText}
                label="View agreement"
                onPress={() => router.push("/tenancy-agreement-view")}
                variant="primaryQuiet"
              />
            </View>
          ) : null}
        </View>
        {!premature ? (
          <Text style={[type.description, { color: colors.muted }]}>
            {checkoutWindow.fixed
              ? "Your notice runs to the end of a billing cycle, so this is the date it lands on."
              : `Any day up to ${formatDate(checkoutWindow.latestCheckoutDate)} still serves your full notice. You have already paid for this month, so leaving earlier does not reduce the rent.`}
          </Text>
        ) : null}
      </Card>

      {premature ? (
        <PrematureWarning
          disabled={createState.isLoading}
          noticeDate={checkoutWindow.earliestCheckoutDate}
          onServeFullNotice={() => setChosenDate(noticeDate)}
        />
      ) : null}

      <Card>
        <SectionHeading icon={<MessageSquare color={colors.primary} size={20} />} title="Reason for leaving" trailing={<StatusPill label="Optional" />} />
        <Text style={[type.description, { color: colors.muted }]}>Add any context you would like the property team to consider.</Text>
        <FormField
          disabled={createState.isLoading}
          maxLength={500}
          multiline
          onChangeText={setReason}
          placeholder="Tell us why you are leaving..."
          value={reason}
        />
      </Card>

      <NoticeBar
        title="Reviewed by your property team"
        tone="info"
        message="The property team will review your checkout date and any reason you add. Track their decision from your tenancy screen."
      />

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}

      {pickerOpen ? (
        <CheckoutDatePicker
          maximumDate={parseISODate(checkoutWindow.latestCheckoutDate)}
          minimumDate={parseISODate(checkoutWindow.earliestPossibleDate)}
          onClose={() => setPickerOpen(false)}
          onPick={(picked) => setChosenDate(picked)}
          value={chosenDate}
        />
      ) : null}
    </ExitRequestPage>
  );
}

function CurrentStayCard({ stay }: { stay: TenantActiveTenancy }) {
  const { colors, type } = useTheme();
  return (
    <Card style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 999, height: 44, justifyContent: "center", width: 44 }}>
        <BedDouble color={colors.primary} size={23} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <Text style={[type.eyebrow, { color: colors.muted }]}>Current stay</Text>
        <Text style={[type.label, { color: colors.ink, fontSize: 18, lineHeight: 24 }]}>{stay.property.name}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>Room {stay.room.roomNumber}{stay.room.floor ? ` · Floor ${stay.room.floor}` : ""}</Text>
      </View>
    </Card>
  );
}

function SectionHeading({ icon, title, trailing }: { icon: ReactNode; title: string; trailing?: ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      {icon}
      <Text style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 16 }}>{title}</Text>
      {trailing}
    </View>
  );
}

function DateDetail({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 120, gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={[type.body, { color: colors.ink }]}>{formatDate(value)}</Text>
    </View>
  );
}

/**
 * Shown when the chosen day falls before the notice has been served.
 *
 * <p>Not a block. Someone who has to move at short notice needs a route — refuse
 * one and they leave without telling anybody, which is worse for everyone. What
 * they need is to know it is reviewed differently, and a one-tap way back to the
 * date that is not.
 *
 * <p>No amount is quoted. What an early exit costs is the property's own policy,
 * written by the owner and applied by a person at the end-tenancy step — this
 * screen has no business inventing a figure.
 */
function PrematureWarning({
  disabled,
  noticeDate,
  onServeFullNotice,
}: {
  disabled: boolean;
  noticeDate: string;
  onServeFullNotice: () => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <NoticeBar
        icon={TriangleAlert}
        title="This is an early exit"
        tone="warning"
        message={`You will not be serving your full notice. Management can apply the early exit policy as per your agreement or decline the request. Serving full notice would mean leaving on ${formatDate(noticeDate)}.`}
      />
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={disabled} label="Serve full notice instead" onPress={onServeFullNotice} variant="primaryQuiet" />
      </View>
    </View>
  );
}

function FormField({
  disabled,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  disabled?: boolean;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <AppTextInput
        accessibilityLabel="Reason for leaving, optional"
        editable={!disabled}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          backgroundColor: colors.neutralSoft,
          borderColor: colors.border,
          borderRadius: radii.md,
          borderWidth: 1,
          color: colors.ink,
          fontFamily: fonts.sans,
          fontSize: 15,
          minHeight: multiline ? 130 : 54,
          padding: spacing.md,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
      {maxLength ? (
        <Text style={[type.caption, { color: colors.muted, textAlign: "right" }]}>{value.length}/{maxLength}</Text>
      ) : null}
    </View>
  );
}

function formatDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Opens straight onto the native date picker, bounded by the window.
 *
 * <p>The bounds are the enforcement, not a validation message afterwards: a date
 * past the notice window is simply not selectable, so the tenant never composes
 * a request the server would reject. The API applies the same cap independently —
 * a picker is a convenience, never the guard.
 */
function CheckoutDatePicker({
  maximumDate,
  minimumDate,
  onClose,
  onPick,
  value,
}: {
  maximumDate: Date;
  minimumDate: Date;
  onClose: () => void;
  onPick: (date: Date) => void;
  value: Date;
}) {
  const { colors, fonts, type } = useTheme();
  const [draft, setDraft] = useState(value);

  // The native picker has no web implementation, so dev-web gets a plain
  // YYYY-MM-DD field and keeps the flow testable in a browser.
  if (Platform.OS === "web") {
    return (
      <SheetShell onClose={onClose} title="Choose your last day">
        <View style={{ gap: spacing.md }}>
          <AppTextInput
            defaultValue={toISODate(value)}
            onChangeText={(text) => {
              const trimmed = text.trim();
              const parsed = new Date(`${trimmed}T00:00:00`);
              if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(parsed.getTime())) {
                setDraft(parsed);
              }
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.kicker}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              color: colors.ink,
              fontFamily: fonts.sans,
              fontSize: 15,
              minHeight: 54,
              paddingHorizontal: spacing.md,
            }}
          />
          <Text style={[type.caption, { color: colors.muted }]}>
            Between {formatDate(toISODate(minimumDate))} and {formatDate(toISODate(maximumDate))}.
          </Text>
          <ActionButton
            label="Use this date"
            onPress={() => {
              onPick(clamp(draft, minimumDate, maximumDate));
              onClose();
            }}
          />
        </View>
      </SheetShell>
    );
  }

  return (
    <DateTimePicker
      display={Platform.OS === "ios" ? "inline" : "default"}
      maximumDate={maximumDate}
      minimumDate={minimumDate}
      mode="date"
      onChange={(event: DateTimePickerEvent, selected?: Date) => {
        // Android dismisses itself on any outcome; iOS keeps the wheel up, so
        // committing on "set" is what closes it there too.
        if (event.type === "set" && selected) {
          onPick(clamp(selected, minimumDate, maximumDate));
        }
        onClose();
      }}
      value={value}
    />
  );
}

/** Belt and braces: a picker should never hand back an out-of-range date. */
function clamp(date: Date, min: Date, max: Date) {
  if (date.getTime() < min.getTime()) {
    return min;
  }
  if (date.getTime() > max.getTime()) {
    return max;
  }
  return date;
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

// Local YYYY-MM-DD (not UTC) so the date the tenant picked is the date we send.
function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** Parses a YYYY-MM-DD as a local date, so it does not shift a day in IST. */
function parseISODate(iso: string) {
  return new Date(`${iso}T00:00:00`);
}
