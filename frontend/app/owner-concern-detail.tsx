import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { CheckCircle2, Clock3, ImageOff, Images, RotateCcw, ShieldAlert, UserRoundPlus, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { BottomSheetModal } from "@/components/bottom-sheet-modal";
import { Card } from "@/components/card";
import { ConcernDataCard, NoteCard } from "@/components/concern-detail-cards";
import { ImageCarousel } from "@/components/image-carousel";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { AlertModal } from "@/components/alert-modal";
import { OwnerConcernDetailSkeleton, OwnerStaffListSkeleton } from "@/components/skeletons/owner";
import { classifyToast } from "@/components/toast";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { ActionButton, FormInput, IconButton, humanizeToken, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
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
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const NO_PERSON_ILLUSTRATION = require("../assets/workspace/No-Person_512x512.png");

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
  // Failures raised anywhere on this screen; no field owns them.
  const opErrors = useFormErrors<never>();

  const setMessage = (value: string | null) => {
    if (!value) {
      return;
    }
    // A failure ends the attempt, so it interrupts; a confirmation does not.
    if (classifyToast(value) === "error") {
      opErrors.failFromServer(value);
      return;
    }
    toast.show(value);
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
  // View-only managers see the concern in full; every control that changes it is
  // absent rather than disabled — a greyed button invites a tap and explains
  // nothing. The API refuses these too, so this only removes the dead end.
  const { canManage } = usePropertyPermissions(concern?.propertyId);
  const canAct = canManage("CONCERNS");

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
      await updateStatus({ concernId: concern.id, status, statusNote: statusNote.trim() || null, version: concern.version }).unwrap();
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
      await updateStatus({ concernId: concern.id, status: concern.status, statusNote: statusNote.trim() || null, version: concern.version }).unwrap();
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
      await resolveConcern({ concernId: concern.id, resolutionNote: resolutionNote.trim(), version: concern.version }).unwrap();
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
      await assignConcern({ assignedToUserId: managerUserId, concernId: concern.id, version: concern.version }).unwrap();
      setAssignOpen(false);
      setMessage("Concern assigned.");
      router.back();
    } catch {
      setMessage("Could not assign concern.");
    }
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={!canAct ? <ViewOnlyChip /> : null}
        title="Concern"
        italicTail="Details"
        subtitle="Review the concern, keep the tenant updated, and resolve it."
      />

      {loading && !concern ? <OwnerConcernDetailSkeleton /> : null}
      {!loading && !concern ? <EmptyState icon={ImageOff} title="Concern not found" description="Refresh the queue and open the concern again." /> : null}

      {concern ? (
        <>
          <ConcernMediaCarousel concern={concern} />

          {/* What the concern IS, before how it is being handled. */}
          <NoteCard title="Description" heading={concern.title} body={concern.description} />

          <ConcernDataCard concern={concern} />

          {concern.resolutionNote ? <NoteCard title="Resolution note" body={concern.resolutionNote} /> : null}

          {canAct && mode !== "history" && concern.status !== "RESOLVED" && concern.status !== "CLOSED" ? (
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

          {canAct && mode === "taken" && concern.status === "IN_PROGRESS" ? (
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
      {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
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
    <BottomSheetModal navigationBarTranslucent onRequestClose={onClose} statusBarTranslucent visible>
      {(dismiss) => <View style={{ flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderWidth: 1, gap: spacing.md, maxHeight: "78%", padding: spacing.lg }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>Assign concern</Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 24, lineHeight: 30 }]}>Choose a manager</Text>
            </View>
            <IconButton accessibilityLabel="Close assignment" icon={X} onPress={() => dismiss()} />
          </View>

          {loading ? <OwnerStaffListSkeleton rows={2} /> : null}
          {!loading && managers.length === 0 ? (
            <EmptyState artwork={NO_PERSON_ILLUSTRATION} title="No active managers" description="Add a manager to this property before assigning concerns." />
          ) : null}
          {!loading && managers.length > 0 ? (
            <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
              {managers.map((manager) => (
                <AnimatedPressable
                  accessibilityRole="button"
                  key={manager.managerUserId}
                  onPress={() => dismiss(() => onAssign(manager.managerUserId))}
                  style={{
                    backgroundColor: colors.surfaceSunken,
                    borderColor: colors.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    gap: spacing.xs,
                    padding: spacing.md,
                  }}
                >
                  <Text style={[type.bodyStrong, { color: colors.ink }]}>{manager.managerFullName}</Text>
                  <Text style={[type.caption, { color: colors.muted }]}>{manager.managerPhone}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>}
    </BottomSheetModal>
  );
}

function ConcernMediaCarousel({ concern }: { concern: ConcernSummary }) {
  const { colors } = useTheme();
  const images = useMemo(() => concern.photos.map((photo) => photo.photoUrl).filter((url): url is string => Boolean(url)), [concern.photos]);

  if (!images.length) {
    return (
      <View style={{ alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 16, gap: spacing.sm, justifyContent: "center", minHeight: 220, padding: spacing.lg }}>
        <Images color={colors.primary} size={42} strokeWidth={1.8} />
        <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "900", textAlign: "center" }}>No images available</Text>
        <Text style={{ color: colors.muted, lineHeight: 20, textAlign: "center" }}>Concern photos will appear here when the tenant attaches them.</Text>
      </View>
    );
  }

  return (
    <ImageCarousel images={images} />
  );
}
