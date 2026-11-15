import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import NetInfo from "@react-native-community/netinfo";
import { CircleHelp, Clock, MapPin, ScanLine, Trash2, Wifi } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { AnimatedPressable } from "@/components/animated-pressable";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { IconSwitch } from "@/components/icon-switch";
import { loadFailure, LoadFailedScreen } from "@/components/load-failed";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/skeletons/primitives";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/features/forms/server-error";
import { ActionButton, ConfirmDialog } from "@/features/owner/owner-ui";
import { readWifi } from "@/features/roll-call/presence-probe";
import { useAppSelector } from "@/store/hooks";
import { useListMyPropertiesQuery } from "@/store/services/property-api";
import {
  minutesLabel,
  useAddRollCallWifiMutation,
  useGetRollCallSettingsQuery,
  useRemoveRollCallWifiMutation,
  useSaveRollCallSettingsMutation,
  type RollCallSettings,
} from "@/store/services/roll-call-api";
import { cardShadow } from "@/theme/shadows";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Roll call settings (user, 2026-11-15, from the demo): the switch, which stays
 * off until the owner picks the window (there is no default), the window's
 * opening and closing times, and Automatic check-in. With that on, the
 * property's WiFi routers (added with Use this WiFi) and the 100 m location
 * check. With it off, tenants mark themselves present.
 */
