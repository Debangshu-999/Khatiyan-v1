import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import {
  BedDouble,
  CalendarDays,
  Check,
  MessageSquareText,
  RotateCcw,
  type LucideProps,
} from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { AppTextInput } from "@/components/app-text-input";
import { SheetShell } from "@/components/sheet-shell";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, NoticeBar } from "@/features/owner/owner-ui";
import {
  useCreateExitRequestMutation,
  useCreateRoomChangeRequestMutation,
  useGetExitCheckoutWindowQuery,
  useListMyActivePropertyRoomsQuery,
  type TenancyExitRequest,
  type TenancyRoomChangeRequest,
  type TenantRoomSummary,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type ExitActionStep = "date" | "menu" | "reason" | "review";
type RoomActionStep = "menu" | "reason" | "review" | "room";

export function ExitRequestCorrectionActions({
  onClose,
  onRequestWithdrawal,
  request,
}: {
  onClose: () => void;
  onRequestWithdrawal?: () => void;
  request: TenancyExitRequest;
}) {
  const toast = useToast();
  const windowQuery = useGetExitCheckoutWindowQuery(undefined, { skip: !request.reRaiseAllowed });
  const [createExit, createState] = useCreateExitRequestMutation();
  const errors = useFormErrors<never>();
  const [step, setStep] = useState<ExitActionStep>("menu");
  const [checkoutDate, setCheckoutDate] = useState(request.requestedCheckoutDate);
  const [reason, setReason] = useState(request.tenantReason ?? "");

  useEffect(() => {
    if (!windowQuery.data) {
      return;
    }
    setCheckoutDate((current) =>
      clampISODate(current, windowQuery.data!.earliestPossibleDate, windowQuery.data!.latestCheckoutDate),
    );
  }, [windowQuery.data]);

  async function submit() {
    try {
      await createExit({
        chosenCheckoutDate: checkoutDate,
        reason: cleanReason(reason),
      }).unwrap();
      toast.success("Exit request raised again.");
      onClose();
    } catch (caught) {
      errors.failFromServer(errorMessage(caught));
    }
  }

  if (step === "date" && windowQuery.data) {
    return (
      <ChangeDateSheet
        maximumDate={windowQuery.data.latestCheckoutDate}
        minimumDate={windowQuery.data.earliestPossibleDate}
        onBack={() => setStep("menu")}
        onSave={setCheckoutDate}
        originalValue={request.requestedCheckoutDate}
        value={checkoutDate}
      />
    );
  }

  if (step === "reason") {
    return (
      <ChangeReasonSheet
        onBack={() => setStep("menu")}
        onSave={setReason}
        originalValue={request.tenantReason ?? ""}
        value={reason}
      />
    );
  }

  if (step === "review") {
    return (
      <ReviewRequestSheet
        busy={createState.isLoading}
        onBack={() => setStep("menu")}
        onSubmit={() => void submit()}
        referenceCode={request.referenceCode}
        rows={[
          { label: "Checkout date", value: formatDate(checkoutDate) },
          { label: "Reason", value: reason.trim() || "No reason added" },
        ]}
        typeLabel="Exit request"
      >
        {errors.serverError ? (
          <AlertModal message={errors.serverError} onClose={errors.dismissServerError} />
        ) : null}
      </ReviewRequestSheet>
    );
  }

  return (
    <RequestActionsSheet onClose={onClose} referenceCode={request.referenceCode} title="Exit request actions">
      {request.reRaiseAllowed && windowQuery.error ? (
        <NoticeBar
          message="The latest checkout-date window could not be loaded. Close this menu and try again."
          title="DATE WINDOW UNAVAILABLE"
          tone="warning"
        />
      ) : null}
      {request.reRaiseAllowed ? (
        <>
          <ActionButton
            disabled={!windowQuery.data}
            icon={CalendarDays}
            label={windowQuery.isFetching ? "Loading date window…" : "Change checkout date"}
            onPress={() => setStep("date")}
            variant="secondary"
          />
          <ActionButton
            icon={MessageSquareText}
            label="Change reason"
            onPress={() => setStep("reason")}
            variant="secondary"
          />
          <ActionButton
            disabled={!windowQuery.data}
            icon={RotateCcw}
            label="Re-raise request"
            onPress={() => setStep("review")}
          />
        </>
      ) : null}
      {request.withdrawalWindowOpen && onRequestWithdrawal ? (
        <ActionButton
          icon={RotateCcw}
          label="Request withdrawal"
          onPress={onRequestWithdrawal}
          variant="secondary"
        />
      ) : null}
    </RequestActionsSheet>
  );
}

export function RoomChangeRequestCorrectionActions({
  onClose,
  request,
}: {
  onClose: () => void;
  request: TenancyRoomChangeRequest;
}) {
  const toast = useToast();
  const roomsQuery = useListMyActivePropertyRoomsQuery();
  const [createRoomChange, createState] = useCreateRoomChangeRequestMutation();
  const errors = useFormErrors<never>();
  const [step, setStep] = useState<RoomActionStep>("menu");
  const [targetRoomId, setTargetRoomId] = useState(request.targetRoomId);
  const [reason, setReason] = useState(request.tenantReason ?? "");
  const rooms = roomsQuery.data ?? [];
  const targetRoom = rooms.find((room) => room.id === targetRoomId) ?? null;

  async function submit() {
    try {
      await createRoomChange({
        reason: cleanReason(reason),
        targetRoomId,
      }).unwrap();
      toast.success("Room change request raised again.");
      onClose();
    } catch (caught) {
      errors.failFromServer(errorMessage(caught));
    }
  }

  if (step === "room") {
    return (
      <ChangeRoomSheet
        currentRoomId={request.currentRoomId}
        loading={roomsQuery.isFetching}
        onBack={() => setStep("menu")}
        onSave={setTargetRoomId}
        originalRoomId={request.targetRoomId}
        rooms={rooms}
        value={targetRoomId}
      />
    );
  }

  if (step === "reason") {
    return (
      <ChangeReasonSheet
        onBack={() => setStep("menu")}
        onSave={setReason}
        originalValue={request.tenantReason ?? ""}
        value={reason}
      />
    );
  }

  if (step === "review") {
    return (
      <ReviewRequestSheet
        busy={createState.isLoading}
        onBack={() => setStep("menu")}
        onSubmit={() => void submit()}
        referenceCode={request.referenceCode}
        rows={[
          { label: "Requested room", value: roomLabel(targetRoom, targetRoomId) },
          { label: "Reason", value: reason.trim() || "No reason added" },
        ]}
        typeLabel="Room change request"
      >
        {errors.serverError ? (
          <AlertModal message={errors.serverError} onClose={errors.dismissServerError} />
        ) : null}
      </ReviewRequestSheet>
    );
  }

  return (
    <RequestActionsSheet
      onClose={onClose}
      referenceCode={request.referenceCode}
      title="Room change actions"
    >
      {roomsQuery.error ? (
        <NoticeBar
          message="Available rooms could not be loaded. Close this menu and try again."
          title="ROOMS UNAVAILABLE"
          tone="warning"
        />
      ) : null}
      <ActionButton
        disabled={!roomsQuery.data}
        icon={BedDouble}
        label={roomsQuery.isFetching ? "Loading rooms…" : "Change room"}
        onPress={() => setStep("room")}
        variant="secondary"
      />
      <ActionButton
        icon={MessageSquareText}
        label="Change reason"
        onPress={() => setStep("reason")}
        variant="secondary"
      />
      <ActionButton
        disabled={!roomsQuery.data}
        icon={RotateCcw}
        label="Re-raise request"
        onPress={() => setStep("review")}
      />
    </RequestActionsSheet>
  );
}

function RequestActionsSheet({
  children,
  onClose,
  referenceCode,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  referenceCode: string;
  title: string;
}) {
  const { colors, type } = useTheme();
  return (
    <SheetShell animated onClose={onClose} title={title}>
      <Text style={[type.eyebrow, { color: colors.kicker }]}>{referenceCode}</Text>
      <View style={{ gap: spacing.sm }}>{children}</View>
    </SheetShell>
  );
}

function ChangeReasonSheet({
  onBack,
  onSave,
  originalValue,
  value,
}: {
  onBack: () => void;
  onSave: (value: string) => void;
  originalValue: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [draft, setDraft] = useState(value);

  return (
    <SheetShell animated onClose={onBack} title="Change reason">
      <ValuePanel label="Original reason" value={originalValue.trim() || "No reason was added"} />
      <View style={{ gap: spacing.xs }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.label, { color: colors.inkSoft }]}>Updated reason</Text>
          <Text style={[type.caption, { color: colors.kicker }]}>{draft.length}/500</Text>
        </View>
        <AppTextInput
          maxLength={500}
          multiline
          onChangeText={setDraft}
          placeholder="Add a reason (optional)"
          placeholderTextColor={colors.kicker}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.borderStrong,
            borderRadius: 14,
            borderWidth: 1,
            color: colors.ink,
            fontFamily: fonts.sansMedium,
            fontSize: 15,
            minHeight: 132,
            padding: spacing.md,
            textAlignVertical: "top",
          }}
          value={draft}
        />
      </View>
      <ActionButton
        icon={Check}
        label="Save change"
        onPress={() => {
          onSave(draft);
          onBack();
        }}
      />
    </SheetShell>
  );
}

