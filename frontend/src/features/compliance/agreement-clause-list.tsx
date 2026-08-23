import { Text, View, type StyleProp, type TextStyle } from "react-native";
import { Lock, ScrollText } from "lucide-react-native";

import { StatusIcon } from "@/components/status-icon";
import {
  damageCatalogItems,
  deductionCategories,
  deductionLabel,
  earlyExitRule,
  exitPrerequisites,
  rupeesLabel,
  validityMonths,
} from "@/features/compliance/clause-values";
import { PROPERTY_DERIVED_CLAUSE_TYPES, type AgreementClause } from "@/store/services/compliance-api";
import { spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

// Read-only rendering of an agreement's clauses, grouped the way owners and
// tenants should reason about them: money/policy rules locked from the
// property, agreement rules locked for uniformity, then the owner's own prose.
export function AgreementClauseList({ clauses }: { clauses: AgreementClause[] }) {
  const derived = clauses.filter(
    (clause) => clause.kind === "SYSTEM" && clause.systemType != null && PROPERTY_DERIVED_CLAUSE_TYPES.includes(clause.systemType),
  );
  const systemRules = clauses.filter(
    (clause) => clause.kind === "SYSTEM" && (clause.systemType == null || !PROPERTY_DERIVED_CLAUSE_TYPES.includes(clause.systemType)),
  );
  const custom = clauses.filter((clause) => clause.kind === "CUSTOM");

  return (
    <View style={{ gap: spacing.md }}>
      {derived.length > 0 ? <ClauseGroup clauses={derived} locked title="Rent & property policy" /> : null}
      {systemRules.length > 0 ? <ClauseGroup clauses={systemRules} locked title="Agreement rules" /> : null}
      {custom.length > 0 ? <ClauseGroup clauses={custom} title="House rules & other terms" /> : null}
    </View>
  );
}

function ClauseGroup({ clauses, locked, title }: { clauses: AgreementClause[]; locked?: boolean; title: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        {locked ? (
          <Lock color={colors.kicker} size={12} strokeWidth={2.4} />
        ) : (
          <ScrollText color={colors.kicker} size={12} strokeWidth={2.4} />
        )}
        <Text style={[type.eyebrow, { color: colors.kicker }]}>
          {title}
        </Text>
      </View>
      <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderCurve: "continuous", borderRadius: 14, borderWidth: 1, overflow: "hidden" }}>
        {clauses.map((clause, index) => (
          <View key={`${clause.heading}-${index}`}>
            {index > 0 ? <View style={{ backgroundColor: colors.border, height: 1, marginHorizontal: spacing.md, opacity: 0.7 }} /> : null}
            <View style={{ gap: 3, padding: spacing.md }}>
              <Text style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 13.5, }}>
                {clause.heading}
              </Text>
              <ClauseBody clause={clause} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Structured bodies for rules whose values read better as lists or emphasis;
// every other clause renders its plain body sentence.
function ClauseBody({ clause }: { clause: AgreementClause }) {
  const { colors, type } = useTheme();
  const bodyStyle: StyleProp<TextStyle> = [type.body, { color: colors.muted, fontSize: 13, lineHeight: 19 }];

  if (clause.kind === "SYSTEM" && clause.systemType === "ALLOWED_DEDUCTIONS") {
    const labels = deductionCategories(clause).map(deductionLabel);
    if (labels.length > 0) {
      return (
        <Text style={bodyStyle}>
          At move-out the deposit may be used only for{" "}
          {labels.map((label, index) => (
            <Text key={`${label}-${index}`}>
              <Text style={{ color: colors.inkSoft, fontWeight: "800" }}>{label}</Text>
              {index < labels.length - 2 ? ", " : index === labels.length - 2 ? " and " : ""}
            </Text>
          ))}
          .
        </Text>
      );
    }
  }

  // Leaving early is the one term in the agreement that COSTS the tenant money,
  // and it was a trailing sub-clause of a sentence — "…and the tenancy ends with
  // it. If the tenancy ends earlier: one month's rent." Read at signing speed
  // that is the easiest line on the page to skim past, which is the opposite of
  // what an agreement is for. It gets pulled out and marked.
  //
  // Both agreement shapes carry one: a fixed term stores the owner's rule on the
  // clause itself, an indefinite term derives PREMATURE_EXIT from the property.
  // Handling only the first would have highlighted the penalty for some tenants
  // and buried it for the rest.
  if (clause.kind === "SYSTEM" && (clause.systemType === "VALIDITY" || clause.systemType === "LOCK_IN")) {
    const months = validityMonths(clause);
    const rule = earlyExitRule(clause).trim();
    const term =
      months != null
        ? `This agreement runs for ${months} month${months === 1 ? "" : "s"} from the start of the tenancy, and the tenancy ends with it.`
        : clause.body;

    return (
      <View style={{ gap: spacing.sm }}>
        <Text style={bodyStyle}>
          {term}
        </Text>
        {rule ? <PenaltyCallout heading="If you leave early" text={rule} /> : null}
      </View>
    );
  }

  if (clause.kind === "SYSTEM" && clause.systemType === "PREMATURE_EXIT") {
    return <PenaltyCallout heading="If you leave without notice" text={clause.body} />;
  }

  if (clause.kind === "SYSTEM" && clause.systemType === "EXIT_PREREQUISITES") {
    const checklist = exitPrerequisites(clause);
    if (checklist.length > 0) {
      return (
        <View style={{ gap: 4 }}>
          <Text style={bodyStyle}>
            Before the deposit is settled:
          </Text>
          {checklist.map((entry, index) => (
            <BulletRow key={`${entry}-${index}`} text={entry} />
          ))}
        </View>
      );
    }
  }

  if (clause.kind === "SYSTEM" && clause.systemType === "DAMAGE_CATALOG") {
    const items = damageCatalogItems(clause);
    if (items.length > 0) {
      return (
        <View style={{ gap: 4 }}>
          <Text style={bodyStyle}>
            Damage beyond normal wear is charged per this schedule:
          </Text>
          {items.map((item, index) => (
            <BulletRow key={`${item.name}-${index}`} text={`${item.name} — ${rupeesLabel(item.chargePaise)}`} />
          ))}
        </View>
      );
    }
  }

  return (
    <Text style={bodyStyle}>
      {clause.body}
    </Text>
  );
}

/**
 * A term that costs the tenant money, set apart from the clause around it.
 *
 * <p>Warning-toned rather than danger-toned: this is a condition of the
 * agreement they are about to accept, not something that has gone wrong. Danger
 * red on a document a tenant is signing reads as an error in the document.
 */
function PenaltyCallout({ heading, text }: { heading: string; text: string }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.warningSoft,
        borderColor: colors.warning,
        borderCurve: "continuous",
        borderRadius: 12,
        // A left rail rather than a full border: the callout belongs to the
        // clause above it, and a box all the way round detaches it into a
        // notice of its own.
        borderLeftWidth: 4,
        gap: 4,
        padding: spacing.md,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.xs }}>
        <StatusIcon size={15} tone="warning" />
        <Text style={[type.eyebrow, { color: colors.warningText }]}>
          {heading}
        </Text>
      </View>
      <Text selectable style={[type.policy, { color: colors.ink }]}>
        {text}
      </Text>
    </View>
  );
}

function BulletRow({ text }: { text: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: spacing.xs, paddingLeft: spacing.xs }}>
      <Text style={[type.body, { color: colors.kicker, fontSize: 13, lineHeight: 19 }]}>{"•"}</Text>
      <Text style={[type.body, { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 19 }]}>
        {text}
      </Text>
    </View>
  );
}
