import { useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { CalendarClock, CalendarDays, FileClock, TriangleAlert } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import { rupeesLabel } from "@/features/compliance/clause-values";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton } from "@/features/owner/owner-ui";
import { isRequestActive } from "@/features/tenancy/request-activity";
import {
  useCreateExitRequestMutation,
  useGetExitCheckoutWindowQuery,
  useGetMyActiveTenancyQuery,
  useListMyExitRequestsQuery,
} from "@/store/services/tenancy-api";
import { NOTICE_PERIOD_LABELS } from "@/store/services/property-api";
import type { ExitCheckoutWindow } from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function TenancyExitRequestScreen() {
  const router = useRouter();
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const tenancy = activeTenancyQuery.data?.tenancy;

  return (
    <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader
        eyebrow="Tenancy"
        onBack={() => router.back()}
        title="Exit"
        italicTail="tenancy."
        subtitle="Serve your notice period and pick your last day. Management reviews the request."
      />

      {activeTenancyQuery.isFetching && !tenancy ? (
        <SkeletonCard />
      ) : !tenancy ? (
        <EmptyState
          icon={CalendarClock}
          title="No current stay"
          description="Exit requests can be raised only from an active tenancy."
        />
      ) : (
        <ExitRequestGate onDone={() => goToTenancy(router)} />
      )}
    </ScreenScrollView>
  );
}

/**
 * Refuses to open the form while a request is still live.
 *
 * <p>The server enforces one open request per tenancy, so without this the
 * tenant fills in a whole form and is rejected on submit. Worse, "live" now
 * includes decided-but-not-yet-expired requests, so the reason for the refusal
 * is genuinely invisible from here — it has to be spelled out.
 *
 * <p>The way forward is on the request itself: re-raise a lapsed one, or ask to
 * cancel an approved one, both from its card.
 */
function ExitRequestGate({ onDone }: { onDone: () => void }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const requestsQuery = useListMyExitRequestsQuery();

  if (requestsQuery.isLoading) {
    return <SkeletonCard />;
  }

  const live = (requestsQuery.data ?? []).find((request) => isRequestActive(request));
  if (!live) {
    return <ServeNoticeForm onDone={onDone} />;
  }

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>ALREADY OPEN</Text>
        <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
          You have a request in progress
        </Text>
        <Text style={[type.body, { color: colors.muted, lineHeight: 21 }]}>
          {live.referenceCode} is still open. You can only have one exit request at a time — open it
          to raise it again, cancel it, or wait for it to expire before starting a new one.
        </Text>
        <ActionButton
          icon={FileClock}
          label="Go to my requests"
          onPress={() => router.push("/tenancy-request-history")}
        />
      </View>
    </Card>
  );
}

function goToTenancy(router: ReturnType<typeof useRouter>) {
  router.replace({ pathname: "/tenancy", params: { exitRequestCreated: "1" } });
}

/**
 * The single exit route: the server computes what the notice period allows, and
 * the tenant picks a day inside it.
 *
 * <p>Whole-month notice collapses the window to one date, so there is nothing to
 * choose and a picker would be a lie. Sub-month notice is a *minimum lead time* —
 * five days' notice buys the right to leave in five days, it does not oblige
 * leaving on the fifth — so the tenant picks any day up to the cycle end. They
 * have already paid for the month; this is them deciding how much of it to use.
 */
function ServeNoticeForm({ onDone }: { onDone: () => void }) {
  const windowQuery = useGetExitCheckoutWindowQuery();

  if (windowQuery.isLoading) {
    return <SkeletonCard />;
  }

  if (!windowQuery.data) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Cannot work out your notice"
        description="We could not load your notice period right now. Please try again shortly."
      />
    );
  }

  return <NoticeWindowForm checkoutWindow={windowQuery.data} onDone={onDone} />;
}

