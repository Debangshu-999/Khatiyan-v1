import { useState } from "react";
import { Text, View } from "react-native";
import { Check, Eye, Plus, Trash2 } from "lucide-react-native";

import { AnimatedPressable } from "@/components/animated-pressable";
import { SheetShell } from "@/components/sheet-shell";
import { useFormErrors } from "@/features/forms/use-form-errors";
import { ConfirmDialog, FormInput } from "@/features/owner/owner-ui";
import { ClauseBody } from "@/features/compliance/agreement-document";
import {
  MAIN_CLAUSE_LABELS,
  MAIN_CLAUSE_TYPES,
  type AgreementClause,
  type AgreementTemplate,
  type CustomClauseSpec,
  type MainClauseType,
  type MiscClauseOption,
  type MiscClauseType,
} from "@/store/services/compliance-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * Which clauses a deed carries — the one editor behind both the property's
 * template and a pending tenancy's amendment.
 *
 * <p>The list IS the deed's main run, rendered from the assembled preview rather
 * than from a list of clause names. That is what lets a custom clause appear at
 * its real position among the numbered terms, and it means an owner is editing
 * the document they are about to issue rather than a proxy for it.
 *
 * <p>Wording is never editable here, because it is not editable at all. An owner
 * who wants different words drops that clause and writes their own in its
 * position — which is why "remove" and "add a clause" are the same gesture,
 * applied to one list.
 */