function ChangeDateSheet({
  maximumDate,
  minimumDate,
  onBack,
  onSave,
  originalValue,
  value,
}: {
  maximumDate: string;
  minimumDate: string;
  onBack: () => void;
  onSave: (value: string) => void;
  originalValue: string;
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const minimum = parseISODate(minimumDate);
  const maximum = parseISODate(maximumDate);
  const [draft, setDraft] = useState(() => parseISODate(clampISODate(value, minimumDate, maximumDate)));
  const [androidPickerOpen, setAndroidPickerOpen] = useState(false);
  const [webValue, setWebValue] = useState(toISODate(draft));
  const parsedWebValue = parseISODateOrNull(webValue);
  const webValueValid = parsedWebValue != null && parsedWebValue >= minimum && parsedWebValue <= maximum;

  function handleNativeChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") {
      setAndroidPickerOpen(false);
    }
    if (event.type === "set" && selected) {
      setDraft(clampDate(selected, minimum, maximum));
    }
  }

  return (
    <SheetShell animated onClose={onBack} title="Change checkout date">
      <ValuePanel label="Original checkout date" value={formatDate(originalValue)} />
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.label, { color: colors.inkSoft }]}>New checkout date</Text>
        {Platform.OS === "web" ? (
          <AppTextInput
            autoCapitalize="none"
            onChangeText={setWebValue}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.kicker}
            style={{
              backgroundColor: colors.surface,
              borderColor: webValueValid ? colors.borderStrong : colors.danger,
              borderRadius: 14,
              borderWidth: 1,
              color: colors.ink,
              fontFamily: fonts.sansMedium,
              fontSize: 15,
              minHeight: 50,
              paddingHorizontal: spacing.md,
            }}
            value={webValue}
          />
        ) : Platform.OS === "ios" ? (
          <DateTimePicker
            display="inline"
            maximumDate={maximum}
            minimumDate={minimum}
            mode="date"
            onChange={handleNativeChange}
            value={draft}
          />
        ) : (
          <AnimatedPressable
            accessibilityLabel="Choose a new checkout date"
            accessibilityRole="button"
            onPress={() => setAndroidPickerOpen(true)}
            style={{
              alignItems: "center",
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.borderStrong,
              borderRadius: 14,
              borderWidth: 1,
              flexDirection: "row",
              gap: spacing.sm,
              minHeight: 52,
              paddingHorizontal: spacing.md,
            }}
          >
            <CalendarDays color={colors.ink} size={18} strokeWidth={2.2} />
            <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
              {formatDate(toISODate(draft))}
            </Text>
          </AnimatedPressable>
        )}
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
          Choose between {formatDate(minimumDate)} and {formatDate(maximumDate)}.
        </Text>
      </View>
      <ActionButton
        disabled={Platform.OS === "web" && !webValueValid}
        icon={Check}
        label="Save change"
        onPress={() => {
          const resolved = Platform.OS === "web" && parsedWebValue ? parsedWebValue : draft;
          onSave(toISODate(resolved));
          onBack();
        }}
      />
      {androidPickerOpen ? (
        <DateTimePicker
          display="default"
          maximumDate={maximum}
          minimumDate={minimum}
          mode="date"
          onChange={handleNativeChange}
          value={draft}
        />
      ) : null}
    </SheetShell>
  );
}

