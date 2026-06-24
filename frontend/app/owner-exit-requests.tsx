import { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarDays, Check, DoorOpen, FileText, Info, IndianRupee, KeyRound, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { PaginationBar } from "@/components/pagination-bar";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { ConfirmDialog } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, useListPropertyRoomsQuery, type OwnerProperty } from "@/store/services/property-api";
import {
  useApproveExitRequestMutation,
  useListPropertyExitRequestsQuery,
  useRejectExitRequestMutation,
  type TenancyExitRequest,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ReviewMode = "approve" | "reject";

export default function OwnerExitRequestsScreen() {
  const router = useRouter();
  const { colors, type } = useTheme();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const selectedProperty = resolveSelectedProperty(properties, selectedPropertyId);

  const requestsQuery = useListPropertyExitRequestsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const roomsQuery = useListPropertyRoomsQuery(selectedProperty?.id ?? "", { skip: !selectedProperty });
  const roomLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const room of roomsQuery.data ?? []) {
      map[room.id] = `Room ${room.roomNumber}`;
    }
    return map;
  }, [roomsQuery.data]);

  const [selected, setSelected] = useState<TenancyExitRequest | null>(null);
  const [mode, setMode] = useState<ReviewMode | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const requests = [...(requestsQuery.data ?? [])].sort(byPendingFirst);
  const activeRequests = requests.filter((request) => request.status === "REQUESTED");
  const pastRequests = requests.filter((request) => request.status !== "REQUESTED");

  function openReview(request: TenancyExitRequest, reviewMode: ReviewMode) {
    setSelected(request);
    setMode(reviewMode);
  }

  function closeReview() {
    setSelected(null);
    setMode(null);
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingTop: 0 }}>
      <BackButton onPress={() => router.back()} />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          icon={DoorOpen}
          eyebrow="Property required"
          title="No active property selected"
          description="Choose the property whose exit requests you want to manage from Home."
        />
      ) : null}

      {selectedProperty ? (
        <>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <SummaryTile label="Active" value={String(activeRequests.length)} hint="Awaiting review" tone={activeRequests.length > 0 ? "primary" : "default"} />
            <SummaryTile label="Total" value={String(requests.length)} hint="Exit requests" />
          </View>

          <Section eyebrow="Active" title={`${activeRequests.length} active request${activeRequests.length === 1 ? "" : "s"}`}>
            {requestsQuery.isFetching && requests.length === 0 ? (
              <Card>
                <ActivityIndicator color={colors.primary} />
              </Card>
            ) : activeRequests.length === 0 ? (
              <EmptyState
                icon={DoorOpen}
                eyebrow="All clear"
                title="No active exit requests"
                description="Tenant exit requests awaiting your review will appear here."
              />
            ) : (
              <View style={{ gap: spacing.sm }}>
                {activeRequests.map((request) => (
                  <ExitRequestCard
                    key={request.id}
                    request={request}
                    roomLabel={roomLabels[request.roomId]}
                    onApprove={() => openReview(request, "approve")}
                    onReject={() => openReview(request, "reject")}
                  />
                ))}
              </View>
            )}
          </Section>

          <Card>
            <View style={{ gap: spacing.sm }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Past requests</Text>
              <Text style={[type.display, { color: colors.ink, fontSize: 22, lineHeight: 27 }]} selectable>Reviewed exit requests</Text>
              <Text style={[type.body, { color: colors.muted }]} selectable>Approved, executed, rejected and cancelled exit requests for this property.</Text>
              <ActionButton label={`${pastRequests.length} past request${pastRequests.length === 1 ? "" : "s"}`} onPress={() => setPastOpen(true)} variant="secondary" />
            </View>
          </Card>
        </>
      ) : null}

      {selected && mode ? <ExitReviewModal mode={mode} onClose={closeReview} request={selected} /> : null}
      {pastOpen ? <PastExitRequestsModal onClose={() => setPastOpen(false)} requests={pastRequests} roomLabels={roomLabels} /> : null}
    </ScreenScrollView>
  );
}

const PAST_PAGE_SIZE = 8;

function paginateArray<T>(items: T[], page: number, size: number) {
  const totalElements = items.length;
  const totalPages = Math.ceil(totalElements / size);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * size;
  return {
    hasNext: safePage + 1 < totalPages,
    hasPrevious: safePage > 0,
    page: safePage,
    pageItems: items.slice(start, start + size),
    totalElements,
    totalPages,
  };
}