export default function OwnerRollCallSettingsScreen() {
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const propertiesQuery = useListMyPropertiesQuery();
  const properties = propertiesQuery.data ?? [];
  const property = properties.find((candidate) => candidate.id === selectedPropertyId) ?? (properties.length === 1 ? properties[0] : null);
  const propertyId = property?.id ?? "";
  const query = useGetRollCallSettingsQuery(propertyId, { skip: !propertyId });
  const settings = query.data;
  const [save, saveState] = useSaveRollCallSettingsMutation();
  const [addWifi, addState] = useAddRollCallWifiMutation();
  const [removeWifi, removeState] = useRemoveRollCallWifiMutation();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RollCallSettings["wifi"][number] | null>(null);
  const [wifiHelpOpen, setWifiHelpOpen] = useState(false);
  // Edited here, sent by Save in the footer (user, 2026-11-15): turning roll call on asks for the window.
  const [edits, setEdits] = useState<Partial<Pick<RollCallSettings, "enabled" | "autoCheckIn" | "windowStartMinute" | "windowEndMinute">>>({});
  const view = settings ? { ...settings, ...edits } : null;
  // The WiFi this phone is on now (user, 2026-11-15), shown above Use this WiFi and marked
  // Connected on a registered router. Read while automatic check-in is on, and again on every change.
  const [current, setCurrent] = useState<{ bssid: string; ssid: string | null } | null>(null);
  const watchWifi = Boolean(view?.autoCheckIn) && Platform.OS !== "web";
  useEffect(() => {
    if (!watchWifi) return undefined;
    let live = true;
    const read = () => void readWifi().then(({ bssid, ssid }) => {
      if (live) setCurrent(bssid ? { bssid, ssid } : null);
    });
    read();
    const unsubscribe = NetInfo.addEventListener(read);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [watchWifi]);
  const currentAdded = Boolean(current && settings?.wifi.some((router) => router.bssid === current.bssid));

  const failure = loadFailure(propertiesQuery, query);
  if (failure) return <LoadFailedScreen failure={failure} />;

  const hasWindow = Boolean(view && view.windowStartMinute != null && view.windowEndMinute != null
    && view.windowStartMinute !== view.windowEndMinute);
  const dirty = Boolean(settings && (Object.keys(edits) as (keyof typeof edits)[]).some((key) => edits[key] !== settings[key]));
  // Save waits for a window while roll call is on (user, 2026-11-15), and for a change.
  const canSave = Boolean(view) && dirty && (!view?.enabled || hasWindow) && !saveState.isLoading;

  function edit(patch: typeof edits) {
    setEdits((previous) => ({ ...previous, ...patch }));
  }

  async function saveSettings() {
    if (!settings || !view) return;
    try {
      await save({
        body: {
          autoCheckIn: view.autoCheckIn,
          enabled: view.enabled,
          version: settings.version,
          windowEndMinute: view.windowEndMinute,
          windowStartMinute: view.windowStartMinute,
        },
        propertyId,
      }).unwrap();
      setEdits({});
      toast.success("Attendance settings saved");
    } catch (caught) {
      setRefusal(errorMessage(caught));
      void query.refetch();
    }
  }

  async function useThisWifi() {
    const { bssid, ssid } = await readWifi();
    if (!bssid) {
      setRefusal("Connect to the property's WiFi first.");
      return;
    }
    try {
      await addWifi({ bssid, propertyId, ssid }).unwrap();
      toast.success(ssid ? `${ssid} added` : "WiFi added");
    } catch (caught) {
      setRefusal(errorMessage(caught));
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    try {
      await removeWifi({ propertyId, wifiId: removing.id }).unwrap();
      setRemoving(null);
      toast.success("WiFi removed");
    } catch (caught) {
      setRemoving(null);
      setRefusal(errorMessage(caught));
    }
  }

  const card = { backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous" as const, borderRadius: radii.card, borderWidth: 1, padding: spacing.md, ...cardShadow(colors.shadow) };

  return (
    <View style={{ flex: 1 }}>
    <ScreenScrollView bottomPaddingCovered contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }} safeAreaEdges={["top", "bottom"]}>
      <ScreenHeader italicTail="settings." subtitle={property ? `How attendance runs at ${property.name}.` : undefined} title="Attendance" />
      {!settings ? (
        <SettingsSkeleton />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <View style={[card, { alignItems: "center", flexDirection: "row", gap: spacing.md }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>Take attendance</Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                {!view!.enabled ? "Off" : hasWindow ? `Every night, ${minutesLabel(view!.windowStartMinute)} to ${minutesLabel(view!.windowEndMinute)}` : "Set the attendance window below"}
              </Text>
            </View>
            <IconSwitch
              accessibilityLabel="Take attendance"
              busy={false}
              enabled={view!.enabled}
              onChange={(next) => edit({ enabled: next })}
              raised
              renderIcon={(color) => <ScanLine color={color} size={14} strokeWidth={2.4} />}
            />
          </View>

          {/* Right under the roll call switch (user, 2026-11-15). */}
          <View style={[card, { alignItems: "center", flexDirection: "row", gap: spacing.md }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>Automatic check-in</Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                {view!.autoCheckIn ? "Checked by the property's WiFi or location when they open the app" : "Off: tenants mark themselves present"}
              </Text>
            </View>
            <IconSwitch
              accessibilityLabel="Automatic check-in"
              busy={false}
              enabled={view!.autoCheckIn}
              onChange={(next) => edit({ autoCheckIn: next })}
              raised
              renderIcon={(color) => <Wifi color={color} size={14} strokeWidth={2.4} />}
            />
          </View>

          {/* Asked for once roll call is turned on (user, 2026-11-15). */}
          {view!.enabled ? (
            <View style={{ gap: spacing.sm }}>
              {/* "Attendance window", its line under the heading, the labels in the borders (user, 2026-11-15). */}
              <SectionHeading title="Attendance window" />
              {/* No helper line (user, 2026-11-15). Only the error, under the fields, when both times match. */}
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs }}>
                <WindowTime label="Opens" minutes={view!.windowStartMinute} onPick={(minutes) => edit({ windowStartMinute: minutes })} />
                <WindowTime label="Closes" minutes={view!.windowEndMinute} onPick={(minutes) => edit({ windowEndMinute: minutes })} />
              </View>
              {view!.windowStartMinute != null && view!.windowStartMinute === view!.windowEndMinute ? (
                <Text style={[type.caption, { color: colors.danger }]}>Pick different times for opening and closing.</Text>
              ) : null}
            </View>
          ) : null}

          {view!.autoCheckIn ? (
            <>
              <View style={{ gap: spacing.sm }}>
                <SectionHeading
                  title="Property WiFi"
                  trailingInline
                  trailing={
                    <AnimatedPressable accessibilityLabel="How property WiFi works" accessibilityRole="button" hitSlop={10}
                      onPress={() => setWifiHelpOpen(true)} style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}>
                      <CircleHelp color={colors.kicker} size={20} strokeWidth={2.4} />
                    </AnimatedPressable>
                  }
                />
                {/* Every network the property has added, in one grey box (user, 2026-11-15): one per floor
                    or wing, any of them marks a tenant present. No Connected chip in here. */}
                <View style={{ backgroundColor: colors.neutralSoft, borderCurve: "continuous", borderRadius: radii.card, gap: spacing.xs, padding: spacing.sm }}>
                  {settings.wifi.length === 0 ? (
                    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, padding: spacing.sm }}>
                      <Wifi color={colors.muted} size={20} strokeWidth={2.2} />
                      <Text style={{ color: colors.muted, fontFamily: fonts.sansBold, fontSize: 14 }}>No WiFi added yet</Text>
                    </View>
                  ) : settings.wifi.map((router) => (
                    <View key={router.id} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm, padding: spacing.sm }}>
                      <Wifi color={colors.primary} size={20} strokeWidth={2.2} />
                      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14.5 }}>{router.ssid ?? "Unnamed network"}</Text>
                        <Text style={[type.caption, { color: colors.muted }]}>{router.bssid}</Text>
                      </View>
                      <AnimatedPressable accessibilityLabel={`Remove ${router.ssid ?? "this WiFi"}`} accessibilityRole="button" hitSlop={8} onPress={() => setRemoving(router)}>
                        <Trash2 color={colors.danger} size={19} strokeWidth={2.2} />
                      </AnimatedPressable>
                    </View>
                  ))}
                </View>
                {/* The phone's own network, under the box, until it is added and moves in. */}
                {current && !currentAdded ? (
                  <View style={[card, { alignItems: "center", flexDirection: "row", gap: spacing.sm }]}>
                    <Wifi color={colors.successText} size={20} strokeWidth={2.2} />
                    <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14.5 }}>{current.ssid ?? "This network"}</Text>
                      <Text style={[type.caption, { color: colors.muted }]}>{current.bssid}</Text>
                    </View>
                    <ConnectedLabel />
                  </View>
                ) : null}
                <View style={{ flexDirection: "row" }}>
                  <ActionButton disabled={addState.isLoading || Platform.OS === "web" || currentAdded} icon={Wifi} label={addState.isLoading ? "Adding" : "Use this WiFi"} onPress={() => void useThisWifi()} variant="secondary" />
                </View>
              </View>

              <View style={{ gap: spacing.sm }}>
                <SectionHeading title="Location" />
                <View style={[card, { alignItems: "center", flexDirection: "row", gap: spacing.sm }]}>
                  <MapPin color={colors.danger} size={20} strokeWidth={2.2} />
                  <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
                    {property?.latitude != null
                      ? `Within ${settings.radiusMeters} m of the property's pin, when WiFi does not match. Fake locations are refused.`
                      : "Set the property's location on its profile to check by location."}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </View>
      )}

      {removing ? (
        <ConfirmDialog
          confirmLabel={removeState.isLoading ? "Removing" : "Remove"}
          message={`${removing.ssid ?? "This network"} will no longer mark tenants present.`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
          title="Remove this WiFi?"
        />
      ) : null}
      {wifiHelpOpen ? (
        <HowItWorksSheet
          eyebrow="Property WiFi"
          onClose={() => setWifiHelpOpen(false)}
          steps={WIFI_HOW_IT_WORKS.map((point) => ({ body: point, title: point }))}
          title="How property WiFi works"
        />
      ) : null}
      {refusal ? <AlertModal message={refusal} onClose={() => setRefusal(null)} /> : null}
    </ScreenScrollView>
    {/* Saves the switches and the window together (user, 2026-11-15). Disabled until the window is set while roll call is on. */}
    <PinnedFooter>
      <View style={{ flexDirection: "row" }}>
        <ActionButton disabled={!canSave} label={saveState.isLoading ? "Saving" : "Save"} onPress={() => void saveSettings()} />
      </View>
    </PinnedFooter>
    </View>
  );
}

