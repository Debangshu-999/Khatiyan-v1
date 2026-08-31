import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, FileSignature, Plus, X } from "lucide-react-native";

import { useGuardedRouter } from "@/navigation/use-guarded-router";
import { AnimatedPressable } from "@/components/animated-pressable";
import { EmptyState } from "@/components/empty-state";
import { PINNED_FOOTER_CLEARANCE, PinnedFooter } from "@/components/pinned-footer";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenScrollView } from "@/components/screen-scroll-view";
import { Section } from "@/components/section";
import { SegmentedChoice } from "@/components/segmented-choice";
import { SkeletonCard, SkeletonList } from "@/components/skeleton";
import { AlertModal } from "@/components/alert-modal";
import { errorMessage } from "@/features/forms/server-error";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { useToast } from "@/components/toast";
import { useAvailableAccounts } from "@/features/account/accounts";
import { AgreementDocument } from "@/features/compliance/agreement-document";
import {
  AgreementTemplateEditor,
  CustomClauseSheet,
} from "@/features/compliance/agreement-template-editor";
import { usePropertyPermissions } from "@/features/owner/use-property-permissions";
import { ActionButton, FormInput, ViewOnlyChip } from "@/features/owner/owner-ui";
import { useAppSelector } from "@/store/hooks";
import {
  useGetPropertyAgreementSettingsQuery,
  useListMiscClausesQuery,
  usePreviewTenancyAgreementQuery,
  useUpdatePropertyAgreementSettingsMutation,
  type AgreementTemplate,
} from "@/store/services/compliance-api";
import {
  useGetPropertyExitPoliciesQuery,
  useUpdatePrematureExitPolicyMutation,
} from "@/store/services/property-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const MAX_VALIDITY_MONTHS = 12;

/**
 * The property's agreement template: which clauses every deed here carries.
 *
 * <p>Rebuilt around the deed. This screen used to be a stack of per-clause
 * editors, because the agreement was a bag of settings. It is a document now: the
 * owner edits the numbered run directly, reads any clause in place, and opens the
 * whole thing behind Preview.
 *
 * <p>Both halves of "how does this tenancy end" live here — the term, and what
 * leaving early costs under each shape. The premature-exit policy used to sit on
 * the exit-policies screen, which split one rule across two places.
 */
