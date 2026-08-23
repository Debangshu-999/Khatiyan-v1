import { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { Check, ChevronDown, ChevronUp, Info, ShieldCheck, X } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SkeletonCard } from "@/components/skeleton";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { ActionButton, IconButton } from "@/features/owner/owner-ui";
import {
  MANAGEABLE_MODULES,
  PENDING_MODULES,
  applyModuleToggle,
  isModuleOn,
  moduleScreens,
  type AccessModule,
  type AccessScreen,
} from "@/features/owner/manager-access-model";
import {
  useGetManagerPermissionsQuery,
  useReplaceManagerPermissionsMutation,
  type ManagerAccessLevel,
  type ManagerResource,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

type Draft = Partial<Record<ManagerResource, ManagerAccessLevel>>;

const SCREEN_LEVELS: { description: string; label: string; level: ManagerAccessLevel }[] = [
  { level: "NONE", label: "Blocked", description: "They see it listed but cannot open it." },
  { level: "VIEW", label: "View only", description: "Can open and read, but not change anything." },
  { level: "MANAGE", label: "View & manage", description: "Can open, read and act." },
];

// Offered when the module has a single screen — "off" is the toggle's job.
const POSITIVE_LEVELS = SCREEN_LEVELS.filter((option) => option.level !== "NONE");

const LEVEL_LABEL: Record<ManagerAccessLevel, string> = {
  MANAGE: "View & manage",
  NONE: "Blocked",
  VIEW: "View only",
};

export default function OwnerManagerPermissionsScreen() {
  const router = useGuardedRouter();
  const { colors, type } = useTheme();
  const toast = useToast();
  // Permission saves either land or are refused; there is no field to blame.
  const opErrors = useFormErrors<never>();
  const params = useLocalSearchParams<{ managerName?: string; managerUserId?: string; propertyId?: string }>();

  const propertyId = params.propertyId ?? "";
  const managerUserId = params.managerUserId ?? "";
  const managerName = params.managerName?.trim() || "this manager";

  const permissionsQuery = useGetManagerPermissionsQuery(
    { managerUserId, propertyId },
    { skip: !propertyId || !managerUserId },
  );
  const [replacePermissions, saveState] = useReplaceManagerPermissionsMutation();

  // Edits stay local until Save, so a mis-tap is undone by leaving the screen.
  const [draft, setDraft] = useState<Draft>({});
  const [rulesOpen, setRulesOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (permissionsQuery.data) {
      setDraft(permissionsQuery.data.levels);
    }
  }, [permissionsQuery.data]);

  const dirty = useMemo(() => {
    const saved = permissionsQuery.data?.levels;
    if (!saved) {
      return false;
    }
    return MANAGEABLE_MODULES.some((module) =>
      moduleScreens(module).some((screen) => (draft[screen.resource] ?? "NONE") !== saved[screen.resource]),
    );
  }, [draft, permissionsQuery.data]);

  async function save() {
    const saved = permissionsQuery.data?.levels;
    if (!saved) {
      return;
    }

    // The endpoint replaces wholesale, so send the server's full map with the
    // edits layered on. Sending only what this screen shows would revoke every
    // not-yet-manageable resource the moment it becomes editable.
    const levels = { ...saved, ...draft } as Record<ManagerResource, ManagerAccessLevel>;

    try {
      await replacePermissions({ levels, managerUserId, propertyId }).unwrap();
      toast.success(`Permissions updated for ${managerName}.`);
    } catch (error) {
      // Surface what the server said. Swallowing it left "Could not save" as the
      // only signal, which says nothing about whether it was a validation
      // problem, a stale manager row, or the request never landing.
      const message = (error as { data?: { message?: string } })?.data?.message;
      opErrors.failFromServer(message ?? "Could not save permissions. Try again.");
    }
  }

  if (!propertyId || !managerUserId) {
    return (
      <ScreenScrollView safeAreaEdges={["top", "bottom"]} contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }}>
        <ScreenHeader onBack={() => router.back()} eyebrow="Access" title="Manager" italicTail="permissions." />
        <EmptyState
          icon={ShieldCheck}
          title="No manager selected"
          description="Open this from a manager in the Staff workspace."
        />
        {opErrors.serverError ? <AlertModal message={opErrors.serverError} onClose={opErrors.dismissServerError} /> : null}
      </ScreenScrollView>
    );
  }

  return (
    // The save button is pinned below the scroll area, not appended to it: the
    // module list is long enough that a trailing button is off-screen exactly
    // when the owner has finished making changes.
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        safeAreaEdges={["top"]}
        // PINNED_FOOTER_CLEARANCE, not a hand-picked number. The footer is 132pt
        // tall once its fade and safe-area gap are counted, and this was padding
        // 66 — so the last module card could never be scrolled out from under
        // it. The footer adds insets.bottom itself, which is why the scroll view
        // does NOT also take a "bottom" safe-area edge: that would pad for the
        // navigation bar twice.
        contentContainerStyle={{ paddingBottom: PINNED_FOOTER_CLEARANCE, paddingTop: 0 }}
      >
        <ScreenHeader
          onBack={() => router.back()}
          eyebrow="Access"
          title="Manager"
          italicTail="permissions."
          // Kept short on purpose. The accent rule beside a HeaderNote spans the
          // text's full height, so a subtitle that overflows by a word draws a
          // two-line rule next to what reads as one line. Manager names vary in
          // length, so the fixed part carries no words it can spare.
          subtitle={`What ${managerName} can see and do here.`}
        />

        {permissionsQuery.isLoading ? <SkeletonCard /> : null}

        {permissionsQuery.data ? (
          <>
            <Section
              title="What they can access"
              trailing={
                <AnimatedPressable
                  accessibilityLabel="How manager permissions work"
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setRulesOpen(true)}
                  style={{ alignItems: "center", height: 26, justifyContent: "center", width: 26 }}
                  tapLockMs={0}
                >
                  <Info color={colors.kicker} size={17} strokeWidth={2.4} />
                </AnimatedPressable>
              }
            >
              {MANAGEABLE_MODULES.map((module) => (
                <ModuleCard
                  draft={draft}
                  key={module.key}
                  module={module}
                  onChange={setDraft}
                />
              ))}
            </Section>

            {PENDING_MODULES.length ? (
              <Card tone="sunken">
                <Text style={[type.caption, { color: colors.muted, lineHeight: 19 }]}>
                  {PENDING_MODULES.map((module) => module.label).join(", ")} become configurable here as each is rolled
                  out. Until then a manager keeps their current access to them.
                </Text>
              </Card>
            ) : null}
          </>
        ) : null}

        {!permissionsQuery.isLoading && permissionsQuery.isError ? (
          <EmptyState
            icon={ShieldCheck}
            title="Could not load permissions"
            description="Only the property owner can view or change manager permissions."
          />
        ) : null}
      </ScreenScrollView>

      {/* The inset is read explicitly rather than via SafeAreaView, because
          SafeAreaView pads by exactly the inset — which puts the button flush
          against the Android navigation bar. Adding our own gap on top of the
          inset keeps clear space below the button on a device, and still looks
          right on web where the inset is 0. */}
      {permissionsQuery.data ? (
        <PinnedFooter>
          <ActionButton
            disabled={!dirty || saveState.isLoading}
            icon={Check}
            label={saveState.isLoading ? "Saving…" : dirty ? "Save permissions" : "No changes"}
            onPress={() => void save()}
          />
        </PinnedFooter>
      ) : null}

      {rulesOpen ? <PermissionRulesSheet onClose={() => setRulesOpen(false)} /> : null}
    </View>
  );
}