function ChangeRoomSheet({
  currentRoomId,
  loading,
  onBack,
  onSave,
  originalRoomId,
  rooms,
  value,
}: {
  currentRoomId: string;
  loading: boolean;
  onBack: () => void;
  onSave: (value: string) => void;
  originalRoomId: string;
  rooms: TenantRoomSummary[];
  value: string;
}) {
  const { colors, fonts, type } = useTheme();
  const [draft, setDraft] = useState(value);
  const availableRooms = useMemo(
    () => rooms.filter((room) => room.id !== currentRoomId && roomIsAvailable(room)).sort(compareRooms),
    [currentRoomId, rooms],
  );
  const originalRoom = rooms.find((room) => room.id === originalRoomId) ?? null;
  const selectionAvailable = availableRooms.some((room) => room.id === draft);

  return (
    <SheetShell animated onClose={onBack} title="Change room">
      <ValuePanel label="Originally requested" value={roomLabel(originalRoom, originalRoomId)} />
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.label, { color: colors.inkSoft }]}>Select a new room</Text>
        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : availableRooms.length === 0 ? (
          <NoticeBar
            message="There are no rooms with a vacancy right now."
            title="NO AVAILABLE ROOM"
            tone="warning"
          />
        ) : (
          <View style={{ gap: spacing.xs }}>
            {availableRooms.map((room) => {
              const selected = room.id === draft;
              return (
                <AnimatedPressable
                  key={room.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setDraft(room.id)}
                  style={{
                    alignItems: "center",
                    backgroundColor: selected ? colors.jadeSoft : colors.surfaceSunken,
                    borderColor: selected ? colors.jade : colors.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: spacing.sm,
                    minHeight: 62,
                    padding: spacing.md,
                  }}
                >
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.surface,
                      borderRadius: 999,
                      height: 34,
                      justifyContent: "center",
                      width: 34,
                    }}
                  >
                    <BedDouble color={colors.ink} size={17} strokeWidth={2.1} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
                      Room {room.roomNumber}
                    </Text>
                    <Text style={[type.caption, { color: colors.muted }]}>
                      {room.floor ? formatFloor(room.floor) : "Floor not assigned"} · {room.availableVacancies}/{room.capacity} free
                    </Text>
                  </View>
                  {selected ? (
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.jade,
                        borderRadius: 999,
                        height: 26,
                        justifyContent: "center",
                        width: 26,
                      }}
                    >
                      <Check color={colors.onPrimary} size={15} strokeWidth={2.8} />
                    </View>
                  ) : null}
                </AnimatedPressable>
              );
            })}
          </View>
        )}
      </View>
      <ActionButton
        disabled={!selectionAvailable}
        icon={Check}
        label="Save change"
        onPress={() => {
          onSave(draft);
          onBack();
        }}
      />
    </SheetShell>
  );
}

