import { useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, CalendarDays, ShieldAlert } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import { rupeesLabel } from "@/features/compliance/clause-values";
import {
  useCreateNormalExitRequestMutation,
  useCreatePrematureExitRequestMutation,
  useGetMyActiveTenancyQuery,
  usePreviewEarlyExitPenaltyQuery,
  useRequestAgreementEarlyExitMutation,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ExitMode = "NORMAL_NOTICE" | "PREMATURE";

export default function TenancyExitRequestScreen() {
  const router = useRouter();
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const tenancy = activeTenancyQuery.data?.tenancy;

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="REQUEST"
        title="Exit"
        italicTail="tenancy."
        subtitle={
          tenancy?.agreementBacked
            ? "Your tenancy has an agreement. Review the effect of leaving early before you request."
            : "Choose normal notice or premature exit and share the reason for review."
        }
        trailing={<BackButton onPress={() => router.back()} />}
      />

      {activeTenancyQuery.isFetching && !tenancy ? (
        <SkeletonCard />
      ) : !tenancy ? (
        <EmptyState
          icon={CalendarClock}
          eyebrow="No active tenancy"
          title="No current stay"
          description="Exit requests can be raised only from an active tenancy."
        />
      ) : tenancy.agreementBacked ? (
        <AgreementExitForm lockInEndDate={tenancy.lockInEndDate} onDone={() => goToTenancy(router)} />
      ) : (
        <StandardExitForm onDone={() => goToTenancy(router)} />
      )}
    </ScreenScrollView>
  );
}

function goToTenancy(router: ReturnType<typeof useRouter>) {
  router.replace({ pathname: "/tenancy", params: { exitRequestCreated: "1" } });
}

// Agreement tenants exit premature-only: pick a checkout date, see the lock-in
// penalty (₹0 once the minimum stay is served), then request. The penalty is
// applied by the owner at approval.
function AgreementExitForm({ lockInEndDate, onDone }: { lockInEndDate: string | null; onDone: () => void }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [checkoutDate, setCheckoutDate] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const [requestExit, requestState] = useRequestAgreementEarlyExitMutation();

  const isoDate = checkoutDate ? toISODate(checkoutDate) : "";
  const previewQuery = usePreviewEarlyExitPenaltyQuery(isoDate, { skip: !isoDate });
  const preview = previewQuery.data;

  async function submit() {
    if (!isoDate) {
      toast.error("Pick a checkout date first.");
      return;
    }
    try {
      await requestExit({ reason: reason.trim() || null, requestedCheckoutDate: isoDate }).unwrap();
      onDone();
    } catch (error) {
      const message = (error as { data?: { message?: string } })?.data?.message;
      toast.error(message ?? "Could not create the exit request. Please try again.");
    }
  }

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        {lockInEndDate ? (
          <Card tone="sunken">
            <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
              Your minimum stay (lock-in) runs until{" "}
              <Text style={{ color: colors.ink, fontWeight: "800" }}>{formatDate(lockInEndDate)}</Text>. Leaving before
              then carries an early-exit penalty as per{" "}
              <Text
                onPress={() => router.push("/tenancy-agreement-view")}
                style={{ color: colors.primary, fontWeight: "800", textDecorationLine: "underline" }}
              >
                agreement
              </Text>
              .
            </Text>
          </Card>
        ) : null}

        <CheckoutDateField value={checkoutDate} onChange={setCheckoutDate} />

        {isoDate ? (
          <PenaltyPreviewCard
            loading={previewQuery.isFetching}
            onViewAgreement={() => router.push("/tenancy-agreement-view")}
            penaltyPaise={preview?.penaltyPaise ?? null}
            withinLockIn={preview?.withinLockIn ?? false}
          />
        ) : null}

        <FormField
          label="Reason"
          maxLength={500}
          multiline
          onChangeText={setReason}
          placeholder="Add context for the property team."
          value={reason}
        />

        <SubmitButton
          busy={requestState.isLoading}
          label="Request early exit"
          onPress={() => void submit()}
        />
      </View>
    </Card>
  );
}

function PenaltyPreviewCard({
  loading,
  onViewAgreement,
  penaltyPaise,
  withinLockIn,
}: {
  loading: boolean;
  onViewAgreement: () => void;
  penaltyPaise: number | null;
  withinLockIn: boolean;
}) {
  const { colors, fonts, type } = useTheme();
  const hasPenalty = (penaltyPaise ?? 0) > 0;
  const tone = hasPenalty ? colors.danger : colors.jade;
  const toneSoft = hasPenalty ? colors.dangerSoft : colors.jadeSoft;

  return (
    <View style={{ backgroundColor: toneSoft, borderRadius: 14, gap: spacing.xs, padding: spacing.md }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <ShieldAlert color={tone} size={16} strokeWidth={2.3} />
        <Text style={[type.eyebrow, { color: tone }]} selectable>
          Early-exit penalty
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator color={tone} />
      ) : hasPenalty ? (
        <>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "700" }} selectable>
            {rupeesLabel(penaltyPaise ?? 0)}
          </Text>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
            This is charged to your bill when the owner approves the request. You then serve the notice period, as per your{" "}
            <Text
              onPress={onViewAgreement}
              style={{ color: colors.primary, fontWeight: "800", textDecorationLine: "underline" }}
            >
              agreement
            </Text>
            .
          </Text>
        </>
      ) : (
        <>
          <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "700" }} selectable>
            {rupeesLabel(penaltyPaise ?? 0)}
          </Text>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]} selectable>
            {withinLockIn
              ? "No penalty for this date."
              : "Your minimum stay is complete — no early-exit penalty."}
          </Text>
        </>
      )}
    </View>
  );
}