// Reviewed (non-pending) exit requests, paginated in a modal like concern history.
function PastExitRequestsModal({ onClose, requests, roomLabels }: { onClose: () => void; requests: TenancyExitRequest[]; roomLabels: Record<string, string> }) {
  const { colors, fonts, type } = useTheme();
  const [page, setPage] = useState(0);
  const paged = paginateArray(requests, page, PAST_PAGE_SIZE);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end", padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: spacing.md, maxHeight: "86%", padding: spacing.lg }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>Past requests</Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 23, fontWeight: "600" }} selectable>Reviewed exits</Text>
            </View>
            <IconButton accessibilityLabel="Close past requests" icon={X} onPress={onClose} />
          </View>
          {requests.length === 0 ? (
            <EmptyState icon={DoorOpen} eyebrow="Nothing yet" title="No past requests" description="Reviewed exit requests will appear here once you approve or reject them." />
          ) : (
            <>
              <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
                {paged.pageItems.map((request) => (
                  <ExitRequestCard key={request.id} onApprove={() => {}} onReject={() => {}} request={request} roomLabel={roomLabels[request.roomId]} />
                ))}
              </ScrollView>
              {paged.totalElements > 0 ? (
                <PaginationBar
                  hasNext={paged.hasNext}
                  hasPrevious={paged.hasPrevious}
                  onNext={() => setPage((current) => current + 1)}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  page={paged.page}
                  totalElements={paged.totalElements}
                  totalPages={paged.totalPages}
                />
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ExitRequestCard({
  onApprove,
  onReject,
  request,
  roomLabel,
}: {
  onApprove: () => void;
  onReject: () => void;
  request: TenancyExitRequest;
  roomLabel?: string;
}) {
  const { colors, fonts, type } = useTheme();
  const pending = request.status === "REQUESTED";
  const [info, setInfo] = useState<{ label: string; value: string } | null>(null);

  return (
    <>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View
              style={{
                alignItems: "center",
                backgroundColor: colors.primarySoft,
                borderRadius: 12,
                height: 42,
                justifyContent: "center",
                width: 42,
              }}
            >
              <DoorOpen color={colors.primary} size={20} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                    {humanizeToken(request.type)}
                  </Text>
                  <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 20, fontWeight: "500", lineHeight: 25 }} selectable>
                    {roomLabel ?? `Tenancy ${shortId(request.tenancyId)}`}
                  </Text>
                </View>
                <StatusText status={request.status} />
              </View>
              <InfoLine icon={CalendarDays} label="Requested" value={formatDate(request.requestedCheckoutDate)} />
              {request.approvedCheckoutDate ? (
                <InfoLine icon={CalendarDays} label="Approved" value={formatDate(request.approvedCheckoutDate)} />
              ) : null}
              <InfoLine icon={KeyRound} label="Tenancy" value={shortId(request.tenancyId)} />
              {request.finalBillingAmountPaise != null ? (
                <InfoLine icon={IndianRupee} label="Final bill" value={formatMoney(request.finalBillingAmountPaise)} />
              ) : null}
              {request.depositSettlementAmountPaise != null ? (
                <InfoLine icon={IndianRupee} label="Deposit" value={formatMoney(request.depositSettlementAmountPaise)} />
              ) : null}
              {request.tenantReason ? (
                <InfoRow icon={FileText} label="Reason" onPress={() => setInfo({ label: "Reason", value: request.tenantReason ?? "" })} />
              ) : null}
              {request.adminNotes ? (
                <InfoRow icon={FileText} label="Notes" onPress={() => setInfo({ label: "Notes", value: request.adminNotes ?? "" })} />
              ) : null}
            </View>
          </View>

          {pending ? (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <ActionButton label="Approve" onPress={onApprove} />
              <ActionButton label="Reject" onPress={onReject} variant="danger" />
            </View>
          ) : null}
        </View>
      </Card>
      {info ? <InfoPopover onClose={() => setInfo(null)} title={info.label} value={info.value} /> : null}
    </>
  );
}

function ExitReviewModal({ mode, onClose, request }: { mode: ReviewMode; onClose: () => void; request: TenancyExitRequest }) {
  const { colors, fonts, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [approvedCheckoutDate, setApprovedCheckoutDate] = useState(request.requestedCheckoutDate);
  const [finalBilling, setFinalBilling] = useState("");
  const [depositPayable, setDepositPayable] = useState(true);
  const [depositSettlement, setDepositSettlement] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ confirmLabel: string; destructive?: boolean; message: string; title: string } | null>(null);

  const [approveExit, approveState] = useApproveExitRequestMutation();
  const [rejectExit, rejectState] = useRejectExitRequestMutation();
  const busy = approveState.isLoading || rejectState.isLoading;

  const title = mode === "approve" ? "Approve exit" : "Reject exit";

  function handleSubmit() {
    if (busy) {
      return;
    }
    setError(null);

    if (mode === "reject") {
      setConfirm({
        confirmLabel: "Reject",
        destructive: true,
        message: `Reject this ${humanizeToken(request.type).toLowerCase()} request?`,
        title: "Reject exit request?",
      });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(approvedCheckoutDate.trim())) {
      setError("Enter the approved checkout date as YYYY-MM-DD.");
      return;
    }

    setConfirm({
      confirmLabel: "Approve",
      message: `Approve checkout on ${formatDate(approvedCheckoutDate)}${depositPayable ? " with deposit settlement" : ""}?`,
      title: "Approve exit request?",
    });
  }

  async function submit() {
    setError(null);
    try {
      if (mode === "approve") {
        await approveExit({
          payload: {
            adminNotes: notes.trim() || null,
            approvedCheckoutDate: approvedCheckoutDate.trim(),
            depositPayable,
            depositSettlementAmountPaise: depositPayable ? rupeesToPaise(depositSettlement) : null,
            finalBillingAmountPaise: rupeesToPaise(finalBilling),
          },
          requestId: request.id,
        }).unwrap();
      } else {
        await rejectExit({ adminNotes: notes.trim() || null, requestId: request.id }).unwrap();
      }
      onClose();
    } catch {
      setError("Action failed. Refresh and try again.");
    }
  }

  const reject = mode === "reject";

  return (
    <>
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              maxHeight: "90%",
              paddingTop: spacing.lg,
            }}
          >
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.eyebrow, { color: colors.kicker }]} selectable>
                  {humanizeToken(request.type)}
                </Text>
                <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 24, fontWeight: "600" }} selectable>
                  {title}
                </Text>
              </View>
              <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
            </View>

            <ScrollView
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              style={{ flexShrink: 1 }}
            >
              {reject ? (
                <FormInput multiline label="Rejection note" onChangeText={setNotes} placeholder="Optional note for the tenant" value={notes} />
              ) : (
                <>
                  <FormInput label="Approved checkout date" onChangeText={setApprovedCheckoutDate} placeholder="YYYY-MM-DD" value={approvedCheckoutDate} />
                  <FormInput keyboardType="decimal-pad" label="Final bill (₹, optional)" onChangeText={setFinalBilling} placeholder="Amount in rupees" value={finalBilling} />
                  <View style={{ gap: spacing.xs }}>
                    <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
                      Deposit payable
                    </Text>
                    <View style={{ flexDirection: "row", gap: spacing.xs }}>
                      <ChoiceButton active={depositPayable} label="Yes" onPress={() => setDepositPayable(true)} />
                      <ChoiceButton active={!depositPayable} label="No" onPress={() => setDepositPayable(false)} />
                    </View>
                  </View>
                  {depositPayable ? (
                    <FormInput
                      keyboardType="decimal-pad"
                      label="Deposit settlement (₹, optional)"
                      onChangeText={setDepositSettlement}
                      placeholder="Amount in rupees"
                      value={depositSettlement}
                    />
                  ) : null}
                  <FormInput multiline label="Note (optional)" onChangeText={setNotes} placeholder="Optional note for the tenant" value={notes} />
                </>
              )}
              {error ? (
                <Text style={[type.caption, { color: colors.danger }]} selectable>
                  {error}
                </Text>
              ) : null}
            </ScrollView>

            <View
              style={{
                borderTopColor: colors.border,
                borderTopWidth: 1,
                flexDirection: "row",
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.md,
              }}
            >
              <ActionButton
                disabled={busy}
                label={busy ? "Saving" : mode === "approve" ? "Approve" : "Reject"}
                onPress={handleSubmit}
                variant={mode === "approve" ? "primary" : "danger"}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    {confirm ? (
      <ConfirmDialog
        confirmLabel={confirm.confirmLabel}
        destructive={confirm.destructive}
        message={confirm.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void submit();
        }}
        title={confirm.title}
      />
    ) : null}
    </>
  );
}