function ReviewRequestSheet({
  busy,
  children,
  onBack,
  onSubmit,
  referenceCode,
  rows,
  typeLabel,
}: {
  busy: boolean;
  children?: ReactNode;
  onBack: () => void;
  onSubmit: () => void;
  referenceCode: string;
  rows: { label: string; value: string }[];
  typeLabel: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <SheetShell animated onClose={onBack} title="Review re-raised request">
      <NoticeBar
        message="Check the updated request below. Nothing is sent until you press Re-raise request."
        title="READY TO RE-RAISE"
        tone="info"
      />
      <View
        style={{
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.border,
          borderRadius: 16,
          borderWidth: 1,
          gap: spacing.sm,
          padding: spacing.md,
        }}
      >
        <View style={{ gap: 2 }}>
          <Text style={[type.eyebrow, { color: colors.kicker }]}>{typeLabel}</Text>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
            {referenceCode}
          </Text>
        </View>
        {rows.map((row) => (
          <ReviewRow key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
      <ActionButton
        disabled={busy}
        icon={RotateCcw}
        label={busy ? "Re-raising…" : "Re-raise request"}
        onPress={onSubmit}
      />
      {children}
    </SheetShell>
  );
}

function ValuePanel({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderRadius: 14,
        gap: spacing.xxs,
        padding: spacing.md,
      }}
    >
      <Text style={[type.eyebrow, { color: colors.kicker }]}>{label}</Text>
      <Text style={[type.body, { color: colors.ink, fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.md, justifyContent: "space-between" }}>
      <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
      <Text
        style={[
          type.caption,
          { color: colors.ink, flex: 1, fontWeight: "800", lineHeight: 18, textAlign: "right" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function cleanReason(value: string) {
  const cleaned = value.trim();
  return cleaned || null;
}

function roomIsAvailable(room: TenantRoomSummary) {
  return room.active && room.status !== "MAINTENANCE" && room.availableVacancies > 0;
}

function compareRooms(left: TenantRoomSummary, right: TenantRoomSummary) {
  const floorCompare = (left.floor ?? "").localeCompare(right.floor ?? "", undefined, { numeric: true });
  return floorCompare || left.roomNumber.localeCompare(right.roomNumber, undefined, { numeric: true });
}

function roomLabel(room: TenantRoomSummary | null, fallbackId: string) {
  return room ? `Room ${room.roomNumber}${room.floor ? ` · ${formatFloor(room.floor)}` : ""}` : `Room ${fallbackId.slice(0, 8).toUpperCase()}`;
}

function formatFloor(value: string) {
  return /^floor\s/i.test(value) ? value : `Floor ${value}`;
}

function parseISODate(value: string) {
  const parsed = parseISODateOrNull(value);
  return parsed ?? new Date();
}

function parseISODateOrNull(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampISODate(value: string, minimum: string, maximum: string) {
  return toISODate(clampDate(parseISODate(value), parseISODate(minimum), parseISODate(maximum)));
}

function clampDate(value: Date, minimum: Date, maximum: Date) {
  if (value < minimum) {
    return minimum;
  }
  if (value > maximum) {
    return maximum;
  }
  return value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseISODate(value));
}
