import { dateOfIso } from "@/components/calendar-month";
import { CalendarPicker } from "@/components/calendar-picker";
import { LoadFailed } from "@/components/load-failed";
import { ExitTenancyIcon } from "@/components/artwork-icon";
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarClock, FileText, TriangleAlert } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { TenantExitRequestSkeleton } from "@/components/skeletons/tenancy/exit-request";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, FormInput, NoticeBar } from "@/features/owner/owner-ui";
import { formatFloor } from "@/features/property/floor";
import {
  CalendarPageTile,
  FactColumn,
  FooterNote,
  FormCard,
  HeaderHelp,
  PropertyStayCard,
  SectionLabel,
  longDay,
} from "@/features/tenancy/request-form-cards";
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
        <LoadFailed error={activeTenancyQuery.error} onReload={() => void activeTenancyQuery.refetch()} />
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
  const [howOpen, setHowOpen] = useState(false);
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
          trailing={<HeaderHelp label="How an exit works" onPress={() => setHowOpen(true)} />}
        />
        {children}
      </ScreenScrollView>
      {footer ? (
        <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
          {footer}
        </PinnedFooter>
      ) : null}
      {howOpen ? <ExitHowItWorks onClose={() => setHowOpen(false)} /> : null}
    </View>
  );
}

