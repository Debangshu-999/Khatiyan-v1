import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarClock } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { SkeletonCard } from "@/components/skeleton";
import {
  useCreateNormalExitRequestMutation,
  useCreatePrematureExitRequestMutation,
  useGetMyActiveTenancyQuery,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ExitMode = "NORMAL_NOTICE" | "PREMATURE";

export default function TenancyExitRequestScreen() {
  const router = useRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const activeTenancyQuery = useGetMyActiveTenancyQuery();
  const [createNormalExit, normalState] = useCreateNormalExitRequestMutation();
  const [createPrematureExit, prematureState] = useCreatePrematureExitRequestMutation();
  const [mode, setMode] = useState<ExitMode>("NORMAL_NOTICE");
  const [requestedCheckoutDate, setRequestedCheckoutDate] = useState("");
  const [reason, setReason] = useState("");
  // Validation/submit failures surface as toasts; success navigates to /tenancy.
  const setError = (value: string | null) => {
    if (value) {
      toast.error(value);
    }
  };
  const submitting = normalState.isLoading || prematureState.isLoading;

  const submit = async () => {
    const trimmedReason = reason.trim();

    try {
      if (mode === "NORMAL_NOTICE") {
        await createNormalExit({ reason: trimmedReason || null }).unwrap();
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedCheckoutDate.trim())) {
          setError("Enter checkout date in YYYY-MM-DD format.");
          return;
        }
        await createPrematureExit({
          reason: trimmedReason || null,
          requestedCheckoutDate: requestedCheckoutDate.trim(),
        }).unwrap();
      }

      router.replace({ pathname: "/tenancy", params: { exitRequestCreated: "1" } });
    } catch {
      setError("Could not create exit request. Check notice rules and try again.");
    }
  };

  return (
    <ScreenScrollView>
      <ScreenHeader
        eyebrow="REQUEST"
        title="Exit"
        italicTail="tenancy."
        subtitle="Choose normal notice or premature exit and share the reason for review."
        trailing={<BackButton onPress={() => router.back()} />}
      />

      {activeTenancyQuery.isFetching ? (
        <SkeletonCard />
      ) : !activeTenancyQuery.data ? (
        <EmptyState
          icon={CalendarClock}
          eyebrow="No active tenancy"
          title="No current stay"
          description="Exit requests can be raised only from an active tenancy."
        />
      ) : (
        <Card>
          <View style={{ gap: spacing.md }}>
            <OptionGroup
              label="Exit type"
              options={[
                { label: "Normal notice", value: "NORMAL_NOTICE" },
                { label: "Premature", value: "PREMATURE" },
              ]}
              selected={mode}
              onSelect={(value) => {
                setMode(value);
                setError(null);
              }}
            />

            <Card tone="sunken">
              <Text style={[type.body, { color: colors.muted }]} selectable>
                {mode === "NORMAL_NOTICE"
                  ? "Normal notice uses the current billing cycle notice rules and calculates the checkout date for you."
                  : "Premature exit asks management to review a custom checkout date before the cycle ends."}
              </Text>
            </Card>

            {mode === "PREMATURE" ? (
              <FormField
                label="Requested checkout"
                onChangeText={(value) => {
                  setRequestedCheckoutDate(value);
                  setError(null);
                }}
                placeholder="YYYY-MM-DD"
                value={requestedCheckoutDate}
              />
            ) : null}

            <FormField
              label="Reason"
              maxLength={500}
              multiline
              onChangeText={(value) => {
                setReason(value);
                setError(null);
              }}
              placeholder="Add context for the property team."
              value={reason}
            />


            <AnimatedPressable
              accessibilityRole="button"
              onPress={submit}
              style={{
                alignItems: "center",
                backgroundColor: colors.primary,
                borderRadius: 14,
                justifyContent: "center",
                minHeight: 52,
                opacity: submitting ? 0.75 : 1,
                padding: spacing.md,
              }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 15, fontWeight: "800" }} selectable>
                  Submit exit request
                </Text>
              )}
            </AnimatedPressable>
          </View>
        </Card>
      )}
    </ScreenScrollView>
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