// The rules an owner needs before they start switching things on. Kept behind an
// icon rather than as a paragraph above the list: it is reference material, read
// once, and it was pushing the actual controls below the fold.
function PermissionRulesSheet({ onClose }: { onClose: () => void }) {
  const { colors, fonts, type } = useTheme();
  const rules: { body: string; title: string }[] = [
    {
      title: "They start with nothing",
      body: "A new manager has no access at all. Every module is off until you switch it on — including one you have just re-added after removing them.",
    },
    {
      title: "Off means invisible",
      body: "A module that is off does not appear in their workspace or on their home shortcuts. They are not told it exists.",
    },
    {
      title: "On means it appears",
      body: "Switching a module on adds it to their workspace. You then choose what they can do on each screen inside it.",
    },
    {
      title: "View only removes the controls",
      body: "They can open the screen and read everything on it, but every button that would change something is gone — not greyed out, gone.",
    },
    {
      title: "View & manage lets them act",
      body: "The screen behaves for them exactly as it does for you.",
    },
    {
      title: "A blocked screen still shows",
      body: "In a module with several screens, a blocked one stays listed but refuses to open. The module is already telling them it exists, so hiding it would only confuse.",
    },
    {
      title: "Only you can change this",
      body: "Managers cannot see or edit permissions — their own or anyone else's. Removing a manager clears their permissions entirely.",
    },
  ];

  // No statusBarTranslucent below. It extends the modal window under the system
  // bars on Android, so the sheet's own padding no longer clears the navigation
  // bar and the button at its foot becomes untappable. The billing rules sheet
  // omits it and sits correctly.
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={{ backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            gap: spacing.md,
            maxHeight: "85%",
            padding: spacing.lg,
          }}
        >
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.eyebrow, { color: colors.kicker }]}>
                Access
              </Text>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 22, }}>
                How permissions work
              </Text>
            </View>
            <IconButton accessibilityLabel="Close permission rules" icon={X} onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            {rules.map((rule, index) => (
              <View
                key={rule.title}
                style={{ backgroundColor: colors.surfaceSunken, borderRadius: 14, gap: 4, padding: spacing.md }}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                  <View
                    style={{
                      alignItems: "center",
                      borderColor: colors.ink,
                      borderWidth: 1,
                      borderRadius: 999,
                      height: 22,
                      justifyContent: "center",
                      width: 22,
                    }}
                  >
                    <Text
                      style={{ color: colors.primary, fontFamily: fonts.sansBold, fontSize: 11, }}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <Text
                    style={{ color: colors.ink, flex: 1, fontFamily: fonts.sansBold, fontSize: 14, }}
                  >
                    {rule.title}
                  </Text>
                </View>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  {rule.body}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Every info panel ends in an acknowledgement, not just a corner ×. */}
          <AnimatedPressable
            accessibilityRole="button"
            onPress={onClose}
            style={{
              alignItems: "center",
              backgroundColor: colors.ink,
              borderCurve: "continuous",
              borderRadius: 14,
              justifyContent: "center",
              minHeight: 46,
            }}
          >
            <Text style={{ color: colors.surface, fontFamily: fonts.sansBold, fontSize: 15 }}>Got it</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

function ModuleCard({
  draft,
  module,
  onChange,
}: {
  draft: Draft;
  module: AccessModule;
  onChange: (updater: (current: Draft) => Draft) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const on = isModuleOn(module, draft);
  // A module with exactly one screen has nothing to decide beyond the level, so
  // it renders flat and drops "Blocked" — the toggle already says that.
  const collapse = moduleScreens(module).length === 1;
  // Collapsed by default. A module carries up to five screens with three options
  // each, so an all-open list buries the modules further down the screen.
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <Card>
      <View style={{ gap: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.md }}>
          <AnimatedPressable
            accessibilityLabel={`${module.label} settings`}
            accessibilityRole="button"
            accessibilityState={{ expanded: on && expanded }}
            disabled={!on}
            onPress={() => setExpanded((current) => !current)}
            style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm }}
            tapLockMs={0}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.display, fontSize: 19, }}>
                {module.label}
              </Text>
              <Text style={[type.caption, { color: colors.muted }]}>
                {on ? module.description : "Hidden from their workspace."}
              </Text>
            </View>
            {on ? <Chevron color={colors.kicker} size={18} strokeWidth={2.4} /> : null}
          </AnimatedPressable>
          <Switch
            accessibilityLabel={`${module.label} access`}
            onValueChange={(next) => {
              onChange((current) => applyModuleToggle(module, next, current));
              // Switching on opens it: the owner has just said they want this
              // module, and the levels are the next decision.
              setExpanded(next);
            }}
            thumbColor={colors.surface}
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            value={on}
          />
        </View>

        {on && !expanded ? <ModuleSummary draft={draft} module={module} /> : null}

        {on && expanded
          ? module.sections.map((section, sectionIndex) => (
              <View key={section.label ?? `section-${sectionIndex}`} style={{ gap: spacing.sm }}>
                {section.label ? (
                  <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
                    <Text style={[type.eyebrow, { color: colors.kicker }]}>
                      {section.label}
                    </Text>
                    <View style={{ backgroundColor: colors.border, flex: 1, height: 1 }} />
                  </View>
                ) : null}

                {section.screens.map((screen) => (
                  <View key={screen.resource} style={{ gap: spacing.xs }}>
                    {collapse ? null : (
                      <View style={{ gap: 1 }}>
                        <Text
                          style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5, }}
                        >
                          {screen.label}
                        </Text>
                        <Text style={[type.caption, { color: colors.muted }]}>
                          {screen.description}
                        </Text>
                      </View>
                    )}
                    {screen.derivedFrom ? (
                      // Read-only: the grant lives in another module. Showing a
                      // second set of options here would be two controls for one
                      // stored value, and whichever was edited last would look
                      // like it had silently changed the other.
                      //
                      // Stacked rather than a single row: the level and the
                      // pointer are two separate facts, and side by side they
                      // squeezed each other on a phone.
                      <View
                        style={{
                          backgroundColor: colors.surfaceSunken,
                          borderColor: colors.border,
                          borderCurve: "continuous",
                          borderRadius: 14,
                          borderWidth: 1,
                          gap: 4,
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                        }}
                      >
                        <Text
                          style={{
                            color:
                              (draft[screen.resource] ?? "NONE") === "MANAGE"
                                ? colors.primary
                                : (draft[screen.resource] ?? "NONE") === "VIEW"
                                  ? colors.ink
                                  : colors.muted,
                            fontFamily: fonts.sansBold,
                            fontSize: 13.5,
                          }}
                        >
                          {LEVEL_LABEL[draft[screen.resource] ?? "NONE"]}
                        </Text>
                        <Text style={[type.caption, { color: colors.muted }]}>
                          Configure in {screen.derivedFrom}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: spacing.xs }}>
                        {levelsFor(screen, collapse).map((option) => (
                          <LevelOption
                            active={(draft[screen.resource] ?? "NONE") === option.level}
                            description={option.description}
                            key={option.level}
                            label={option.label}
                            onPress={() => onChange((current) => ({ ...current, [screen.resource]: option.level }))}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                ))}

                {collapse ? null : (
                  <Text style={[type.caption, { color: colors.kicker, lineHeight: 17 }]}>
                    {section.blockedBehaviour === "toast"
                      ? "Blocked here means the screen will not open, and they are told why."
                      : "Blocked here means the section opens but explains they have no access."}
                  </Text>
                )}
              </View>
            ))
          : null}
      </View>
    </Card>
  );
}