export default function OwnerTenancyAgreementScreen() {
  const router = useGuardedRouter();
  const { colors, fonts, type } = useTheme();
  const toast = useToast();
  const saveErrors = useFormErrors<never>();

  const selectedPropertyId = useAppSelector((state) => state.ownerWorkspace.selectedPropertyId);
  const { managedProperties, ownedProperties } = useAvailableAccounts();
  const property = [...ownedProperties, ...managedProperties].find((item) => item.id === selectedPropertyId) ?? null;
  const propertyId = property?.id ?? "";

  const { canManage } = usePropertyPermissions(propertyId);
  const readOnly = !canManage("TENANCY_RULES");

  const settingsQuery = useGetPropertyAgreementSettingsQuery(propertyId, { skip: !propertyId });
  const policiesQuery = useGetPropertyExitPoliciesQuery(propertyId, { skip: !propertyId });
  const miscQuery = useListMiscClausesQuery();
  const [save, saveState] = useUpdatePropertyAgreementSettingsMutation();
  const [savePolicy] = useUpdatePrematureExitPolicyMutation();

  // A local draft, seeded once per property. Editing writes here; Save sends it.
  // Re-seeding on every query result would throw away the owner's edits each
  // time the cache refreshed underneath them.
  const [draft, setDraft] = useState<AgreementTemplate | null>(null);
  const [monthsText, setMonthsText] = useState("");
  const [prematureExit, setPrematureExit] = useState("");

  useEffect(() => {
    const stored = settingsQuery.data?.template;
    if (!stored) {
      return;
    }
    setDraft(stored);
    setMonthsText(stored.defaultValidityMonths != null ? String(stored.defaultValidityMonths) : "");
  }, [settingsQuery.data?.propertyId]);

  useEffect(() => {
    setPrematureExit(policiesQuery.data?.prematureExitPolicy ?? "");
  }, [policiesQuery.data?.prematureExitPolicy]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Measured, not guessed. PINNED_FOOTER_CLEARANCE is sized for a single button;
  // this footer carries an action row above the save, so a literal would drift
  // from the real height the first time either row changed.
  const [footerHeight, setFooterHeight] = useState(0);

  // "Add a clause" writes into the MAIN run, so it is blocked once the reader has
  // scrolled into the miscellaneous library — adding from there would drop a
  // clause into a part of the list they are not looking at.
  //
  // Two measurements because layout is nested: the editor's offset within the
  // scrolling content, and the misc section's offset within the editor.
  const [scrollY, setScrollY] = useState(0);
  const [editorY, setEditorY] = useState(0);
  const [miscY, setMiscY] = useState(0);

  // The threshold is the top of the viewport plus a margin, so the button turns
  // off as the misc heading arrives rather than only once it fills the screen.
  const miscTop = editorY + miscY;
  const inMiscSection = miscTop > 0 && scrollY + 140 >= miscTop;

  const fixedTerm = draft?.defaultValidityMonths != null;

  // Previews the DRAFT, not the saved template — the clause list below IS this
  // preview, so an edit that did not show up until Save would leave the owner
  // editing a list that disagreed with what they had just done.
  const previewQuery = usePreviewTenancyAgreementQuery(
    { propertyId, template: draft, templateOnly: true },
    { skip: !propertyId || !draft },
  );

  const mainRun = (previewQuery.data?.clauses ?? []).filter((clause) => clause.kind !== "MISC");

  const onSave = async () => {
    if (!draft || !propertyId) {
      return;
    }
    try {
      await save({ propertyId, template: draft }).unwrap();
      // Two writes because they live in two modules: the clause template is
      // compliance's, the premature-exit policy is the property's. They are one
      // decision to an owner, so they save together.
      await savePolicy({ prematureExitPolicy: prematureExit.trim(), propertyId }).unwrap();
      toast.success("Agreement saved");
    } catch (error) {
      saveErrors.failFromServer(errorMessage(error));
    }
  };

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScreenScrollView
        // The measured height clears the footer exactly, which leaves the last
        // card flush against its top edge and reading as clipped. The extra gap
        // is the breathing room the fade used to provide before this footer went
        // opaque.
        contentContainerStyle={{
          paddingBottom: (footerHeight || PINNED_FOOTER_CLEARANCE) + spacing.xl,
          paddingTop: 0,
        }}
        onScroll={(event) => setScrollY(event.nativeEvent.contentOffset.y)}
        safeAreaEdges={["top"]}
      >
        <ScreenHeader
          badge={readOnly ? <ViewOnlyChip /> : null}
          eyebrow="Tenancy"
          italicTail="agreement."
          onBack={() => router.back()}
          subtitle={
            property
              ? `Every monthly tenancy at ${property.name} runs on these terms. The tenant accepts them before the stay begins.`
              : "Select a property from Home to manage its agreement."
          }
          title="Tenancy"
        />

        {!property ? (
          <EmptyState
            description="Choose an active property from Home before managing its tenancy agreement."
            icon={FileSignature}
            title="No property selected"
          />
        ) : settingsQuery.isLoading || draft === null ? (
          <>
            <SkeletonCard />
            <SkeletonList />
          </>
        ) : (
          <>
            <Section title="Agreement Term">
              <View style={{ gap: spacing.md }}>
                <Text style={[type.caption, { color: colors.muted, lineHeight: 19 }]}>
                  How long a new tenancy's agreement runs, and what ending it early costs. Onboarding can vary
                  this for one stay.
                </Text>

                <SegmentedChoice
                  disabled={readOnly}
                  onChange={(value) =>
                    setDraft({
                      ...draft,
                      defaultValidityMonths: value === "FIXED" ? Number(monthsText) || 11 : null,
                    })
                  }
                  options={[
                    { label: "Indefinite", value: "INDEFINITE" },
                    { label: "Fixed term", value: "FIXED" },
                  ]}
                  value={fixedTerm ? "FIXED" : "INDEFINITE"}
                />

                {/* Near full-bleed. The screen pads its content by spacing.lg,
                    which is pulled back here so the card sits close to the device
                    edges — with an almost-square radius it reads as a band the
                    toggle opened, rather than a floating card in a column of
                    other cards. */}
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: 4,
                    borderWidth: 1,
                    gap: spacing.md,
                    marginHorizontal: -(spacing.lg - 4),
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.md,
                  }}
                >
                  {fixedTerm ? (
                    <>
                      <FormInput
                        disabled={readOnly}
                        keyboardType="number-pad"
                        label={`Months (1 to ${MAX_VALIDITY_MONTHS})`}
                        onChangeText={(text) => {
                          setMonthsText(text);
                          const parsed = text.trim() ? Number(text.trim()) : Number.NaN;
                          setDraft({
                            ...draft,
                            defaultValidityMonths:
                              Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_VALIDITY_MONTHS
                                ? Math.floor(parsed)
                                : draft.defaultValidityMonths,
                          });
                        }}
                        placeholder="11"
                        value={monthsText}
                      />
                      <FormInput
                        disabled={readOnly}
                        label="If the tenant leaves before the term ends"
                        multiline
                        onChangeText={(text) => setDraft({ ...draft, defaultEarlyExitRule: text })}
                        placeholder="One month's rent, deducted from the deposit"
                        value={draft.defaultEarlyExitRule}
                      />
                    </>
                  ) : (
                    // The other half of the same rule. It used to live on the
                    // exit-policies screen, which meant an owner set "how long" in
                    // one place and "what if they just go" in another.
                    <FormInput
                      disabled={readOnly}
                      label="If the tenant leaves without serving notice"
                      multiline
                      onChangeText={setPrematureExit}
                      placeholder="One month's rent, deducted from the deposit"
                      value={prematureExit}
                    />
                  )}
                </View>

                <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
                  Your own words, applied by a person at move-out — never charged automatically.
                </Text>
              </View>
            </Section>

            {/* Headed, but the heading is NOT a Section wrapper — the editor's
                own children are measured (setEditorY, setMiscY) and nesting them
                one level deeper would offset every reading. So the title sits
                above as its own block and the editor stays where the layout
                chain can find it. */}
            <Section title="Clauses" />

            <View onLayout={(event) => setEditorY(event.nativeEvent.layout.y)}>
              <AgreementTemplateEditor
                clauses={mainRun}
                miscOptions={miscQuery.data ?? []}
                onChange={setDraft}
                onMiscLayout={setMiscY}
                template={draft}
              />
            </View>
          </>
        )}
      </ScreenScrollView>

      {/* Add and Preview ride ABOVE Save, in the same footer. All three are
          actions on the whole document rather than on any one section, so they
          stay reachable however far down the clause list the owner has scrolled.
          Add sits left of Preview: writing a clause is what this screen is for,
          reading the document is the check afterwards. */}
      {property && draft ? (
        <PinnedFooter onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)} solid>
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {!readOnly ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: inMiscSection }}
                  disabled={inMiscSection}
                  onPress={() => setAddOpen(true)}
                  style={{
                    alignItems: "center",
                    backgroundColor: inMiscSection ? colors.surfaceSunken : colors.primary,
                    borderCurve: "continuous",
                    borderRadius: 12,
                    flex: 1,
                    flexDirection: "row",
                    gap: spacing.xs,
                    justifyContent: "center",
                    paddingVertical: spacing.md,
                  }}
                >
                  <Plus
                    color={inMiscSection ? colors.kicker : colors.onPrimary}
                    size={17}
                    strokeWidth={2.6}
                  />
                  <Text
                    style={{
                      color: inMiscSection ? colors.kicker : colors.onPrimary,
                      fontFamily: fonts.sansSemiBold,
                      fontSize: 14,
                    }}
                  >
                    Add a clause
                  </Text>
                </AnimatedPressable>
              ) : null}

              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => setPreviewOpen(true)}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surface,
                  borderColor: colors.borderStrong,
                  borderCurve: "continuous",
                  borderRadius: 12,
                  borderWidth: 1.5,
                  flex: 1,
                  flexDirection: "row",
                  gap: spacing.xs,
                  justifyContent: "center",
                  paddingVertical: spacing.md,
                }}
              >
                <Eye color={colors.ink} size={17} strokeWidth={2.2} />
                <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>Preview</Text>
              </AnimatedPressable>
            </View>

            {!readOnly ? (
              <ActionButton disabled={saveState.isLoading} label="Save agreement" onPress={onSave} />
            ) : null}
          </View>
        </PinnedFooter>
      ) : null}

      {/* statusBarTranslucent + navigationBarTranslucent so the scrim reaches
          under the system bars on Android; without them the dim stops short and
          the modal reads as a floating panel. */}
      {previewOpen && previewQuery.data ? (
        <Modal
          animationType="slide"
          navigationBarTranslucent
          onRequestClose={() => setPreviewOpen(false)}
          statusBarTranslucent
          visible
        >
          <SafeAreaView style={{ backgroundColor: colors.background, flex: 1 }}>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: spacing.sm,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
            >
              <Text style={{ color: colors.text, flex: 1, fontFamily: fonts.display, fontSize: 18 }}>
                Agreement preview
              </Text>
              <AnimatedPressable
                accessibilityLabel="Close preview"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setPreviewOpen(false)}
                style={{
                  alignItems: "center",
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 999,
                  height: 32,
                  justifyContent: "center",
                  width: 32,
                }}
              >
                <X color={colors.inkSoft} size={17} strokeWidth={2.6} />
              </AnimatedPressable>
            </View>

            <ScreenScrollView contentContainerStyle={{ paddingTop: 0 }}>
              <AgreementDocument
                clauses={previewQuery.data.clauses}
                preamble={previewQuery.data.preamble}
              />
            </ScreenScrollView>
          </SafeAreaView>
        </Modal>
      ) : null}

      {addOpen && draft ? (
        <CustomClauseSheet
          mainCount={mainRun.length}
          onClose={() => setAddOpen(false)}
          onSave={(spec) => {
            setDraft({ ...draft, customClauses: [...draft.customClauses, spec] });
            setAddOpen(false);
          }}
        />
      ) : null}

      {saveErrors.serverError ? (
        <AlertModal message={saveErrors.serverError} onClose={saveErrors.dismissServerError} />
      ) : null}
    </View>
  );
}
