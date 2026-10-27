import { useEffect, useRef, useState, type ReactNode } from "react";
import { Switch, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CircleHelp, Info, LockKeyhole, RotateCcw, UsersRound } from "lucide-react-native";

import { AlertModal } from "@/components/alert-modal";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { FieldError } from "@/components/field-error";
import { HowItWorksSheet } from "@/components/how-it-works-sheet";
import { PinnedFooter, PINNED_FOOTER_CLEARANCE } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { BookingSettingsSkeleton } from "@/components/skeletons/booking/settings";
import { useToast } from "@/components/toast";
import { useUnsavedChanges } from "@/components/use-unsaved-changes";
import { BookingAccessList } from "@/features/booking/booking-access-list";
import {
  bookingAccessDraftAfter,
  bookingAccessReplacement,
  bookingSettingsDraft,
  validateBookingSettings,
  type BookingAccessDraft,
  type BookingSettingsDraft,
} from "@/features/booking/booking-settings-form";
import { ModeRow } from "@/features/enquiry/handler-mode-sheet";
import { errorMessage } from "@/features/forms/server-error";
import { isUnchanged } from "@/features/forms/unchanged";
import { ActionButton, FormInput, IconButton, NoticeBar } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useCreateBookingSettingsMutation,
  useGetBookingSettingsQuery,
  useSaveBookingSettingsMutation,
  type BookingSettings,
} from "@/store/services/booking-api";
import { useGetMyPropertyPermissionsQuery, useListMyPropertiesQuery, useReplaceManagerPermissionsMutation } from "@/store/services/property-api";
import { isStaleRefusal } from "@/store/stale-refusal";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type SettingsErrors = ReturnType<typeof validateBookingSettings>["errors"];

/** Which field errors an edit to each field answers. Turning the token off answers both of its own. */
const CLEARS: Record<keyof BookingSettingsDraft, (keyof SettingsErrors)[]> = {
  tokenRequired: ["tokenAmount", "tokenRefundable"],
  tokenAmount: ["tokenAmount"],
  tokenRefundable: ["tokenRefundable"],
  showFutureVacancies: [],
  assignmentMode: [],
  includeOwnerInTurns: [],
};

/** Owner-only, even when a manager has the BOOKINGS grant. */
export default function OwnerBookingSettingsScreen() {
  const { colors } = useTheme();
  const propertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const hydrated = useAppSelector((state) => state.auth.hydrated);
  const propertiesQuery = useListMyPropertiesQuery(undefined, { skip: !hydrated });
  const properties = propertiesQuery.currentData;
  const property = propertyId ? properties?.find((item) => item.id === propertyId && item.active) : properties?.find((item) => item.active);
  const permissionsQuery = useGetMyPropertyPermissionsQuery(property?.id ?? "", { skip: !property });
  // No optimistic permission fallback: do not even read owner-only settings
  // until the actual property's permissions have arrived.
  const owner = permissionsQuery.currentData?.owner === true;
  const settingsQuery = useGetBookingSettingsQuery(property?.id ?? "", {
    skip: !owner || !property,
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });
  const settings = settingsQuery.currentData;

  if (property && owner && settings) {
    return <BookingSettingsEditor key={property.id} propertyName={property.name} settings={settings} readError={settingsQuery.isError ? errorMessage(settingsQuery.error) : null} onReload={() => settingsQuery.refetch().unwrap()} />;
  }

  const loading = !hydrated || (!properties && !propertiesQuery.isError) || Boolean(property && !permissionsQuery.currentData && !permissionsQuery.isError) || Boolean(owner && !settings && !settingsQuery.isError);
  const failed = propertiesQuery.isError ? propertiesQuery.error : permissionsQuery.isError ? permissionsQuery.error : settingsQuery.isError ? settingsQuery.error : null;
  return (
    <ScreenScrollView surface={colors.background} safeAreaEdges={["top", "bottom"]} refreshable={false}>
      <ScreenHeader title="Booking" italicTail="settings." subtitle={property ? `How bookings work at ${property.name}.` : "Choose a property on Home to set up bookings."} />
      {loading ? <BookingSettingsSkeleton /> : failed ? (
        <>
          <NoticeBar tone="danger" title="Could not load booking settings" message={errorMessage(failed)} />
          <View style={{ flexDirection: "row" }}>
            <ActionButton icon={RotateCcw} label="Try again" onPress={() => { if (propertiesQuery.isError) void propertiesQuery.refetch(); else if (permissionsQuery.isError) void permissionsQuery.refetch(); else void settingsQuery.refetch(); }} />
          </View>
        </>
      ) : property && !owner ? (
        <EmptyState icon={LockKeyhole} title="Owner-only settings" description="Only the property owner can change how bookings work." />
      ) : (
        <EmptyState icon={UsersRound} title="No active property selected" description="Select an active property on Home, then return to booking settings." />
      )}
    </ScreenScrollView>
  );
}

