import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CheckCircle2, Clock3, ImageOff, Images, RotateCcw, ShieldAlert, UserRound, UserRoundPlus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { useToast } from "@/components/toast";
import { ActionButton, BackButton, FormInput, IconButton, humanizeToken } from "@/features/owner/owner-ui";
import {
  type ConcernStatus,
  type ConcernSummary,
  useAssignConcernMutation,
  useListPropertyAvailableConcernsQuery,
  useListPropertyConcernHistoryQuery,
  useListPropertyConcernMonitorQuery,
  useListPropertyEscalatedConcernsQuery,
  useListUndertakenConcernsQuery,
  useResolveConcernMutation,
  useUpdateConcernStatusMutation,
} from "@/store/services/concern-api";
import { useAppSelector } from "@/store/hooks";
import { useListPropertyManagersQuery, type PropertyManager } from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type DetailMode = "property" | "taken" | "history";

export default function OwnerConcernDetailScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();
  const currentUserRole = useAppSelector((state) => state.auth.user?.role);
  const params = useLocalSearchParams<{ concernId?: string; propertyId?: string; mode?: DetailMode }>();
  const concernId = typeof params.concernId === "string" ? params.concernId : "";
  const propertyId = typeof params.propertyId === "string" ? params.propertyId : "";
  const mode: DetailMode = params.mode === "history" || params.mode === "taken" ? params.mode : "property";

  const availableQuery = useListPropertyAvailableConcernsQuery(propertyId, { skip: !propertyId });
  const escalatedQuery = useListPropertyEscalatedConcernsQuery(propertyId, { skip: !propertyId });
  // Lookup-only (find this concern by id), so request a large page to stay
  // consistent with the sibling full-list queries above.
  const historyQuery = useListPropertyConcernHistoryQuery({ page: 0, propertyId, size: 200 }, { skip: !propertyId });
  const monitorQuery = useListPropertyConcernMonitorQuery(propertyId, { skip: !propertyId || currentUserRole !== "OWNER" });
  const undertakenQuery = useListUndertakenConcernsQuery(undefined, { skip: !propertyId });
  const managersQuery = useListPropertyManagersQuery(propertyId, { skip: !propertyId || currentUserRole !== "OWNER" });
  const [updateStatus, updateState] = useUpdateConcernStatusMutation();
  const [assignConcern, assignState] = useAssignConcernMutation();
  const [resolveConcern, resolveState] = useResolveConcernMutation();
  const [statusNote, setStatusNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  // Action results route to the global toast; failures/validation read as errors.
  const setMessage = (value: string | null) => {
    if (value) {
      toast.show(value, /could not|required|cannot|unable|invalid|failed/i.test(value) ? "error" : "success");
    }
  };

  const liveConcern = useMemo(() => {
    return [
      ...(availableQuery.data ?? []),
      ...(escalatedQuery.data ?? []),
      ...(monitorQuery.data ?? []),
      ...(undertakenQuery.data ?? []).filter((item) => item.propertyId === propertyId),
      ...(historyQuery.data?.items ?? []),
    ].find((item) => item.id === concernId) ?? null;
  }, [availableQuery.data, concernId, escalatedQuery.data, historyQuery.data, monitorQuery.data, propertyId, undertakenQuery.data]);

  // Retain the last-known concern so it doesn't flash "not found" while the
  // queues refetch after a status change.
  const [retained, setRetained] = useState<ConcernSummary | null>(null);
  useEffect(() => {
    if (liveConcern) {
      setRetained(liveConcern);
    }
  }, [liveConcern]);
  const concern = liveConcern ?? retained;

  // Prefill the status note once per concern (in non-property modes) so editing
  // works against the current note instead of a blank field.
  useEffect(() => {
    if (mode !== "property" && concern) {
      setStatusNote(concern.statusNote ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concern?.id]);

  const loading = availableQuery.isFetching || escalatedQuery.isFetching || monitorQuery.isFetching || undertakenQuery.isFetching || historyQuery.isFetching;
  const noteDirty = !!concern && statusNote.trim() !== (concern.statusNote ?? "").trim();
  const canAssignManager = currentUserRole === "OWNER"
    && mode === "property"
    && !!concern
    && concern.status !== "RESOLVED"
    && concern.status !== "CLOSED";

  async function changeStatus(status: ConcernStatus) {
    if (!concern) return;
    try {
      await updateStatus({ concernId: concern.id, status, statusNote: statusNote.trim() || null }).unwrap();
      // Transitions that move the concern out of this view return to the queue,
      // which refetches and shows it in its new tab — avoids in-place churn.
      if (status === "UNDER_REVIEW" || status === "OPEN") {
        router.back();
        return;
      }
      setMessage(`Concern moved to ${humanizeToken(status)}.`);
    } catch {
      setMessage("Could not update status.");
    }
  }

  async function saveStatusNote() {
    if (!concern) return;
    try {
      await updateStatus({ concernId: concern.id, status: concern.status, statusNote: statusNote.trim() || null }).unwrap();
      setMessage("Status note saved.");
    } catch {
      setMessage("Could not save status note.");
    }
  }

  async function submitResolution() {
    if (!concern) return;
    if (!resolutionNote.trim()) {
      setMessage("Resolution note is required.");
      return;
    }
    try {
      await resolveConcern({ concernId: concern.id, resolutionNote: resolutionNote.trim() }).unwrap();
      setResolutionNote("");
      setMessage("Concern resolved.");
      router.back();
    } catch {
      setMessage("Could not resolve concern.");
    }
  }

  async function submitAssignment(managerUserId: string) {
    if (!concern) return;
    try {
      await assignConcern({ assignedToUserId: managerUserId, concernId: concern.id }).unwrap();
      setAssignOpen(false);
      setMessage("Concern assigned.");
      router.back();
    } catch {
      setMessage("Could not assign concern.");
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <ScreenHeader onBack={() => router.back()}
        eyebrow="Concern detail"
        title={concern?.referenceCode ?? "Concern"}
        italicTail="details."
        subtitle="Review the concern, keep the tenant updated, and resolve it."
      />

      {loading && !concern ? <Card><Text style={[type.body, { color: colors.muted }]} selectable>Loading concern...</Text></Card> : null}
      {!loading && !concern ? <EmptyState icon={ImageOff} eyebrow="Concern" title="Concern not found" description="Refresh the queue and open the concern again." /> : null}

      {concern ? (
        <>
          <ConcernMediaCarousel concern={concern} />

          <ConcernDataCard concern={concern} />

          <Card>
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Description</Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 23, lineHeight: 29 }]} selectable>{concern.title}</Text>
              <Text style={[type.body, { color: colors.muted }]} selectable>{concern.description}</Text>
            </View>
          </Card>

          {concern.resolutionNote ? <NoteCard title="Resolution note" body={concern.resolutionNote} /> : null}

          {mode !== "history" && concern.status !== "RESOLVED" && concern.status !== "CLOSED" ? (
            <>
              <Card>
                <View style={{ gap: spacing.md }}>
                  <FormInput
                    label="Status note (shared with tenant)"
                    multiline
                    onChangeText={setStatusNote}
                    placeholder={mode === "property" ? "Add a note before taking this up." : "Update the latest status for the tenant."}
                    value={statusNote}
                  />
                  {mode !== "property" ? (
                    <ActionButton disabled={updateState.isLoading || !noteDirty} icon={CheckCircle2} label="Save" onPress={saveStatusNote} />
                  ) : null}
                </View>
              </Card>
              {mode === "property" ? (
                <View style={{ gap: spacing.sm }}>
                  <ActionButton disabled={updateState.isLoading} icon={Clock3} label="Mark in review" onPress={() => changeStatus("UNDER_REVIEW")} />
                  {canAssignManager ? (
                    <ActionButton
                      disabled={assignState.isLoading}
                      icon={UserRoundPlus}
                      label="Assign to manager"
                      onPress={() => setAssignOpen(true)}
                      variant="secondary"
                    />
                  ) : null}
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <ActionButton disabled={updateState.isLoading} icon={RotateCcw} label="Release" onPress={() => changeStatus("OPEN")} variant="secondary" />
                  {concern.status === "UNDER_REVIEW" ? (
                    <ActionButton disabled={updateState.isLoading} icon={ShieldAlert} label="Mark in progress" onPress={() => changeStatus("IN_PROGRESS")} />
                  ) : null}
                </View>
              )}
            </>
          ) : concern.statusNote ? (
            <NoteCard title="Status note" body={concern.statusNote} />
          ) : null}

          {mode === "taken" && concern.status === "IN_PROGRESS" ? (
            <Card>
              <View style={{ gap: spacing.md }}>
                <FormInput label="Resolution note" multiline onChangeText={setResolutionNote} placeholder="What was done to resolve this?" value={resolutionNote} />
                <ActionButton disabled={resolveState.isLoading} icon={CheckCircle2} label={resolveState.isLoading ? "Resolving" : "Resolve concern"} onPress={submitResolution} />
              </View>
            </Card>
          ) : null}

          {assignOpen && concern ? (
            <AssignConcernModal
              loading={managersQuery.isFetching || assignState.isLoading}
              managers={(managersQuery.data ?? []).filter((manager) => manager.active && manager.accountActive)}
              onAssign={submitAssignment}
              onClose={() => setAssignOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </ScreenScrollView>
  );
}

function AssignConcernModal({
  loading,
  managers,
  onAssign,
  onClose,
}: {
  loading: boolean;
  managers: PropertyManager[];
  onAssign: (managerUserId: string) => void;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: spacing.md, maxHeight: "78%", padding: spacing.lg }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Assign concern</Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 24, lineHeight: 30 }]} selectable>Choose a manager</Text>
            </View>
            <IconButton accessibilityLabel="Close assignment" icon={X} onPress={onClose} />
          </View>

          {loading ? <Text style={[type.body, { color: colors.muted }]} selectable>Loading managers...</Text> : null}
          {!loading && managers.length === 0 ? (
            <EmptyState icon={UserRoundPlus} eyebrow="Managers" title="No active managers" description="Add a manager to this property before assigning concerns." />
          ) : null}
          {!loading && managers.length > 0 ? (
            <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
              {managers.map((manager) => (
                <AnimatedPressable
                  accessibilityRole="button"
                  key={manager.managerUserId}
                  onPress={() => onAssign(manager.managerUserId)}
                  style={{
                    backgroundColor: colors.surfaceSunken,
                    borderColor: colors.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    gap: spacing.xs,
                    padding: spacing.md,
                  }}
                >
                  <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>{manager.managerFullName}</Text>
                  <Text style={[type.caption, { color: colors.muted }]} selectable>{manager.managerPhone}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ConcernMediaCarousel({ concern }: { concern: ConcernSummary }) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const images = useMemo(() => concern.photos.map((photo) => photo.photoUrl).filter((url): url is string => Boolean(url)), [concern.photos]);
  const activeImage = images[activeIndex] ?? images[0];

  if (!images.length) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 16, gap: spacing.sm, justifyContent: "center", minHeight: 220, padding: spacing.lg }}>
        <Images color={colors.primary} size={42} strokeWidth={1.8} />
        <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "900", textAlign: "center" }} selectable>No images available</Text>
        <Text style={{ color: colors.muted, lineHeight: 20, textAlign: "center" }} selectable>Concern photos will appear here when the tenant attaches them.</Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.primarySoft, borderRadius: 16, height: 260, overflow: "hidden" }}>
      <Pressable accessibilityLabel="Open concern image" onPress={() => setExpanded(true)} style={{ flex: 1 }}>
        <Image source={{ uri: activeImage }} style={{ height: "100%", width: "100%" }} resizeMode="cover" />
      </Pressable>
      {images.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ bottom: spacing.md, left: spacing.md, position: "absolute", right: spacing.md }} contentContainerStyle={{ gap: spacing.xs }}>
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
      <Modal animationType="fade" onRequestClose={() => setExpanded(false)} transparent visible={expanded}>
        <View style={{ backgroundColor: "rgba(0,0,0,0.92)", flex: 1, justifyContent: "center", padding: spacing.md }}>
          <AnimatedPressable
            accessibilityLabel="Close image"
            onPress={() => setExpanded(false)}
            style={{ alignItems: "center", backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, height: 44, justifyContent: "center", position: "absolute", right: spacing.lg, top: spacing.xl, width: 44, zIndex: 2 }}
          >
            <X color="#fff" size={22} strokeWidth={2.5} />
          </AnimatedPressable>
          <Image source={{ uri: activeImage }} style={{ height: "78%", width: "100%" }} resizeMode="contain" />
          <Text style={{ color: "#fff", fontWeight: "800", textAlign: "center" }} selectable>{concern.referenceCode}</Text>
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
  const status = tonePalette(statusTone(concern.status), colors);
  const escalation = tonePalette(escalationTone(concern.escalationLevel), colors);
  const facts = [
    { label: "Category", value: humanizeToken(concern.category), tone: "neutral" as BadgeTone },
    { label: "Room", value: concern.roomNumber, tone: "primary" as BadgeTone },
    { label: "Tenancy", value: concern.tenancyReferenceCode, tone: "neutral" as BadgeTone, wide: true },
  ];
  const assignedTo = concern.assignedToName ?? (concern.assignedToUserId ? shortId(concern.assignedToUserId) : "Unassigned");
  const assignedBy = concern.assignedByName ?? (concern.assignedByUserId ? shortId(concern.assignedByUserId) : null);

  return (
    <Card style={{ overflow: "hidden", padding: 0 }}>
      <View style={{ backgroundColor: status.fg, height: 5 }} />
      <View style={{ gap: spacing.md, padding: spacing.lg }}>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.md }}>
          <View style={{ alignItems: "center", backgroundColor: status.bg, borderColor: status.border, borderRadius: 18, borderWidth: 1, height: 56, justifyContent: "center", width: 56 }}>
            <StatusIcon concern={concern} color={status.fg} />
          </View>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Current status</Text>
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
              <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>Assigned to</Text>
              <Text style={[type.bodyStrong, { color: colors.ink }]} selectable>{assignedTo}</Text>
            </View>
          </View>
          {assignedBy ? (
            <Text style={[type.caption, { color: colors.muted }]} selectable>
              Assigned by {assignedBy}{concern.assignedAt ? ` · ${formatDateTime(concern.assignedAt)}` : ""}
            </Text>
          ) : concern.assignedAt ? (
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
            <Text style={[type.eyebrow, { color: colors.danger }]} selectable>Reopened</Text>
            <Text style={[type.body, { color: colors.ink }]} selectable>{concern.reopenReason ?? "No reopen reason provided."}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {facts.map((fact) => (
            <FactTile
              key={fact.label}
              label={fact.label}
              tone={fact.tone}
              value={fact.value}
              wide={singleColumn || fact.wide}
            />
          ))}
        </View>

        <View style={{ backgroundColor: colors.border, height: 1 }} />

        <View style={{ gap: spacing.sm }}>
          <TimelineRow label="Raised" value={formatDateTime(concern.createdAt)} />
          {concern.inProgressAt ? <TimelineRow label="In progress" value={formatDateTime(concern.inProgressAt)} /> : null}
          {concern.resolvedAt ? <TimelineRow label="Resolved" value={formatDateTime(concern.resolvedAt)} /> : null}
          {concern.reopenUntil ? <TimelineRow label="Reopen until" value={formatDateTime(concern.reopenUntil)} /> : null}
        </View>
      </View>
    </Card>
  );
}