export function AgreementTemplateEditor({
  clauses,
  miscOptions,
  onChange,
  onMiscLayout,
  template,
}: {
  /** The assembled main run — MAIN and CUSTOM, in order, already numbered. */
  clauses: AgreementClause[];
  miscOptions: MiscClauseOption[];
  onChange: (next: AgreementTemplate) => void;
  /**
   * Where the miscellaneous section starts, relative to this component.
   *
   * <p>Reported so the screen can tell which half of the list is being read.
   * "Add a clause" writes into the MAIN run, so offering it while somebody is
   * reading the opt-in library would add a clause somewhere they are not
   * looking.
   */
  onMiscLayout?: (y: number) => void;
  template: AgreementTemplate;
}) {
  const dropped = MAIN_CLAUSE_TYPES.filter((type) => template.excludedMainClauses.includes(type));

  // Custom clauses are matched to the assembled run by ORDER, not by heading: two
  // clauses may share a heading, and a position is not unique either once the
  // list clamps. Walking both in sequence is the only mapping that holds.
  let nextCustom = 0;

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ gap: spacing.sm }}>
        <SectionHeading
          description="The terms every agreement here carries. Their wording is fixed — to change what a term says, remove it and add your own in its place."
          title="Main clauses"
        />

        <View style={{ gap: 8 }}>
          {clauses.map((clause, index) => {
            const customIndex = clause.kind === "CUSTOM" ? nextCustom++ : null;
            return (
              <ClauseRow
                clause={clause}
                key={`${clause.kind}-${clause.mainType ?? clause.heading}-${index}`}
                onRemove={() => {
                  if (customIndex != null) {
                    onChange({
                      ...template,
                      customClauses: template.customClauses.filter((_, at) => at !== customIndex),
                    });
                    return;
                  }
                  if (clause.mainType) {
                    onChange({
                      ...template,
                      excludedMainClauses: [...template.excludedMainClauses, clause.mainType],
                    });
                  }
                }}
              />
            );
          })}
        </View>

        {/* Dropped clauses are shown, not hidden. An owner who removed one months
            ago has no other way to discover their deed is missing a term, and a
            clause that vanished silently is indistinguishable from one we never
            wrote. */}
        {dropped.length > 0 ? (
          <View style={{ gap: 8, marginTop: spacing.sm }}>
            <SectionHeading
              description="Removed from this agreement. Add one back at any time."
              small
              title="Available main clauses"
            />
            {dropped.map((type) => (
              <RestoreRow
                key={type}
                label={MAIN_CLAUSE_LABELS[type]}
                onRestore={() =>
                  onChange({
                    ...template,
                    excludedMainClauses: template.excludedMainClauses.filter((item) => item !== type),
                  })
                }
              />
            ))}
          </View>
        ) : null}
      </View>

      <View
        onLayout={(event) => onMiscLayout?.(event.nativeEvent.layout.y)}
        style={{ gap: spacing.sm }}
      >
        <SectionHeading
          description="Optional terms we have written for you. Tick any that apply — they follow the main clauses in their own numbered section."
          title={`Miscellaneous clauses (${miscOptions.length})`}
        />

        <View style={{ gap: 8 }}>
          {miscOptions.map((option) => (
            <MiscRow
              key={option.type}
              onToggle={() =>
                onChange({
                  ...template,
                  miscClauses: template.miscClauses.includes(option.type)
                    ? template.miscClauses.filter((item) => item !== option.type)
                    : [...template.miscClauses, option.type],
                })
              }
              option={option}
              ticked={template.miscClauses.includes(option.type)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * One clause in the run: its number, its heading, and two controls.
 *
 * <p>White-filled and bordered so the list reads as a stack of documents rather
 * than rows of a table. Expand opens the actual wording — an owner deciding
 * whether to keep a term needs to read it, and a heading like "Possession" does
 * not say what the clause commits their tenant to.
 */
function ClauseRow({ clause, onRemove }: { clause: AgreementClause; onRemove: () => void }) {
  const { colors, fonts, type } = useTheme();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isCustom = clause.kind === "CUSTOM";

  return (
    <>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderCurve: "continuous",
          borderRadius: radii.card,
          borderWidth: 1,
          flexDirection: "row",
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
        }}
      >
        <Text style={{ color: colors.kicker, fontFamily: fonts.sansSemiBold, fontSize: 12.5, minWidth: 18 }}>
          {clause.displayOrder}.
        </Text>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
            {clause.heading}
          </Text>
          {clause.kind === "CUSTOM" ? (
            <Text style={[type.caption, { color: colors.kicker }]}>Your clause</Text>
          ) : null}
        </View>

        <AnimatedPressable
          accessibilityLabel={`Read ${clause.heading}`}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setOpen(true)}
          style={{
            alignItems: "center",
            borderColor: colors.borderStrong,
            borderRadius: 999,
            borderWidth: 1,
            height: 30,
            justifyContent: "center",
            width: 30,
          }}
        >
          <Eye color={colors.inkSoft} size={16} strokeWidth={2.2} />
        </AnimatedPressable>

        <AnimatedPressable
          accessibilityLabel={`Remove ${clause.heading}`}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => setConfirming(true)}
          style={{
            alignItems: "center",
            borderColor: colors.borderStrong,
            borderRadius: 999,
            borderWidth: 1,
            height: 30,
            justifyContent: "center",
            width: 30,
          }}
        >
          <Trash2 color={colors.danger} size={15} strokeWidth={2.2} />
        </AnimatedPressable>
      </View>

      {open ? (
        <SheetShell onClose={() => setOpen(false)} title={`${clause.displayOrder}. ${clause.heading}`}>
          <ClauseBody body={clause.body} />
        </SheetShell>
      ) : null}

      {/* Confirmed, not one-tap. Removing a term changes what every tenant here
          signs, and the row's other control is a harmless "read it" a thumb's
          width away. A custom clause is worse still — its words exist nowhere
          else, where a main clause can always be added back. */}
      {confirming ? (
        <ConfirmDialog
          confirmLabel="Remove"
          destructive
          message={
            isCustom
              ? `"${clause.heading}" is your own clause. Removing it deletes its wording — it cannot be added back from the list.`
              : `"${clause.heading}" will not appear in any agreement issued from here. You can add it back at any time from Available main clauses.`
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onRemove();
          }}
          title={isCustom ? "Delete this clause?" : "Remove this clause?"}
        />
      ) : null}
    </>
  );
}

function RestoreRow({ label, onRestore }: { label: string; onRestore: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={{
        alignItems: "center",
        // Same white surface as the clauses above: these ARE those clauses, set
        // aside. A hollow row read as a placeholder for something missing rather
        // than a term waiting to be put back.
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderStyle: "dashed",
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: colors.muted, flex: 1, fontFamily: fonts.sansMedium, fontSize: 13.5 }}>{label}</Text>
      <AnimatedPressable
        accessibilityLabel={`Add ${label} back`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onRestore}
        style={{
          alignItems: "center",
          borderColor: colors.borderStrong,
          borderRadius: 999,
          borderWidth: 1,
          height: 28,
          justifyContent: "center",
          width: 28,
        }}
      >
        <Plus color={colors.ink} size={15} strokeWidth={2.6} />
      </AnimatedPressable>
    </View>
  );
}

/**
 * One clause from the opt-in library.
 *
 * <p>Shows the whole wording, because that is the only thing an owner can
 * sensibly decide on — a heading like "Security" says nothing about what ticking
 * it commits their tenants to.
 */