/**
 * One card for each thing the owner decides (user, 2026-10-10), and one Save
 * for all of them, the ticks on the access list included.
 */
function BookingSettingsEditor({ propertyName, settings, readError, onReload }: {
  propertyName: string;
  settings: BookingSettings;
  readError: string | null;
  onReload: () => Promise<BookingSettings>;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [baseline, setBaseline] = useState(settings);
  const [draft, setDraft] = useState(() => bookingSettingsDraft(settings));
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  // Managers ticked or unticked and not yet saved.
  const [access, setAccess] = useState<BookingAccessDraft>({});
  const [working, setWorking] = useState(false);
  // Whether this visit has saved yet. Until it has, the reader is told what a change will touch.
  const [savedOnce, setSavedOnce] = useState(false);
  // The token's two notes, behind the i on its card.
  const [tokenHelpOpen, setTokenHelpOpen] = useState(false);
  // The refund rules, behind the question mark on the refund policy's card.
  const [refundHelpOpen, setRefundHelpOpen] = useState(false);
  const busy = useRef(false);
  const [create] = useCreateBookingSettingsMutation();
  const [save] = useSaveBookingSettingsMutation();
  const [replacePermissions] = useReplaceManagerPermissionsMutation();
  const dirty = !isUnchanged(bookingSettingsDraft(baseline), draft);
  const accessChanged = Object.keys(access).length > 0;
  // An invalidation can briefly leave the pre-save query response on screen.
  // Never roll a successful write back to that older version.
  const serverChanged = settings.configured && (!baseline.configured || (settings.version ?? -1) > (baseline.version ?? -1));
  // Leaving with anything unsaved asks first, whichever way out is taken.
  const unsaved = useUnsavedChanges(dirty || accessChanged);
  const blocked = Object.keys(errors).length > 0;

  // Follow a fresh read only when there are no edits to lose. In particular,
  // changing access invalidates Property and must not reset this form.
  useEffect(() => {
    if (serverChanged && !dirty && !busy.current) {
      setBaseline(settings);
      setDraft(bookingSettingsDraft(settings));
    }
  }, [dirty, serverChanged, settings]);

  function change<K extends keyof BookingSettingsDraft>(field: K, value: BookingSettingsDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    // Correcting the field that was blamed releases Save. The others stay blamed.
    setErrors((current) => {
      const next = { ...current };
      for (const answered of CLEARS[field]) delete next[answered];
      return next;
    });
  }

  async function submit() {
    if (busy.current || serverChanged) return;
    // The first save always writes the settings: that is what sets bookings up.
    const writeSettings = !baseline.configured || dirty;
    const ticks = Object.entries(access);
    if (!writeSettings && ticks.length === 0) {
      toast.warning("No changes have been made.");
      return;
    }
    const result = validateBookingSettings(draft);
    if (writeSettings) {
      setErrors(result.errors);
      if (!result.valid) return;
    }
    busy.current = true;
    setWorking(true);
    let settingsSaved = false;
    let managersSaved = 0;
    try {
      if (writeSettings) {
        const updated = baseline.configured
          ? await save({ propertyId: baseline.propertyId, version: baseline.version!, body: result.body }).unwrap()
          : await create({ propertyId: baseline.propertyId, body: result.body }).unwrap();
        setBaseline(updated);
        setDraft(bookingSettingsDraft(updated));
        setSavedOnce(true);
        settingsSaved = true;
      }
      // Each manager's grant is a write of its own. One that went through is
      // never sent again because a later one was refused.
      for (const [managerUserId, tick] of ticks) {
        await replacePermissions(bookingAccessReplacement(tick.permissions, tick.enabled)).unwrap();
        managersSaved++;
        setAccess((current) => { const next = { ...current }; delete next[managerUserId]; return next; });
      }
      toast.success(baseline.configured ? "Booking settings saved." : "Bookings are set up for this property.");
    } catch (caught) {
      // Say what did go through, so nothing saved is mistaken for lost.
      const saved = [settingsSaved ? "Your settings were saved." : null, managersSaved ? `${managersSaved} manager${managersSaved === 1 ? " was" : "s were"} updated.` : null].filter(Boolean).join(" ");
      // The ticks left over were made against grants that may have moved on.
      // They are dropped, so the list shows what is stored and is ticked afresh.
      if (settingsSaved || managersSaved) setAccess({});
      setRefusal(saved ? `${saved} The rest was not saved. ${errorMessage(caught)}` : errorMessage(caught));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  async function reload() {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    try {
      const fresh = await onReload();
      setBaseline(fresh);
      setDraft(bookingSettingsDraft(fresh));
      setErrors({});
    } catch (caught) {
      setRefusal(errorMessage(caught));
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenScrollView surface={colors.background} safeAreaEdges={["top"]} refreshable={false} contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE }}>
        <ScreenHeader title="Booking" italicTail="settings." subtitle={`How bookings work at ${propertyName}.`} />
        {/* At the top, on opening the screen and again whenever a setting is
            actually changed (user, 2026-10-10). Gone once the change is saved. */}
        {!savedOnce || dirty ? <NoticeBar tone="info" title="Changes apply to new requests" message="Existing requests keep their terms." /> : null}
        {!baseline.configured ? <NoticeBar tone="warning" title="Set up bookings first" message="This property takes no booking requests until you save these settings." /> : null}
        {serverChanged && dirty ? <NoticeBar tone="warning" title="Settings changed elsewhere" message="Your edits are still here. Reload the latest settings before saving." /> : null}
        {readError ? <NoticeBar tone="warning" title="Could not refresh settings" message={readError} /> : null}
        {serverChanged || readError ? (
          <View style={{ flexDirection: "row" }}>
            <ActionButton disabled={working} label="Reload latest settings (discards edits)" icon={RotateCcw} variant="secondary" onPress={() => void reload()} />
          </View>
        ) : null}

        <SettingCard title="Take a token" description="Paid directly to you to confirm a booking. The app only records it." trailing={<SettingSwitch label="Take a token" value={draft.tokenRequired} disabled={working} onChange={(value) => change("tokenRequired", value)} />}>
          {draft.tokenRequired ? null : <NoticeBar tone="warning" title="Bookings without a token" message="Agreeing terms confirms the booking at once. A tenant who then cancels cannot book here again for 30 days." />}
        </SettingCard>

        {draft.tokenRequired ? (
          <>
            {/* What the owner should know about the amount sits behind the
                question mark, in the app's How it works sheet (user, 2026-10-10). */}
            <SettingCard title="Token amount" trailing={<IconButton accessibilityLabel="How the token works" icon={CircleHelp} onPress={() => setTokenHelpOpen(true)} />}>
              <FormInput label="Fixed token amount" required prefix="₹" placeholder="Enter amount" value={draft.tokenAmount} error={errors.tokenAmount} keyboardType="decimal-pad" disabled={working} onChangeText={(value) => change("tokenAmount", value)} />
            </SettingCard>

            {/* The rules that are not the owner's to choose sit behind the
                question mark, in the same sheet the Token amount card opens
                (user, 2026-10-10). The card keeps only the choice. */}
            <SettingCard title="Token refund policy" description="Refundable if the tenant cancels?" trailing={<IconButton accessibilityLabel="Token refund rules" icon={CircleHelp} onPress={() => setRefundHelpOpen(true)} />}>
              <ModeRow label="Yes, refund the token" selected={draft.tokenRefundable === true} disabled={working} onPress={() => change("tokenRefundable", true)} />
              <ModeRow label="No, keep the token" selected={draft.tokenRefundable === false} disabled={working} onPress={() => change("tokenRefundable", false)} />
              <FieldError message={errors.tokenRefundable} />
            </SettingCard>
          </>
        ) : null}

        {/* Said, not asked: two rules, each under its own heading (user, 2026-10-10).
            The charge for bookings further ahead was dropped for v1 (user, 2026-10-18).
            The numbers are the server's, never typed into this screen. The pale
            blue wash was asked for on this card by name, and sets the one card
            that is read apart from the ones that are answered. */}
        <SettingCard title="Move-in policies" tinted>
          <Policy heading="Move-in date" text={`A tenant chooses a move-in date ${baseline.minimumAdvanceDays} to ${baseline.maximumAdvanceDays} days after sending the request. This window is the same for every property.`} />
          <Policy heading="Date change" text={`Once the booking is confirmed, the tenant can move the date one time, by up to ${baseline.datePushMaximumDays} days. So a booking never reaches past ${baseline.maximumAdvanceDays + baseline.datePushMaximumDays} days.`} />
        </SettingCard>

        <SettingCard title="Beds being vacated" description="Also offer beds an approved exit is about to free. Off shows only beds free today." trailing={<SettingSwitch label="Show beds being vacated" value={draft.showFutureVacancies} disabled={working} onChange={(value) => change("showFutureVacancies", value)} />} />

        {/* What a tick does is said by the list itself, and only when there is someone to tick. */}
        <SettingCard title="Booking access">
          <BookingAccessList propertyId={baseline.propertyId} draft={access} disabled={working} onChange={(permissions, enabled) => setAccess((current) => bookingAccessDraftAfter(current, permissions, enabled))} />
        </SettingCard>

        {/* The same rows as the Enquiries screen's own handler setting (user, 2026-10-10). */}
        <SettingCard title="How requests are assigned">
          {/* Named and ordered as the Enquiries setting is, with the same Suggested mark (user, 2026-10-11). */}
          <ModeRow suggested label="Auto assigned" description="Each new request goes to the next person in turn, so everyone gets an even share. The owner is included in the turns as well." selected={draft.assignmentMode === "SYSTEM_TURNS"} disabled={working} onPress={() => change("assignmentMode", "SYSTEM_TURNS")} />
          <ModeRow label="First to respond" description="New requests wait for anyone with booking access, you included. Whoever responds first handles the request." selected={draft.assignmentMode === "FIRST_VIEW"} disabled={working} onPress={() => change("assignmentMode", "FIRST_VIEW")} />
          {/* No switch for the owner's own turn: the owner is always in them (user, 2026-10-11). */}
          <InfoLine text="Only the handler and you can act on a request. Requests already waiting keep who they have." />
        </SettingCard>
      </ScreenScrollView>
      <PinnedFooter>
        <View style={{ flexDirection: "row" }}>
          <ActionButton disabled={working || serverChanged || blocked} label={working ? "Saving..." : baseline.configured ? "Save changes" : "Set up bookings"} onPress={() => void submit()} />
        </View>
      </PinnedFooter>
      {tokenHelpOpen ? (
        <HowItWorksSheet
          eyebrow="Booking token"
          title="How the token works"
          onClose={() => setTokenHelpOpen(false)}
          // The user's own wording (2026-10-10). The numbers are the server's.
          steps={[
            {
              title: `Bookings ${baseline.minimumAdvanceDays} to ${baseline.maximumAdvanceDays} days in advance`,
              body: `For an advance booking between ${baseline.minimumAdvanceDays} and ${baseline.maximumAdvanceDays} days, never more than one month of the agreed rent can be charged as the token amount. It is adjusted from the tenant's first cycle bill.`,
            },
          ]}
        />
      ) : null}
      {refundHelpOpen ? (
        <HowItWorksSheet
          eyebrow="Booking token"
          title="Token refund rules"
          onClose={() => setRefundHelpOpen(false)}
          steps={[
            { title: "Refunding is your responsibility", body: "When a booking is cancelled and the token has to go back, you refund it to the tenant yourself." },
            // The user's own sentence (2026-10-10).
            { title: "When the property cancels", body: "It is mandatory to refund a token in case of a booking cancellation from the Property's end." },
            { title: "Khatiyan's role", body: "Khatiyan does not collect, hold or transfer the token. It only keeps a record of what was paid and what was refunded." },
          ]}
        />
      ) : null}
      {/* A refusal is acknowledged, not left on the page. One raised because the
          settings changed elsewhere also leaves this form, so what was typed
          against the old settings is not saved over the newer ones. */}
      {refusal ? <AlertModal message={refusal} onClose={() => { if (isStaleRefusal(refusal)) unsaved.markSaved(); setRefusal(null); }} /> : null}
      {unsaved.dialog}
    </View>
  );
}

/**
 * One decision, in a card of its own: what it is, a line saying what it does,
 * and the control. A yes or no decision carries its switch beside the title.
 */
function SettingCard({ title, description, trailing, tinted = false, children }: {
  title: string;
  description?: string;
  trailing?: ReactNode;
  /** A pale blue wash, for the card that is read and not answered. */
  tinted?: boolean;
  children?: ReactNode;
}) {
  const { colors, type } = useTheme();
  const heading = (
    <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.display, { color: colors.ink, fontSize: 19 }]}>{title}</Text>
        {description ? <Text style={[type.description, { color: colors.muted }]}>{description}</Text> : null}
      </View>
      {trailing}
    </View>
  );
  if (!tinted) return <Card>{heading}{children}</Card>;
  // The section heading band's own two colours, so the wash belongs to the app.
  return (
    <Card style={{ gap: 0, overflow: "hidden", padding: 0 }}>
      <LinearGradient colors={["#EAF2FF", "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ gap: spacing.md, padding: spacing.lg }}>
        {heading}
        {children}
      </LinearGradient>
    </Card>
  );
}

function SettingSwitch({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return <Switch accessibilityLabel={label} disabled={disabled} value={value} onValueChange={onChange} thumbColor={colors.surface} trackColor={{ false: colors.borderStrong, true: colors.primary }} />;
}

/** One rule under its own heading: its name, then the rule in a plain sentence or two. */
function Policy({ heading, text }: { heading: string; text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <SubHeading text={heading} />
      {/* The tenant property board's own description type (user, 2026-10-10). */}
      <Text style={{ color: colors.muted, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 }}>{text}</Text>
    </View>
  );
}

/** A heading inside a card, for a part of it with a name of its own. */
function SubHeading({ text }: { text: string }) {
  const { colors, fonts, type } = useTheme();
  return <Text style={[type.body, { color: colors.ink, fontFamily: fonts.sansBold }]}>{text}</Text>;
}

/** Something worth knowing that is not a warning: the information mark, then the line beside it. */
function InfoLine({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs }}>
      <Info color={colors.primary} size={16} strokeWidth={2.2} style={{ marginTop: 1 }} />
      <Text style={[type.description, { color: colors.muted, flex: 1 }]}>{text}</Text>
    </View>
  );
}