/** The exit rules, behind the ? (user, 2026-11-11). */
function ExitHowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <HowItWorksSheet
      eyebrow="Exit request"
      onClose={onClose}
      steps={[
        { body: "An exit request can only be raised in the rent window, from the first day of your bill to its due date.", title: "Raise it in the rent window" },
        { body: "Your notice period starts the day you ask to leave.", title: "Notice starts when you ask" },
        { body: "The checkout date starts on the day your full notice is served. Leaving then costs nothing extra.", title: "Full notice has a date" },
        { body: "A date before that is an early exit. Management can apply the early exit policy in your agreement, or turn it down.", title: "Earlier is an early exit" },
        { body: "Management reviews your checkout date. Follow their answer on the Request desk.", title: "Management reviews it" },
      ]}
      title="How an exit works"
    />
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
        <LoadFailed
          error={requestsQuery.error ?? roomRequestsQuery.error}
          onReload={() => { void requestsQuery.refetch(); void roomRequestsQuery.refetch(); }}
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
  router.replace({ pathname: "/tenancy-request-desk", params: { exitRequestCreated: "1" } });
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
        <LoadFailed error={windowQuery.error} onReload={() => void windowQuery.refetch()} />
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
  const [howOpen, setHowOpen] = useState(false);

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
  // Past this rent window (not a re-raise): the dates shown are the next window's (2026-11-11).
  const windowClosed = !checkoutWindow.reRaise
    && Boolean(checkoutWindow.requestWindowClosesOn)
    && toISODate(new Date()) > checkoutWindow.requestWindowClosesOn!
    && checkoutWindow.noticeAnchorDate !== toISODate(new Date());
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
          <FooterNote>Management reviews your request before approving it.</FooterNote>
          <View style={{ flexDirection: "row" }}>
            <ActionButton
              disabled={createState.isLoading || windowClosed}
              label={windowClosed && checkoutWindow.nextRequestWindowOpensOn
                ? `Opens on ${formatDate(checkoutWindow.nextRequestWindowOpensOn)}`
                : createState.isLoading ? "Submitting..." : premature ? "Request early exit" : "Submit exit request"}
              onPress={() => void submit()}
            />
          </View>
        </View>
      }
    >
      <PropertyStayCard
        address={[stay.property.address, stay.property.city, stay.property.state, stay.property.pincode].filter(Boolean).join(", ")}
        name={stay.property.name}
        referenceCode={stay.tenancy.referenceCode}
        roomLabel={`Room ${stay.room.roomNumber}`}
      >
        <FactColumn label="Room" value={stay.room.roomNumber} />
        <FactColumn divided dividerColor={colors.borderStrong} label="Floor" value={formatFloor(stay.room.floor)} />
        <FactColumn divided dividerColor={colors.borderStrong} label="Notice" value={NOTICE_PERIOD_LABELS[checkoutWindow.noticePeriod]} />
      </PropertyStayCard>

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

      {/* The notice, as two dates on a ruled row. */}
      <View style={{ gap: spacing.sm }}>
        <SectionLabel helpLabel="How notice works" label={windowClosed ? "Next notice period" : "Notice period"} onHelp={() => setHowOpen(true)} />
        <FormCard>
          <View style={{ flexDirection: "row" }}>
            <FactColumn label="Notice starts" value={formatDate(checkoutWindow.noticeAnchorDate)} />
            <FactColumn divided label="Full notice served" tone={colors.jade} value={formatDate(checkoutWindow.earliestCheckoutDate)} />
          </View>
        </FormCard>
      </View>

      {/* The checkout day on a calendar page, with Change beside it. */}
      <View style={{ gap: spacing.sm }}>
        <SectionLabel
          label="Checkout date"
          trailing={
            <View style={{ backgroundColor: premature ? colors.warningSoft : colors.jadeSoft, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 }}>
              <Text style={{ color: premature ? colors.warningText : colors.jade, fontFamily: fonts.sansBold, fontSize: 12.5 }}>
                {premature ? "Early exit" : "Full notice"}
              </Text>
            </View>
          }
        />
        <FormCard>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
            <CalendarPageTile iso={chosenIso} />
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 16 }}>{longDay(chosenIso)}</Text>
              <Text style={[type.caption, { color: colors.muted }]}>Your last day at the property</Text>
            </View>
            <AnimatedPressable
              accessibilityLabel={`Change checkout date, ${formatDateLong(chosenDate)}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: createState.isLoading }}
              disabled={createState.isLoading}
              onPress={() => setPickerOpen(true)}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                borderRadius: radii.card,
                borderWidth: 1.5,
                justifyContent: "center",
                minHeight: 36,
                paddingHorizontal: spacing.md,
              }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 13 }}>Change</Text>
            </AnimatedPressable>
          </View>
          <View style={{ backgroundColor: colors.border, height: 1 }} />
          <Text style={[type.caption, { color: colors.muted }]}>
            {premature
              ? `Before your full notice date, ${formatDate(checkoutWindow.earliestCheckoutDate)}.`
              : checkoutWindow.fixed
                ? "Your notice runs to the end of a billing cycle, so this is the date it lands on."
                : `Any day up to ${formatDate(checkoutWindow.latestCheckoutDate)} still serves your full notice. You have already paid for this month, so leaving earlier does not reduce the rent.`}
          </Text>
          {premature ? (
            <View style={{ flexDirection: "row" }}>
              <ActionButton compact disabled={createState.isLoading} icon={FileText} label="View agreement" onPress={() => router.push("/tenancy-agreement-view")} variant="primaryQuiet" />
            </View>
          ) : null}
        </FormCard>
      </View>

      {/* When a request can be raised, under the checkout date (user, 2026-11-11). */}
      <RequestWindowNote window={checkoutWindow} />

      {premature ? (
        <PrematureWarning
          disabled={createState.isLoading}
          noticeDate={checkoutWindow.earliestCheckoutDate}
          onServeFullNotice={() => setChosenDate(noticeDate)}
        />
      ) : null}

      <FormInput
        disabled={createState.isLoading}
        label="Reason for leaving"
        maxLength={500}
        multiline
        onChangeText={setReason}
        placeholder="Add anything you want the property team to know"
        value={reason}
      />

      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
      {howOpen ? <ExitHowItWorks onClose={() => setHowOpen(false)} /> : null}

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
    <NoticeBar
      action={<ActionButton compact disabled={disabled} label="Serve full notice" onPress={onServeFullNotice} />}
      icon={TriangleAlert}
      title="This is an early exit"
      tone="warning"
      message={`You will not be serving your full notice. Management can apply the early exit policy as per your agreement or decline the request. Serving full notice would mean leaving on ${formatDate(noticeDate)}.`}
    />
  );
}


/**
 * When an exit request can be raised (user, 2026-11-11): only from a bill's
 * first day to its due date. Says until when, and when the next window opens.
 */
function RequestWindowNote({ window }: { window: ExitCheckoutWindow }) {
  const { colors, type } = useTheme();
  const closes = window.requestWindowClosesOn;
  const next = window.nextRequestWindowOpensOn;
  if (!next) return null;
  // While this rent window is open, its last day. Once it has passed, the next
  // window's first day (user, 2026-11-11).
  const open = Boolean(closes) && toISODate(new Date()) <= closes!;
  return (
    // A pale purple card with a purple edge (user, 2026-11-11).
    <View style={{ alignItems: "center", backgroundColor: "#F4F3FF", borderColor: "#9E77ED", borderCurve: "continuous", borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
      <CalendarClock color="#6941C6" size={18} strokeWidth={2.2} />
      <Text style={[type.caption, { color: "#53389E", flex: 1, fontSize: 12.5, lineHeight: 18 }]}>
        {open ? (
          <>You can raise an exit request until <Text style={{ fontWeight: "800" }}>{formatDate(closes!)}</Text>, the last day of this rent window.</>
        ) : (
          <>A request can be raised again on <Text style={{ fontWeight: "800" }}>{formatDate(next)}</Text>, when the next rent window starts.</>
        )}
      </Text>
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
  return (
    <CalendarPicker
      maximum={toISODate(maximumDate)}
      minimum={toISODate(minimumDate)}
      onClose={onClose}
      onPick={(iso) => onPick(clamp(dateOfIso(iso), minimumDate, maximumDate))}
      value={toISODate(value)}
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