// Non-agreement tenants keep the original normal-notice / premature toggle.
function StandardExitForm({ onDone }: { onDone: () => void }) {
  const { colors, type } = useTheme();
  const toast = useToast();
  const [createNormalExit, normalState] = useCreateNormalExitRequestMutation();
  const [createPrematureExit, prematureState] = useCreatePrematureExitRequestMutation();
  const [mode, setMode] = useState<ExitMode>("NORMAL_NOTICE");
  const [requestedCheckoutDate, setRequestedCheckoutDate] = useState<Date | null>(null);
  const [reason, setReason] = useState("");
  const submitting = normalState.isLoading || prematureState.isLoading;

  async function submit() {
    const trimmedReason = reason.trim();
    try {
      if (mode === "NORMAL_NOTICE") {
        await createNormalExit({ reason: trimmedReason || null }).unwrap();
      } else {
        if (!requestedCheckoutDate) {
          toast.error("Pick a checkout date first.");
          return;
        }
        await createPrematureExit({
          reason: trimmedReason || null,
          requestedCheckoutDate: toISODate(requestedCheckoutDate),
        }).unwrap();
      }
      onDone();
    } catch {
      toast.error("Could not create exit request. Check notice rules and try again.");
    }
  }

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <OptionGroup
          label="Exit type"
          options={[
            { label: "Normal notice", value: "NORMAL_NOTICE" },
            { label: "Premature", value: "PREMATURE" },
          ]}
          selected={mode}
          onSelect={setMode}
        />

        <Card tone="sunken">
          <Text style={[type.body, { color: colors.muted }]} selectable>
            {mode === "NORMAL_NOTICE"
              ? "Normal notice uses the current billing cycle notice rules and calculates the checkout date for you."
              : "Premature exit asks management to review a custom checkout date before the cycle ends."}
          </Text>
        </Card>

        {mode === "PREMATURE" ? (
          <CheckoutDateField value={requestedCheckoutDate} onChange={setRequestedCheckoutDate} />
        ) : null}

        <FormField
          label="Reason"
          maxLength={500}
          multiline
          onChangeText={setReason}
          placeholder="Add context for the property team."
          value={reason}
        />

        <SubmitButton busy={submitting} label="Submit exit request" onPress={() => void submit()} />
      </View>
    </Card>
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
        <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 15, fontWeight: "800" }} selectable>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back to tenancy"
      onPress={onPress}
      style={{ alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: "center", width: 42 }}
    >
      <ArrowLeft color={colors.ink} size={20} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function OptionGroup({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: ExitMode) => void;
  options: { label: string; value: ExitMode }[];
  selected: ExitMode;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <AnimatedPressable
              key={option.value}
              accessibilityRole="button"
              onPress={() => onSelect(option.value)}
              style={{
                backgroundColor: active ? colors.primarySoft : colors.surface,
                borderColor: active ? colors.primary : colors.border,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={{ color: active ? colors.primary : colors.ink, fontFamily: fonts.sans, fontSize: 13, fontWeight: "900" }} selectable>
                {option.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
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
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          {label}
        </Text>
        {maxLength ? (
          <Text style={[type.caption, { color: colors.kicker }]} selectable>
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

// Tap-to-open native date picker for the requested checkout. The checkout must be
// in the future, so the minimum selectable date is tomorrow.
function CheckoutDateField({ value, onChange }: { value: Date | null; onChange: (date: Date) => void }) {
  const { colors, fonts, type } = useTheme();
  const [show, setShow] = useState(false);

  // The native picker has no web implementation — dev-web falls back to a
  // plain YYYY-MM-DD field so the flow stays testable in a browser.
  if (Platform.OS === "web") {
    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
          Requested checkout
        </Text>
        <AppTextInput
          onChangeText={(text) => {
            const parsed = new Date(`${text.trim()}T00:00:00`);
            if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim()) && !Number.isNaN(parsed.getTime())) {
              onChange(parsed);
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
          defaultValue={value ? toISODate(value) : ""}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
        Requested checkout
      </Text>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={() => setShow(true)}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: 54,
          paddingHorizontal: spacing.md,
        }}
      >
        <CalendarDays color={colors.primary} size={18} strokeWidth={2.1} />
        <Text style={[type.body, { color: value ? colors.ink : colors.kicker, flex: 1 }]} selectable={false}>
          {value ? formatDateLong(value) : "Select a date"}
        </Text>
      </AnimatedPressable>
      {show ? (
        <DateTimePicker
          value={value ?? tomorrow()}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={tomorrow()}
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            if (Platform.OS !== "ios") {
              setShow(false);
            }
            if (event.type === "set" && selected) {
              onChange(selected);
            }
          }}
        />
      ) : null}
      {show && Platform.OS === "ios" ? <SubmitButton busy={false} label="Done" onPress={() => setShow(false)} /> : null}
    </View>
  );
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
