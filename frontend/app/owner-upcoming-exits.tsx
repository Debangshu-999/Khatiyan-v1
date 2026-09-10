import { useState } from "react";
import { Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { AlertTriangle, CalendarClock, CalendarDays, Clock3, Hand, LogOut, Settings2 } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { OwnerRequestListSkeleton } from "@/components/skeletons/owner";
import { TabSwitcher } from "@/components/tab-switcher";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ActionButton, ConfirmDialog, NoticeBar, ViewOnlyChip } from "@/features/owner/owner-ui";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery, type OwnerProperty } from "@/store/services/property-api";
import {
  type UpcomingTenancyExit,
  useGetExitScheduleSettingsQuery,
  useListUpcomingTenancyExitsQuery,
  useUnscheduleTenancyExitMutation,
  useUpdateExitScheduleSettingsMutation,
} from "@/store/services/tenancy-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const EXIT_ARTWORK = require("../assets/workspace/exit-request.png");

type ExitView = "manual" | "scheduled";

/**
 * Every approved exit for the property, not an arbitrary seven-day slice.
 * Configuration and failures live beside the request they belong to.
 */
export default function OwnerUpcomingExitsScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const errors = useFormErrors<never>();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const selectedProperty = resolveSelectedProperty(propertiesQuery.data ?? [], selectedPropertyId);
  const propertyId = selectedProperty?.id ?? "";
  const { canManage: canManageResource } = usePropertyPermissions(propertyId);
  const canConfigure = canManageResource("EXIT_REQUESTS") && canManageResource("TENANCIES");

  const upcomingQuery = useListUpcomingTenancyExitsQuery(propertyId, {
    skip: !propertyId,
    refetchOnMountOrArgChange: true,
  });
  const settingsQuery = useGetExitScheduleSettingsQuery(propertyId, { skip: !propertyId });
  const [updateSettings, updateState] = useUpdateExitScheduleSettingsMutation();
  const [unschedule, unscheduleState] = useUnscheduleTenancyExitMutation();
  const [activeView, setActiveView] = useState<ExitView>("manual");
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UpcomingTenancyExit | null>(null);

  const exits = upcomingQuery.data ?? [];
  const manualExits = exits.filter((item) => !item.schedule);
  const scheduledExits = exits.filter((item) => item.schedule);
  const visibleExits = activeView === "manual" ? manualExits : scheduledExits;
  const executionTime = settingsQuery.data?.executionTime ?? "00:10:00";

  function changeView(view: ExitView) {
    setTimePickerOpen(false);
    setActiveView(view);
  }

  async function changeTime(event: DateTimePickerEvent, value?: Date) {
    setTimePickerOpen(false);
    if (event.type === "dismissed" || !value || !propertyId) {
      return;
    }
    const next = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:00`;
    try {
      await updateSettings({ executionTime: next, propertyId }).unwrap();
    } catch (caught) {
      errors.failFromServer(errorMessage(caught) || "Could not update the scheduled-exit time.");
    }
  }

  async function removeSchedule() {
    if (!removeTarget) {
      return;
    }
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      await unschedule(target.request.id).unwrap();
    } catch (caught) {
      errors.failFromServer(errorMessage(caught) || "Could not remove this scheduled exit.");
    }
  }

  function openConfiguration(item: UpcomingTenancyExit) {
    router.push({
      pathname: "/owner-end-tenancy",
      params: {
        edit: item.schedule ? "1" : "0",
        mode: "schedule",
        requestId: item.request.id,
        tenancyId: item.request.tenancyId,
      },
    });
  }

  return (
    <ScreenScrollView safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader
        badge={!canConfigure ? <ViewOnlyChip /> : null}
        italicTail="exits."
        subtitle={
          selectedProperty
            ? `Approved exits for ${selectedProperty.name}, including schedules that need attention.`
            : "Select a property on Home first."
        }
        title="Upcoming"
      />

      {!selectedProperty && !propertiesQuery.isFetching ? (
        <EmptyState
          description="Upcoming exits are scoped to the active owner property."
          icon={LogOut}
          title="No property selected"
        />
      ) : null}

      {selectedProperty ? (
        <>
          <TabSwitcher<ExitView>
            active={activeView}
            onChange={changeView}
            options={[
              { icon: Hand, label: "Manual", value: "manual" },
              { icon: CalendarClock, label: "Scheduled", value: "scheduled" },
            ]}
          />

          {activeView === "scheduled" ? (
            <Card style={{ padding: spacing.lg }}>
              <View style={{ gap: spacing.lg }}>
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: colors.primarySoft,
                      borderRadius: 999,
                      flexShrink: 0,
                      height: 58,
                      justifyContent: "center",
                      width: 58,
                    }}
                  >
                    <Settings2 color={colors.ink} size={25} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[type.metric, { color: colors.ink, fontSize: 21, lineHeight: 26 }]}>Execution time</Text>
                    <Text style={[type.body, { color: colors.muted, fontSize: 14, lineHeight: 21 }]}>
                      Due exits run daily at this property time and are checked again when the app starts.
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: colors.primarySoft,
                    borderCurve: "continuous",
                    borderRadius: 18,
                    flexDirection: "row",
                    gap: spacing.sm,
                    justifyContent: "space-between",
                    minHeight: 84,
                    padding: spacing.md,
                  }}
                >
                  <View style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm, minWidth: 0 }}>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: colors.neutralSoft,
                        borderRadius: 999,
                        flexShrink: 0,
                        height: 50,
                        justifyContent: "center",
                        width: 50,
                      }}
                    >
                      <Clock3 color={colors.primaryDeep} size={25} strokeWidth={2.2} />
                    </View>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      numberOfLines={1}
                      style={[type.metric, { color: colors.ink, flexShrink: 1, fontSize: 22, lineHeight: 28 }]}
                    >
                      {formatTime(executionTime)}
                    </Text>
                  </View>
                  <AnimatedPressable
                    accessibilityRole="button"
                    disabled={!canConfigure || updateState.isLoading}
                    onPress={() => setTimePickerOpen(true)}
                    style={{
                      alignItems: "center",
                      backgroundColor: canConfigure && !updateState.isLoading ? colors.primary : colors.neutralSoft,
                      borderCurve: "continuous",
                      borderRadius: 14,
                      flexShrink: 0,
                      justifyContent: "center",
                      minHeight: 52,
                      paddingHorizontal: spacing.sm,
                      width: 112,
                    }}
                  >
                    <Text
                      style={[
                        type.bodyStrong,
                        { color: canConfigure && !updateState.isLoading ? colors.onPrimary : colors.muted, fontSize: 15 },
                      ]}
                    >
                      {updateState.isLoading ? "Saving..." : "Change"}
                    </Text>
                  </AnimatedPressable>
                </View>
              </View>
            </Card>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            {upcomingQuery.isFetching && exits.length === 0 ? (
              <OwnerRequestListSkeleton rows={3} />
            ) : visibleExits.length === 0 ? (
              <EmptyState
                artwork={EXIT_ARTWORK}
                description={
                  activeView === "manual"
                    ? "Approved exits that still need manual execution or schedule setup will appear here."
                    : "Add an approved exit from Manual to configure its automatic execution."
                }
                title={activeView === "manual" ? "No manual exits" : "No scheduled exits"}
              />
            ) : (
              visibleExits.map((item) => (
                <UpcomingExitCard
                  canConfigure={canConfigure}
                  item={item}
                  key={item.request.id}
                  onConfigure={() => openConfiguration(item)}
                  onRemove={() => setRemoveTarget(item)}
                  removing={unscheduleState.isLoading && removeTarget?.request.id === item.request.id}
                />
              ))
            )}
          </View>
        </>
      ) : null}

      {activeView === "scheduled" && timePickerOpen ? (
        <DateTimePicker mode="time" onChange={changeTime} value={timeToDate(executionTime)} />
      ) : null}

      {removeTarget ? (
        <ConfirmDialog
          confirmLabel="Remove schedule"
          destructive
          message="The approved exit request will remain unchanged. Only automatic execution is removed, and this action stays in the audit trail."
          onCancel={() => setRemoveTarget(null)}
          onConfirm={() => void removeSchedule()}
          title="Remove from scheduled exits?"
        />
      ) : null}

      {errors.serverError ? (
        <AlertModal message={errors.serverError} onClose={errors.dismissServerError} />
      ) : null}
    </ScreenScrollView>
  );
}

function UpcomingExitCard({
  canConfigure,
  item,
  onConfigure,
  onRemove,
  removing,
}: {
  canConfigure: boolean;
  item: UpcomingTenancyExit;
  onConfigure: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const { colors, type } = useTheme();
  const { request, schedule } = item;
  const withdrawalPending = request.status === "WITHDRAWAL_REQUESTED";

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.neutralSoft,
              borderRadius: 999,
              height: 42,
              justifyContent: "center",
              width: 42,
            }}
          >
            <LogOut color={colors.ink} size={20} strokeWidth={2.1} />
          </View>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.ink, fontSize: 18 }]}>
              {request.tenantName?.trim() || "Tenant"}
            </Text>
            <Text style={[type.caption, { color: colors.kicker, fontWeight: "800" }]}>
              {request.referenceCode}
            </Text>
          </View>
          <Text style={[type.caption, { color: schedule ? colors.successText : colors.warningText, fontWeight: "900" }]}>
            {withdrawalPending ? "PAUSED" : schedule ? "SCHEDULED" : "SETUP NEEDED"}
          </Text>
        </View>

        <View style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: spacing.sm, padding: spacing.md }}>
          <InfoLine icon={CalendarDays} label="Checkout" value={formatDate(request.approvedCheckoutDate ?? request.requestedCheckoutDate)} />
          <InfoLine icon={LogOut} label="Exit type" value={request.type === "PREMATURE" ? "Premature exit" : "Normal notice"} />
          {schedule ? <InfoLine icon={CalendarClock} label="Runs at" value={formatTime(item.executionTime)} /> : null}
        </View>

        {withdrawalPending ? (
          <NoticeBar
            message="Automatic execution is paused until management decides whether this exit still stands."
            title="Withdrawal decision pending"
            tone="warning"
          />
        ) : schedule?.lastFailureMessage ? (
          <NoticeBar
            message={schedule.lastFailureMessage}
            title={schedule.lastFailureCode === "PAYMENT_DUE" ? "Payment still due" : "Last attempt failed"}
            tone="danger"
          />
        ) : schedule ? (
          <NoticeBar
            message="The tenancy and every bill will be checked again before anything is changed."
            title="Ready for automatic checkout"
            tone="success"
          />
        ) : (
          <NoticeBar
            message="Review settlement, deposit, damages and the move-out checklist before adding this exit."
            title="Setup required"
            tone="warning"
          />
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {!withdrawalPending ? (
            <ActionButton
              disabled={!canConfigure}
              label={schedule ? "Edit schedule" : "Add to scheduled exits"}
              onPress={onConfigure}
            />
          ) : null}
          {schedule ? (
            <ActionButton
              disabled={!canConfigure || removing}
              label={removing ? "Removing..." : "Remove schedule"}
              onPress={onRemove}
              variant="secondary"
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
      <Icon color={colors.muted} size={16} strokeWidth={2} />
      <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text style={[type.bodyStrong, { color: colors.ink, fontSize: 14 }]}>{value}</Text>
    </View>
  );
}

function timeToDate(value: string) {
  const [hours = 0, minutes = 10] = value.split(":").map(Number);
  const result = new Date();
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function formatTime(value: string) {
  return timeToDate(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function resolveSelectedProperty(properties: OwnerProperty[], selectedPropertyId: string | null) {
  if (properties.length === 0) {
    return null;
  }
  return properties.find((property) => property.id === selectedPropertyId) ?? properties[0];
}