/** Settings loading: the two switch cards and the window's fields, as grey shapes of their own size. */
function SettingsSkeleton() {
  const { colors } = useTheme();
  const card = { alignItems: "center" as const, backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous" as const, borderRadius: radii.card, borderWidth: 1, flexDirection: "row" as const, gap: spacing.md, padding: spacing.md };
  return (
    <View accessibilityLabel="Loading attendance settings" style={{ gap: spacing.lg }}>
      {[0, 1].map((index) => (
        <View key={index} style={card}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={15} width="45%" />
            <Skeleton height={11} width="70%" />
          </View>
          <Skeleton height={28} radius={999} width={52} />
        </View>
      ))}
      <Skeleton height={18} width="40%" />
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Skeleton height={46} radius={radii.card} /></View>
        <View style={{ flex: 1 }}><Skeleton height={46} radius={radii.card} /></View>
      </View>
    </View>
  );
}

/** The Property WiFi help, moved off the screen into its How it works (user, 2026-11-15). */
const WIFI_HOW_IT_WORKS = [
  "Connect to one or more WiFi networks in your property, one at a time.",
  "While connected, tap Use this WiFi to add that network. Do it once for each floor's router.",
  "Added networks move into the grey box. Any of them marks a tenant present when they open the app in the window.",
  "Floors sharing one network name still have separate routers, so add each.",
  "WiFi can only be read on a phone, not in a browser.",
];

/** Green "Connected" beside the network this phone is on (user, 2026-11-15). */
function ConnectedLabel() {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
      <View style={{ backgroundColor: colors.successText, borderRadius: 999, height: 6, width: 6 }} />
      <Text style={{ color: colors.successText, fontFamily: fonts.sansBold, fontSize: 12 }}>Connected</Text>
    </View>
  );
}