function StatusText({ status }: { status: TenancyExitRequest["status"] }) {
  const { colors, type } = useTheme();
  const tone =
    status === "APPROVED" || status === "EXECUTED"
      ? colors.successText
      : status === "REJECTED" || status === "CANCELLED"
        ? colors.danger
        : colors.primary;

  return (
    <Text style={[type.caption, { color: tone, fontWeight: "900" }]} selectable>
      {humanizeToken(status)}
    </Text>
  );
}

function InfoLine({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={14} strokeWidth={2.1} />
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={[type.caption, { color: colors.ink, flex: 1, fontWeight: "700", textAlign: "right" }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function InfoRow({ icon: Icon, label, onPress }: { icon: typeof CalendarDays; label: string; onPress: () => void }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.kicker} size={14} strokeWidth={2.1} />
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]} selectable>
        {label}
      </Text>
      <AnimatedPressable
        accessibilityLabel={`View ${label.toLowerCase()}`}
        accessibilityRole="button"
        onPress={onPress}
        hitSlop={8}
        style={{
          alignItems: "center",
          backgroundColor: colors.primarySoft,
          borderRadius: 999,
          height: 26,
          justifyContent: "center",
          width: 26,
        }}
      >
        <Info color={colors.primary} size={15} strokeWidth={2.3} />
      </AnimatedPressable>
    </View>
  );
}