/** The form proper, once the window is known. */
function NoticeWindowForm({
  checkoutWindow,
  onDone,
}: {
  checkoutWindow: ExitCheckoutWindow;
  onDone: () => void;
}) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [createExit, createState] = useCreateExitRequestMutation();
  const [reason, setReason] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Starts on the notice-served date — the one that carries no consequence. The
  // tenant can move it earlier, but never by accident: that takes a deliberate
  // tap on Change.
  const noticeDate = parseISODate(checkoutWindow.earliestCheckoutDate);
  const [chosenDate, setChosenDate] = useState<Date>(noticeDate);

  const chosenIso = toISODate(chosenDate);
  const premature = chosenIso < checkoutWindow.earliestCheckoutDate;

  // Server refusal — no field owns it, so it takes a modal.
  const opErrors = useFormErrors<never>();
  async function submit() {
    try {
      await createExit({ chosenCheckoutDate: chosenIso, reason: reason.trim() || null }).unwrap();
      onDone();
    } catch (caught) {
      opErrors.failFromServer(errorMessage(caught));
    }
  }

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>NOTICE PERIOD</Text>
          <Text style={[type.body, { color: colors.ink, fontWeight: "800" }]}>
            {NOTICE_PERIOD_LABELS[checkoutWindow.noticePeriod]}
          </Text>
        </View>

        {checkoutWindow.reRaise ? (
          <Card tone="sunken">
            <Text style={[type.body, { color: colors.muted, lineHeight: 21 }]}>
              Your earlier request lapsed without a decision, so your notice still counts from{" "}
              <Text style={{ color: colors.ink, fontWeight: "800" }}>
                {formatDate(checkoutWindow.noticeAnchorDate)}
              </Text>
              . You have not lost any time.
            </Text>
          </Card>
        ) : null}

        <Card tone="sunken">
          <View style={{ gap: spacing.sm }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]}>
              {premature ? "YOUR LAST DAY" : "SERVING FULL NOTICE"}
            </Text>

            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: colors.ink, flex: 1, fontSize: 20, fontWeight: "800" }}>
                {formatDateLong(chosenDate)}
              </Text>
              <ChangeDateButton onPress={() => setPickerOpen(true)} />
            </View>

            {premature ? (
              <PrematureWarning
                noticeDate={checkoutWindow.earliestCheckoutDate}
                onServeFullNotice={() => setChosenDate(noticeDate)}
              />
            ) : (
              <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                {checkoutWindow.fixed
                  ? "Your notice runs to the end of a billing cycle, so this is the date it lands on."
                  : `Any day up to ${formatDate(checkoutWindow.latestCheckoutDate)} still serves your full notice. You have already paid for this month, so leaving earlier does not reduce the rent.`}
              </Text>
            )}
          </View>
        </Card>

        <FormField
          label="Reason"
          maxLength={500}
          multiline
          onChangeText={setReason}
          placeholder="Add context for the property team."
          value={reason}
        />

        <SubmitButton
          busy={createState.isLoading}
          label={premature ? "Request early exit" : `Request exit on ${formatDateLong(chosenDate)}`}
          onPress={() => void submit()}
        />
      </View>

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
    </Card>
  );
}

function ChangeDateButton({ onPress }: { onPress: () => void }) {
  const { colors, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityLabel="Change your last day"
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        borderColor: colors.ink,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
      }}
    >
      <CalendarDays color={colors.ink} size={14} strokeWidth={2.2} />
      <Text style={[type.caption, { color: colors.ink, fontWeight: "800" }]}>Change</Text>
    </AnimatedPressable>
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
  noticeDate,
  onServeFullNotice,
}: {
  noticeDate: string;
  onServeFullNotice: () => void;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {/* No filled tile behind it — the triangle carries the warning on its own. */}
        <TriangleAlert color={colors.warningText} size={18} strokeWidth={2.2} style={{ marginTop: 1 }} />
        <Text style={[type.caption, { color: colors.ink, flex: 1, lineHeight: 18 }]}>
          You will not be serving your full notice, so management reviews this as a premature exit
          and can penalize the exit as per policy or decline it. Serving notice in full would mean
          leaving on {formatDate(noticeDate)}.
        </Text>
      </View>

      <AnimatedPressable accessibilityRole="button" onPress={onServeFullNotice}>
        <Text
          style={[
            type.caption,
            { color: colors.primary, fontWeight: "900", textDecorationLine: "underline" },
          ]}
        >
          Serve full notice instead
        </Text>
      </AnimatedPressable>
    </View>
  );
}

function SubmitButton({ busy, label, onPress }: { busy: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: colors.primary,
        borderRadius: 14,
        justifyContent: "center",
        minHeight: 52,
        opacity: busy ? 0.75 : 1,
        padding: spacing.md,
      }}
    >
      {busy ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 15, }}>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}


function FormField({
  label,
  maxLength,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  maxLength?: number;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {label}
        </Text>
        {maxLength ? (
          <Text style={[type.caption, { color: colors.kicker }]}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
      <AppTextInput
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
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
 * Tap-to-open native date picker for a checkout date.
 *
 * <p>Bounds are passed in rather than assumed: on the serve-notice route they
 * come from the server's window, so the picker cannot offer a day the request
 * would be rejected for. Left unset it falls back to "any future date", which is
 * what the break-lock-in route wants.
 */
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
          <SubmitButton
            busy={false}
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

function tomorrow() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date;
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

