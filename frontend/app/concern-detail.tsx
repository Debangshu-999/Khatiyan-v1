import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AppTextInput } from "@/components/app-text-input";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { ArrowLeft, CheckCircle2, Clock3, ImageOff, Images, RotateCcw, ShieldAlert, UserRound, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import {
  type ConcernStatus,
  type ConcernSummary,
  useListMyConcernHistoryQuery,
  useListMyCurrentConcernsQuery,
  useReopenConcernMutation,
} from "@/store/services/concern-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Tenant-side concern detail — read-only mirror of the owner concern detail:
// media, live status, notes from the property team and the reopen action.
export default function ConcernDetailScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ concernId?: string }>();
  const concernId = typeof params.concernId === "string" ? params.concernId : "";

  const currentQuery = useListMyCurrentConcernsQuery();
  const historyQuery = useListMyConcernHistoryQuery();
  const [reopenConcern, reopenState] = useReopenConcernMutation();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);

  const liveConcern = useMemo(() => {
    return [...(currentQuery.data ?? []), ...(historyQuery.data?.items ?? [])].find((item) => item.id === concernId) ?? null;
  }, [concernId, currentQuery.data, historyQuery.data]);

  // Retain the last-known concern so the screen doesn't flash "not found"
  // while the lists refetch after a reopen.
  const [retained, setRetained] = useState<ConcernSummary | null>(null);
  useEffect(() => {
    if (liveConcern) {
      setRetained(liveConcern);
    }
  }, [liveConcern]);
  const concern = liveConcern ?? retained;

  const loading = currentQuery.isFetching || historyQuery.isFetching;
  const resolved = !!concern && (concern.status === "RESOLVED" || concern.status === "CLOSED");
  const canReopen = !!concern && concern.status === "RESOLVED" && isFutureDate(concern.reopenUntil);

  function closeReopenModal() {
    setReopenOpen(false);
    setReopenReason("");
    setReopenError(null);
  }

  async function submitReopen() {
    if (!concern) {
      return;
    }

    const trimmedReason = reopenReason.trim();
    if (!trimmedReason) {
      setReopenError("Add a short reason before reopening.");
      return;
    }

    try {
      await reopenConcern({ concernId: concern.id, reopenReason: trimmedReason }).unwrap();
      closeReopenModal();
    } catch {
      setReopenError("Could not reopen this concern. Please check the reopen window and try again.");
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader onBack={() => router.back()}
        eyebrow="Concern detail"
        title={concern?.referenceCode ?? "Concern"}
        italicTail="details."
        subtitle="Track the status, updates and resolution of your concern."
      />

      {loading && !concern ? (
        <Card>
          <Text style={[type.body, { color: colors.muted }]} selectable>
            Loading concern...
          </Text>
        </Card>
      ) : null}
      {!loading && !concern ? (
        <EmptyState
          icon={ImageOff}
          eyebrow="Concern"
          title="Concern not found"
          description="Go back to your concerns and open it again."
        />
      ) : null}

      {concern ? (
        <>
          <ConcernMediaCarousel concern={concern} />

          <ConcernDataCard concern={concern} />

          <Card>
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                Description
              </Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 23, lineHeight: 29 }]} selectable>
                {concern.title}
              </Text>
              <Text style={[type.body, { color: colors.muted }]} selectable>
                {concern.description}
              </Text>
            </View>
          </Card>

          {concern.statusNote ? (
            <NoteCard title="Status update from the property team" body={concern.statusNote} />
          ) : null}

          {resolved ? (
            <NoteCard
              tone="success"
              title="Resolution notes"
              body={concern.resolutionNote ?? "No resolution notes were added."}
            />
          ) : null}

          {canReopen ? (
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => setReopenOpen(true)}
              style={{
                alignItems: "center",
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.borderStrong,
                borderRadius: 14,
                borderWidth: 1,
                flexDirection: "row",
                gap: spacing.sm,
                justifyContent: "center",
                minHeight: 50,
                paddingHorizontal: spacing.md,
              }}
            >
              <RotateCcw color={colors.primary} size={16} strokeWidth={2.2} />
              <Text style={[type.eyebrow, { color: colors.primary }]} selectable>
                Reopen concern
              </Text>
            </AnimatedPressable>
          ) : null}

          {reopenOpen ? (
            <ReopenConcernModal
              concern={concern}
              error={reopenError}
              loading={reopenState.isLoading}
              onChangeReason={(value) => {
                setReopenReason(value);
                setReopenError(null);
              }}
              onClose={closeReopenModal}
              onSubmit={submitReopen}
              reason={reopenReason}
            />
          ) : null}
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function ConcernMediaCarousel({ concern }: { concern: ConcernSummary }) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const images = useMemo(
    () => concern.photos.map((photo) => photo.photoUrl).filter((url): url is string => Boolean(url)),
    [concern.photos],
  );
  const activeImage = images[activeIndex] ?? images[0];

  if (!images.length) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 16, gap: spacing.sm, justifyContent: "center", minHeight: 180, padding: spacing.lg }}>
        <Images color={colors.primary} size={38} strokeWidth={1.8} />
        <Text style={{ color: colors.primary, fontSize: 17, fontWeight: "900", textAlign: "center" }} selectable>
          No images attached
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 20, textAlign: "center" }} selectable>
          Photos you attach while raising a concern appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.primarySoft, borderRadius: 16, height: 260, overflow: "hidden" }}>
      <Pressable accessibilityLabel="Open concern image" onPress={() => setExpanded(true)} style={{ flex: 1 }}>
        <Image source={{ uri: activeImage }} style={{ height: "100%", width: "100%" }} resizeMode="cover" />
      </Pressable>
      {images.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ bottom: spacing.md, left: spacing.md, position: "absolute", right: spacing.md }}
          contentContainerStyle={{ gap: spacing.xs }}
        >
          {images.map((imageUrl, index) => (
            <Pressable
              accessibilityLabel={`Show concern image ${index + 1}`}
              key={`${imageUrl}-${index}`}
              onPress={() => setActiveIndex(index)}
              style={{ borderColor: index === activeIndex ? colors.primary : colors.surface, borderRadius: 12, borderWidth: 2, overflow: "hidden" }}
            >
              <Image source={{ uri: imageUrl }} style={{ height: 52, width: 68 }} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Modal animationType="fade" onRequestClose={() => setExpanded(false)} statusBarTranslucent transparent visible={expanded}>
        <View style={{ backgroundColor: "rgba(0,0,0,0.92)", flex: 1, justifyContent: "center", padding: spacing.md }}>
          <AnimatedPressable
            accessibilityLabel="Close image"
            onPress={() => setExpanded(false)}
            style={{ alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, height: 44, justifyContent: "center", position: "absolute", right: spacing.lg, top: spacing.xl, width: 44, zIndex: 2 }}
          >
            <X color="#fff" size={22} strokeWidth={2.5} />
          </AnimatedPressable>
          <Image source={{ uri: activeImage }} style={{ height: "78%", width: "100%" }} resizeMode="contain" />
          <Text style={{ color: "#fff", fontWeight: "800", textAlign: "center" }} selectable>
            {concern.referenceCode}
          </Text>
        </View>
      </Modal>
    </View>
  );
}

type BadgeTone = "primary" | "danger" | "success" | "warning" | "neutral";

function ConcernDataCard({ concern }: { concern: ConcernSummary }) {
  const { colors, fonts, type } = useTheme();
  const { width } = useWindowDimensions();
  const singleColumn = width < 390;
  // Narrow screens stack every fact full-width; wider screens keep a 2-up grid.
  const status = tonePalette(statusTone(concern.status), colors);
  const escalation = tonePalette(escalationTone(concern.escalationLevel), colors);
  const canReopen = concern.status === "RESOLVED" && isFutureDate(concern.reopenUntil);
  const assignedTo = concern.assignedToName ?? (concern.assignedToUserId ? "Property team" : "Not assigned yet");

  return (
    <Card style={{ overflow: "hidden", padding: 0 }}>
      <View style={{ backgroundColor: status.fg, height: 5 }} />
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View style={{ alignItems: "center", backgroundColor: status.bg, borderColor: status.border, borderRadius: 18, borderWidth: 1, height: 56, justifyContent: "center", width: 56 }}>
            <StatusIcon concern={concern} color={status.fg} />
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
              Current status
            </Text>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 25, fontWeight: "700", lineHeight: 31 }} selectable>
              {humanizeToken(concern.status)}
            </Text>
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              Updated {formatDateTime(concern.updatedAt)}
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surfaceSunken, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <View style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 40, justifyContent: "center", width: 40 }}>
              <UserRound color={colors.primary} size={20} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
                Assigned to
              </Text>
              <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
                {assignedTo}
              </Text>
            </View>
          </View>
          {concern.assignedAt ? (
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              Assigned on {formatDateTime(concern.assignedAt)}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <StatusSignal label="Escalation" palette={escalation} subtle value={humanizeToken(concern.escalationLevel)} />
        </View>

        {concern.reopened ? (
          <View style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger, borderRadius: 14, borderWidth: 1, gap: spacing.xs, padding: spacing.md }}>
            <Text style={[type.eyebrow, { color: colors.danger }]} selectable>
              Reopened
            </Text>
            <Text style={[type.body, { color: colors.ink }]} selectable>
              {concern.reopenReason ?? "No reopen reason provided."}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          <FactTile label="Category" value={humanizeToken(concern.category)} wide={singleColumn} />
          <FactTile label="Room" value={concern.roomNumber} wide={singleColumn} />
          <FactTile label="Tenancy" value={concern.tenancyReferenceCode} wide />
        </View>

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View style={{ gap: spacing.sm }}>
          <TimelineRow label="Raised" value={formatDateTime(concern.createdAt)} />
          {concern.assignedAt ? <TimelineRow label="Assigned" value={formatDateTime(concern.assignedAt)} /> : null}
          {concern.inProgressAt ? <TimelineRow label="In progress" value={formatDateTime(concern.inProgressAt)} /> : null}
          {concern.resolvedAt ? <TimelineRow label="Resolved" value={formatDateTime(concern.resolvedAt)} /> : null}
          {concern.reopenUntil ? (
            <TimelineRow label={canReopen ? "Reopen until" : "Reopen window ended"} value={formatDateTime(concern.reopenUntil)} />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function StatusIcon({ color, concern }: { color: string; concern: ConcernSummary }) {
  if (concern.reopened) return <RotateCcw color={color} size={24} strokeWidth={2.4} />;
  if (concern.status === "RESOLVED" || concern.status === "CLOSED") return <CheckCircle2 color={color} size={25} strokeWidth={2.4} />;
  if (concern.status === "UNDER_REVIEW") return <Clock3 color={color} size={25} strokeWidth={2.4} />;
  return <ShieldAlert color={color} size={25} strokeWidth={2.4} />;
}

function StatusSignal({
  label,
  palette,
  subtle,
  value,
}: {
  label: string;
  palette: { bg: string; border: string; fg: string };
  subtle?: boolean;
  value: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: subtle ? colors.surfaceSunken : palette.bg,
        borderColor: subtle ? colors.border : palette.border,
        borderRadius: 12,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xxs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={[type.eyebrow, { color: palette.fg, letterSpacing: 1.2 }]} selectable>
        {label}
      </Text>
      <Text style={[type.label, { color: subtle ? palette.fg : colors.ink }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function FactTile({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  const { colors, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderColor: colors.border,
        borderRadius: 12,
        borderWidth: 1,
        gap: spacing.xs,
        padding: spacing.md,
        width: wide ? "100%" : "48%",
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker, fontSize: 10 }]} selectable>
        {label}
      </Text>
      <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function TimelineRow({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
      <View style={{ backgroundColor: colors.borderStrong, borderRadius: 999, height: 8, width: 8 }} />
      <Text style={[type.caption, { color: colors.muted, flex: 1, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "800", textAlign: "right" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function NoteCard({ body, title, tone }: { body: string; title: string; tone?: "success" }) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: tone === "success" ? colors.successText : colors.kicker }]} selectable>
          {title}
        </Text>
        <Text style={[type.body, { color: colors.ink }]} selectable>
          {body}
        </Text>
      </View>
    </Card>
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
  concern: ConcernSummary;
  error: string | null;
  loading: boolean;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  reason: string;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
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
                  {concern.title}
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
              <AppTextInput
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
                justifyContent: "center",
                minHeight: 52,
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        borderColor: colors.border,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.xs,
        height: 36,
        paddingHorizontal: spacing.sm,
      }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700" }} selectable>
        Back
      </Text>
    </AnimatedPressable>
  );
}

function tonePalette(tone: BadgeTone, colors: ReturnType<typeof useTheme>["colors"]) {
  const palette: Record<BadgeTone, { bg: string; border: string; fg: string }> = {
    danger: { bg: colors.dangerSoft, border: colors.danger, fg: colors.danger },
    neutral: { bg: colors.neutralSoft, border: colors.borderStrong, fg: colors.neutralText },
    primary: { bg: colors.primarySoft, border: colors.primary, fg: colors.primary },
    success: { bg: colors.successSoft, border: colors.successText, fg: colors.successText },
    warning: { bg: colors.warningSoft, border: colors.warningText, fg: colors.warningText },
  };
  return palette[tone];
}

function statusTone(status: ConcernStatus): BadgeTone {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "OPEN") return "danger";
  if (status === "UNDER_REVIEW") return "primary";
  return "warning";
}

function escalationTone(escalationLevel: string): BadgeTone {
  if (escalationLevel === "CRITICAL") return "danger";
  if (escalationLevel === "ESCALATED") return "warning";
  if (escalationLevel === "ATTENTION") return "primary";
  return "neutral";
}

function isFutureDate(value: string | null) {
  return Boolean(value && new Date(value).getTime() > Date.now());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