function InfoPopover({ onClose, title, value }: { onClose: () => void; title: string; value: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable
        onPress={onClose}
        style={{ alignItems: "center", backgroundColor: colors.overlay, flex: 1, justifyContent: "center", padding: spacing.lg }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 18,
            borderWidth: 1,
            gap: spacing.sm,
            maxWidth: 360,
            padding: spacing.lg,
            width: "100%",
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 18, fontWeight: "600" }} selectable>
              {title}
            </Text>
            <IconButton accessibilityLabel="Close" icon={X} onPress={onClose} />
          </View>
          <Text style={[type.body, { color: colors.muted, lineHeight: 21 }]} selectable>
            {value}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SummaryTile({ hint, label, tone = "default", value }: { hint: string; label: string; tone?: "default" | "primary"; value: string }) {
  const { colors, fonts, type } = useTheme();
  const accent = tone === "primary" ? colors.primary : colors.ink;
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, gap: spacing.xs, padding: spacing.md }}>
      <Text style={[type.caption, { color: colors.muted }]} selectable>
        {label}
      </Text>
      <Text style={{ color: accent, fontFamily: fonts.display, fontSize: 20, fontWeight: "700" }} selectable>
        {value}
      </Text>
      <Text style={[type.caption, { color: colors.kicker }]} selectable>
        {hint}
      </Text>
    </View>
  );
}

function FormInput({
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  keyboardType?: "decimal-pad";
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: "700" }]} selectable>
        {label}
      </Text>
      <TextInput
        autoCapitalize="none"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : undefined}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.kicker}
        style={{
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          color: colors.ink,
          minHeight: multiline ? 96 : 46,
          paddingHorizontal: spacing.md,
          paddingVertical: multiline ? spacing.sm : 0,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
    </View>
  );
}

function ChoiceButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={{
        backgroundColor: active ? colors.primary : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: active ? colors.onPrimary : colors.ink, fontFamily: fonts.sans, fontWeight: "800" }} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function ActionButton({
  disabled,
  icon: Icon,
  label,
  onPress,
  variant = "primary",
}: {
  disabled?: boolean;
  icon?: typeof Check;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { colors, fonts } = useTheme();
  const primary = variant === "primary";
  const danger = variant === "danger";
  const foreground = disabled ? colors.muted : danger ? colors.danger : primary ? colors.onPrimary : colors.primary;
  const backgroundColor = disabled
    ? colors.neutralSoft
    : primary
      ? colors.primary
      : danger
        ? colors.surface
        : colors.primarySoft;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor,
        borderColor: danger ? colors.border : "transparent",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        flexDirection: "row",
        gap: spacing.xs,
        justifyContent: "center",
        minHeight: 48,
        opacity: disabled ? 0.65 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {Icon ? <Icon color={foreground} size={16} strokeWidth={2.2} /> : null}
      <Text style={{ color: foreground, fontFamily: fonts.sans, fontSize: 14, fontWeight: "800" }} selectable>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function IconButton({ accessibilityLabel, icon: Icon, onPress }: { accessibilityLabel: string; icon: typeof X; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <AnimatedPressable accessibilityLabel={accessibilityLabel} onPress={onPress} style={{ alignItems: "center", borderRadius: 18, height: 36, justifyContent: "center", width: 36 }}>
      <Icon color={colors.ink} size={18} strokeWidth={2.2} />
    </AnimatedPressable>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <AnimatedPressable
      accessibilityLabel="Back"
      onPress={onPress}
      style={{ alignItems: "center", alignSelf: "flex-start", borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: spacing.xs, height: 36, paddingHorizontal: spacing.sm }}
    >
      <ArrowLeft color={colors.ink} size={16} strokeWidth={2.2} />
      <Text style={{ color: colors.ink, fontFamily: fonts.sans, fontSize: 12, fontWeight: "700" }} selectable>
        Back
      </Text>
    </AnimatedPressable>
  );
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (selectedPropertyId) {
    return properties.find((property) => property.id === selectedPropertyId) ?? null;
  }
  return properties.length === 1 ? properties[0] : null;
}

function byPendingFirst(left: TenancyExitRequest, right: TenancyExitRequest) {
  const leftPending = left.status === "REQUESTED" ? 0 : 1;
  const rightPending = right.status === "REQUESTED" ? 0 : 1;
  if (leftPending !== rightPending) {
    return leftPending - rightPending;
  }
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const amount = Math.round(Number(trimmed) * 100);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function humanizeToken(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value / 100);
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}