function StatusIcon({ color, concern }: { color: string; concern: ConcernSummary }) {
  if (concern.reopened) return <RotateCcw color={color} size={24} strokeWidth={2.4} />;
  if (concern.status === "RESOLVED") return <CheckCircle2 color={color} size={25} strokeWidth={2.4} />;
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
      <Text style={[type.eyebrow, { color: palette.fg, letterSpacing: 1.2 }]} selectable>{label}</Text>
      <Text style={[type.label, { color: subtle ? palette.fg : colors.ink }]} selectable>{value}</Text>
    </View>
  );
}

function FactTile({ label, tone, value, wide }: { label: string; tone: BadgeTone; value: string; wide?: boolean }) {
  const { colors, type } = useTheme();
  const palette = tonePalette(tone, colors);
  return (
    <View
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderRadius: 12,
        borderWidth: 1,
        gap: spacing.xs,
        padding: spacing.md,
        width: wide ? "100%" : "48%",
      }}
    >
      <Text style={[type.eyebrow, { color: palette.fg, letterSpacing: 1.2 }]} selectable>{label}</Text>
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
      <Text style={[type.caption, { color: colors.muted, flex: 1, fontWeight: "700" }]} selectable>{label}</Text>
      <Text style={[type.caption, { color: colors.ink, fontWeight: "800", textAlign: "right" }]} selectable>{value}</Text>
    </View>
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
  if (status === "RESOLVED") return "success";
  if (status === "CLOSED") return "neutral";
  if (status === "UNDER_REVIEW") return "warning";
  return "primary";
}

function escalationTone(escalationLevel: string): BadgeTone {
  if (escalationLevel === "CRITICAL") return "danger";
  if (escalationLevel === "ESCALATED") return "warning";
  if (escalationLevel === "ATTENTION") return "primary";
  return "neutral";
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function NoteCard({ body, title }: { body: string; title: string }) {
  const { colors, type } = useTheme();
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>{title}</Text>
        <Text style={[type.body, { color: colors.ink }]} selectable>{body}</Text>
      </View>
    </Card>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(value));
}
