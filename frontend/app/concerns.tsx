import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Modal, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, CheckCircle2, Clock3, RotateCcw, X } from "lucide-react-native";

import { ActionCard } from "@/components/action-card";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { StatusPill } from "@/components/status-pill";
import type { ConcernSummary } from "@/store/services/concern-api";
import {
  useListMyConcernHistoryQuery,
  useListMyCurrentConcernsQuery,
  useReopenConcernMutation,
} from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

export default function ConcernsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ createdConcern?: string }>();
  const { colors, type } = useTheme();
  const currentQuery = useListMyCurrentConcernsQuery();
  const historyQuery = useListMyConcernHistoryQuery();
  const currentData = currentQuery.data ?? [];
  const currentConcerns = currentData.filter(isActiveConcern);
  const resolvedFromCurrent = currentData.filter((concern) => !isActiveConcern(concern));
  const concernHistory = uniqueConcerns([...resolvedFromCurrent, ...(historyQuery.data ?? [])]);
  const [reopenConcern, reopenState] = useReopenConcernMutation();
  const [selectedConcern, setSelectedConcern] = useState<ConcernSummary | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTranslateX = useRef(new Animated.Value(180)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (params.createdConcern !== "1" || toastShownRef.current) {
      return;
    }

    toastShownRef.current = true;
    setToastVisible(true);
    toastTranslateX.setValue(180);
    toastOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(toastTranslateX, {
        duration: 260,
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(toastOpacity, {
        duration: 220,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastTranslateX, {
          duration: 220,
          toValue: 180,
          useNativeDriver: true,
        }),
        Animated.timing(toastOpacity, {
          duration: 180,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start(() => setToastVisible(false));
    }, 3000);

    return () => clearTimeout(timer);
  }, [params.createdConcern, toastOpacity, toastTranslateX]);

  const closeReopenModal = () => {
    setSelectedConcern(null);
    setReopenReason("");
    setReopenError(null);
  };

  const submitReopen = async () => {
    if (!selectedConcern) {
      return;
    }

    const trimmedReason = reopenReason.trim();

    if (!trimmedReason) {
      setReopenError("Add a short reason before reopening.");
      return;
    }

    try {
      await reopenConcern({ concernId: selectedConcern.id, reopenReason: trimmedReason }).unwrap();
      closeReopenModal();
    } catch {
      setReopenError("Could not reopen this concern. Please check the reopen window and try again.");
    }
  };

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView>
        <ScreenHeader
          eyebrow="Tenant workspace"
          title="Concerns,"
          italicTail="tracked."
          subtitle="Current concerns, history and concern actions for your active tenancy."
        />

        <Section eyebrow="Create" title="Raise a concern">
          <ActionCard
            meta="New"
            title="Create concern"
            description="Add category, priority and details for the property team."
            onPress={() => router.push("/create-concern")}
            tone="primary"
          />
        </Section>

        <Section eyebrow="Current" title="Open concerns">
          {currentQuery.isFetching ? (
            <Card>
              <ActivityIndicator color={colors.primary} />
              <Text style={[type.body, { color: colors.muted, textAlign: "center" }]} selectable>
                Loading current concerns
              </Text>
            </Card>
          ) : currentConcerns.length > 0 ? (
            currentConcerns.map((concern) => <ConcernCard concern={concern} key={concern.id} />)
          ) : (
            <EmptyState
              eyebrow="Current"
              title="No open concerns"
              description="New concerns and in-progress issues will appear here."
            />
          )}
        </Section>

        <Section eyebrow="History" title="Resolved concerns">
          {historyQuery.isFetching ? (
            <Card>
              <ActivityIndicator color={colors.primary} />
            </Card>
          ) : concernHistory.length > 0 ? (
            concernHistory
              .slice(0, 8)
              .map((concern) => (
                <ConcernCard concern={concern} key={concern.id} onReopen={() => setSelectedConcern(concern)} />
              ))
          ) : (
            <EmptyState
              icon={CheckCircle2}
              eyebrow="History"
              title="No concern history"
              description="Resolved or closed concerns will be kept here for reference."
            />
          )}
        </Section>

        <ReopenConcernModal
          error={reopenError}
          loading={reopenState.isLoading}
          onChangeReason={(value) => {
            setReopenReason(value);
            setReopenError(null);
          }}
          onClose={closeReopenModal}
          onSubmit={submitReopen}
          reason={reopenReason}
          concern={selectedConcern}
        />
      </ScreenScrollView>

      {toastVisible ? (
        <Animated.View
          pointerEvents="none"
          style={{
            opacity: toastOpacity,
            position: "absolute",
            right: spacing.md,
            top: spacing.lg,
            transform: [{ translateX: toastTranslateX }],
            zIndex: 20,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.borderStrong,
              borderRadius: 999,
              borderWidth: 1,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          >
            <Text style={[type.eyebrow, { color: colors.primary, fontSize: 10 }]} selectable>
              Concern created
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ConcernCard({ concern, onReopen }: { concern: ConcernSummary; onReopen?: () => void }) {
  const { colors, type } = useTheme();
  const active = isActiveConcern(concern);
  const canReopen = concern.status === "RESOLVED" && isFutureDate(concern.reopenUntil);

  return (
    <Card tone={active ? "default" : "sunken"}>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: active ? colors.primarySoft : colors.surface,
            borderColor: colors.border,
            borderRadius: 12,
            borderWidth: 1,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          {active ? (
            <AlertCircle color={colors.primary} size={19} strokeWidth={2.2} />
          ) : concern.status === "RESOLVED" ? (
            <Clock3 color={colors.kicker} size={19} strokeWidth={2.2} />
          ) : (
            <CheckCircle2 color={colors.kicker} size={19} strokeWidth={2.2} />
          )}
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
            <Text style={[type.eyebrow, { color: colors.kicker, flex: 1 }]} selectable>
              {humanizeToken(concern.category)} · {humanizeToken(concern.priority)}
            </Text>
            <StatusPill label={humanizeToken(concern.status)} tone={active ? "primary" : "neutral"} />
          </View>
          <Text style={[type.display, { color: colors.ink, fontSize: 19, lineHeight: 24 }]} selectable>
            {concern.title}
          </Text>
          <Text style={[type.body, { color: colors.muted }]} selectable>
            {concern.description}
          </Text>
          {!active ? (
            <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
              {concern.resolutionNote ? (
                <InfoBlock label="Admin resolution notes" value={concern.resolutionNote} tone="resolution" />
              ) : (
                <InfoBlock label="Admin resolution notes" value="No resolution notes were added." />
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                {concern.resolvedAt ? (
                  <DateBadge label="Resolved" value={concern.resolvedAt} tone="neutral" />
                ) : null}
                {concern.reopenUntil ? (
                  <DateBadge
                    label={canReopen ? "Reopen until" : "Window expired"}
                    value={concern.reopenUntil}
                    tone={canReopen ? "reopen" : "expired"}
                  />
                ) : null}
              </View>
              {concern.reopened && concern.reopenReason ? (
                <InfoBlock label="Last reopen reason" value={concern.reopenReason} />
              ) : null}
              {canReopen && onReopen ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={onReopen}
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.borderStrong,
                    borderRadius: 12,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    justifyContent: "center",
                    minHeight: 46,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <RotateCcw color={colors.primary} size={16} strokeWidth={2.2} />
                  <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
                    Reopen concern
                  </Text>
                </AnimatedPressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function InfoBlock({ label, tone, value }: { label: string; tone?: "resolution"; value: string }) {
  const { colors, type } = useTheme();
  const backgroundColor = tone === "resolution" ? colors.surfaceRaised : colors.surfaceRaised;
  const borderColor = tone === "resolution" ? colors.borderStrong : colors.border;

  return (
    <View
      style={{
        backgroundColor,
        borderColor,
        borderRadius: 14,
        borderWidth: 1,
        gap: spacing.xs,
        padding: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: tone === "resolution" ? colors.primary : colors.kicker }]} selectable>
        {label}
      </Text>
      <Text style={[type.body, { color: colors.inkSoft }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function DateBadge({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "expired" | "neutral" | "reopen";
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const dateParts = formatDateParts(value);
  const isReopen = tone === "reopen";
  const isExpired = tone === "expired";
  const borderColor = isReopen ? colors.borderStrong : isExpired ? colors.border : colors.border;
  const textColor = isReopen ? colors.primary : isExpired ? colors.muted : colors.kicker;
  const backgroundColor = isReopen ? colors.primarySoft : isExpired ? colors.neutralSoft : colors.surfaceRaised;

  return (
    <View
      style={{
        backgroundColor,
        borderColor,
        borderRadius: 14,
        borderWidth: 1,
        flexBasis: "47%",
        flexGrow: 1,
        gap: 4,
        minWidth: 132,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={[type.eyebrow, { color: textColor, fontSize: 10 }]} selectable>
        {label}
      </Text>
      <Text
        style={{
          color: colors.ink,
          fontFamily: fonts.display,
          fontSize: 19,
          fontWeight: "500",
          lineHeight: 23,
        }}
        selectable
      >
        {dateParts.date}
      </Text>
      <Text style={[type.body, { color: colors.muted, fontFamily: fonts.mono, fontSize: 12 }]} selectable>
        {dateParts.time}
      </Text>
    </View>
  );
}

function ReopenConcernModal({
  concern,
  error,
  loading,
  onChangeReason,
  onClose,
  onSubmit,
  reason,
}: {
  concern: ConcernSummary | null;
  error: string | null;
  loading: boolean;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  reason: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(concern)}>
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
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            borderRadius: 24,
            borderWidth: 1,
            gap: spacing.md,
            maxWidth: 520,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
                Reopen concern
              </Text>
              <Text
                style={{
                  color: colors.ink,
                  fontFamily: fonts.display,
                  fontSize: 24,
                  fontWeight: "500",
                  lineHeight: 29,
                }}
                selectable
              >
                {concern?.title ?? "Concern"}
              </Text>
              <Text style={[type.body, { color: colors.muted }]} selectable>
                Tell the property team why this resolution still needs work.
              </Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="Close reopen concern"
              onPress={onClose}
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
              <X color={colors.ink} size={20} strokeWidth={2.2} />
            </AnimatedPressable>
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Reason
            </Text>
            <TextInput
              editable={!loading}
              multiline
              onChangeText={onChangeReason}
              placeholder="What still needs to be fixed?"
              placeholderTextColor={colors.kicker}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 14,
                borderWidth: 1,
                color: colors.ink,
                fontFamily: fonts.sans,
                fontSize: 15,
                minHeight: 110,
                padding: spacing.md,
                textAlignVertical: "top",
              }}
              value={reason}
            />
          </View>

          {error ? (
            <Text style={[type.body, { color: colors.danger, fontWeight: "700" }]} selectable>
              {error}
            </Text>
          ) : null}

          <AnimatedPressable
            accessibilityRole="button"
            onPress={onSubmit}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 14,
              minHeight: 52,
              justifyContent: "center",
              opacity: loading ? 0.7 : 1,
              padding: spacing.md,
            }}
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.sans, fontSize: 15, fontWeight: "800" }} selectable>
                Reopen concern
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

function isActiveConcern(concern: ConcernSummary) {
  return concern.status !== "RESOLVED" && concern.status !== "CLOSED";
}

function isFutureDate(value: string | null) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

function uniqueConcerns(concerns: ConcernSummary[]) {
  const seen = new Set<string>();

  return concerns.filter((concern) => {
    if (seen.has(concern.id)) {
      return false;
    }

    seen.add(concern.id);
    return true;
  });
}

function formatDateParts(value: string) {
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

  return { date, time };
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