/** One end of the window: "Pick a time" until chosen, the native time picker on tap. */
function WindowTime({ label, minutes, onPick }: { label: string; minutes: number | null; onPick: (minutes: number) => void }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const value = new Date();
  value.setHours(minutes == null ? 21 : Math.floor(minutes / 60), minutes == null ? 0 : minutes % 60, 0, 0);

  function picked(event: DateTimePickerEvent, selected?: Date) {
    setOpen(false);
    if (event.type === "dismissed" || !selected) return;
    onPick(selected.getHours() * 60 + selected.getMinutes());
  }

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityLabel={`${label}, ${minutes == null ? "not set" : minutesLabel(minutes)}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{ alignItems: "center", backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm + 2 }}
      >
        <Clock color={colors.kicker} size={15} />
        <Text style={{ color: minutes == null ? colors.muted : colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
          {minutes == null ? "Pick a time" : minutesLabel(minutes)}
        </Text>
      </Pressable>
      {/* In the border, like the app's other notched fields (user, 2026-11-15). */}
      <View pointerEvents="none" style={{ backgroundColor: colors.surface, left: spacing.sm, paddingHorizontal: 4, position: "absolute", top: -8 }}>
        <Text style={[type.caption, { color: colors.kicker, fontFamily: fonts.sansBold, fontSize: 11, lineHeight: 14 }]}>{label}</Text>
      </View>
      {open ? <DateTimePicker mode="time" onChange={picked} value={value} /> : null}
    </View>
  );
}