/**
 * What a collapsed module is currently set to.
 *
 * <p>
 * The whole point of collapsing is that the owner can still read their choices
 * without opening anything, so this lists every screen and its level rather than
 * a count. Level colour carries the meaning at a glance: muted for blocked,
 * plain for view, primary for manage.
 */
function ModuleSummary({ draft, module }: { draft: Draft; module: AccessModule }) {
  const { colors, fonts, type } = useTheme();

  return (
    <View style={{ gap: 6 }}>
      {moduleScreens(module).map((screen) => {
        const level = draft[screen.resource] ?? "NONE";
        return (
          <View key={screen.resource} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Text numberOfLines={1} style={[type.caption, { color: colors.muted, flex: 1 }]}>
              {screen.label}
            </Text>
            <Text
              style={{
                color: level === "MANAGE" ? colors.primary : level === "VIEW" ? colors.ink : colors.muted,
                fontFamily: fonts.sansBold,
                fontSize: 12,
              }}
            >
              {LEVEL_LABEL[level]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Which levels a screen offers.
 *
 * - A collapsed (single-screen) module drops Blocked, because its toggle is
 *   already the off switch.
 * - A screen with no view-only state offers Blocked or manage only — there is
 *   nothing to read on a form you cannot submit.
 * - A screen marked noBlocked drops Blocked for the same reason a collapsed
 *   module does: the module toggle is already its off switch, and a second one
 *   would let an owner enable a module then shut a screen nobody can work
 *   without.
 */
function levelsFor(screen: AccessScreen, collapse: boolean) {
  if (collapse || screen.noBlocked) {
    return POSITIVE_LEVELS;
  }
  if (screen.noViewOnly) {
    return SCREEN_LEVELS.filter((option) => option.level !== "VIEW");
  }
  return SCREEN_LEVELS;
}

function LevelOption({
  active,
  description,
  label,
  onPress,
}: {
  active: boolean;
  description: string;
  label: string;
  onPress: () => void;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      tapLockMs={0}
      style={{
        alignItems: "center",
        backgroundColor: active ? colors.primarySoft : colors.surfaceSunken,
        borderColor: active ? colors.primary : colors.border,
        borderCurve: "continuous",
        borderRadius: 14,
        borderWidth: active ? 1.5 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: active ? colors.primary : "transparent",
          borderColor: active ? colors.primary : colors.borderStrong,
          borderCurve: "continuous",
          borderRadius: 6,
          borderWidth: 1.5,
          height: 20,
          justifyContent: "center",
          width: 20,
        }}
      >
        {active ? <Check color={colors.onPrimary} size={13} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={{
            color: active ? colors.primary : colors.ink,
            fontFamily: fonts.sansBold,
            fontSize: 13.5,
          }}
        >
          {label}
        </Text>
        <Text style={[type.caption, { color: colors.muted }]}>
          {description}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
