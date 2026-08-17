import { Text, View, type StyleProp, type TextStyle } from "react-native";
import { Lock, ScrollText } from "lucide-react-native";

import {
  damageCatalogItems,
  deductionCategories,
  deductionLabel,
  exitPrerequisites,
  rupeesLabel,
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