function MiscRow({
  onToggle,
  option,
  ticked,
}: {
  onToggle: () => void;
  option: MiscClauseOption;
  ticked: boolean;
}) {
  const { colors, fonts, type } = useTheme();

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked }}
      onPress={onToggle}
      style={{
        backgroundColor: colors.surface,
        borderColor: ticked ? colors.jade : colors.border,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: ticked ? 1.5 : 1,
        flexDirection: "row",
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: ticked ? colors.jade : "transparent",
          borderColor: ticked ? colors.jade : colors.borderStrong,
          borderRadius: 6,
          borderWidth: 1.5,
          height: 20,
          justifyContent: "center",
          marginTop: 1,
          width: 20,
        }}
      >
        {ticked ? <Check color="#FFFFFF" size={13} strokeWidth={3} /> : null}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 13.5 }}>
          {option.heading}
        </Text>
        <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>{option.body}</Text>
      </View>
    </AnimatedPressable>
  );
}

/** A section title that carries its own weight, with the reason it exists under it. */
function SectionHeading({
  description,
  small,
  title,
}: {
  description: string;
  small?: boolean;
  title: string;
}) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          color: colors.text,
          fontFamily: small ? fonts.sansBold : fonts.display,
          fontSize: small ? 14 : 17,
          letterSpacing: small ? 0 : -0.2,
        }}
      >
        {title}
      </Text>
      <Text style={[type.caption, { color: colors.muted, lineHeight: 19 }]}>{description}</Text>
    </View>
  );
}

/**
 * Writing a clause of your own.
 *
 * <p>Lives here rather than in the editor's body because the trigger sits on the
 * screen's action row, beside Preview — adding a clause and reading the document
 * are the two things an owner does on this screen.
 */
export function CustomClauseSheet({
  mainCount,
  onClose,
  onSave,
}: {
  mainCount: number;
  onClose: () => void;
  onSave: (spec: CustomClauseSpec) => void;
}) {
  const { colors, fonts, type } = useTheme();
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [position, setPosition] = useState(String(mainCount + 1));

  // Field errors under the field, where the fix is — not one line at the bottom
  // blaming both inputs at once and leaving the reader to work out which.
  const form = useFormErrors<"body" | "heading">();

  const save = () => {
    const found: Partial<Record<"body" | "heading", string>> = {};
    if (!heading.trim()) {
      found.heading = "Give the clause a heading.";
    }
    if (!body.trim()) {
      found.body = "Write the clause's wording.";
    }
    if (!form.validate(found)) {
      return;
    }

    // Number("") is 0, not NaN, so the blank case has to be excluded explicitly.
    const trimmed = position.trim();
    const parsed = trimmed ? Number(trimmed) : Number.NaN;

    onSave({
      body: body.trim(),
      heading: heading.trim(),
      // An unparseable or out-of-range position goes to the end of the main run
      // rather than being refused. The position is a preference; the words the
      // owner just wrote are not, and losing them over a typo would be the wrong
      // trade.
      position: Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : mainCount + 1,
    });
  };

  return (
    <SheetShell onClose={onClose} title="Your clause">
      <View style={{ gap: spacing.md }}>
        {/* No placeholders. An example sentence in the wording field reads as a
            suggestion of what to write, and these are the owner's own legal
            terms — not a field where we should be putting words in their mouth. */}
        <FormInput
          error={form.errors.heading}
          label="Heading"
          onChangeText={(text) => {
            setHeading(text);
            form.clearField("heading");
          }}
          placeholder=""
          required
          value={heading}
        />
        <FormInput
          error={form.errors.body}
          label="Wording"
          multiline
          onChangeText={(text) => {
            setBody(text);
            form.clearField("body");
          }}
          placeholder=""
          required
          value={body}
        />
        <FormInput
          keyboardType="number-pad"
          label={`Position (1 to ${mainCount + 1})`}
          onChangeText={setPosition}
          placeholder={String(mainCount + 1)}
          value={position}
        />
        <View style={{ gap: 2 }}>
          <Text style={{ color: colors.ink, fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
            Adds to the main clause list.
          </Text>
          <Text style={[type.caption, { color: colors.muted, lineHeight: 18 }]}>
            The clause takes this number as its position and pushes the rest down. Past the end, it goes last.
          </Text>
        </View>
        {/* Blocked until every blamed field is corrected, so the same invalid
            clause cannot be submitted twice. */}
        <AnimatedPressable
          accessibilityRole="button"
          disabled={form.blocked}
          onPress={save}
          style={{
            alignItems: "center",
            backgroundColor: form.blocked ? colors.surfaceSunken : colors.ink,
            borderCurve: "continuous",
            borderRadius: 14,
            paddingVertical: spacing.md,
          }}
        >
          <Text
            style={{
              color: form.blocked ? colors.kicker : colors.surface,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Save clause
          </Text>
        </AnimatedPressable>
      </View>
    </SheetShell>
  );
}
