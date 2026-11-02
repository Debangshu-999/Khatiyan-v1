import type { ReactNode } from "react";
import { Text, View } from "react-native";
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck2,
  Info,
  ShieldCheck,
  ShieldX,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";

import { LoadFailedCard } from "@/components/load-failed";
import { FlatCard } from "@/components/field-card";
import { FitText } from "@/components/fit-text";
import { Section } from "@/components/section";
import { cardName } from "@/lib/person-name";
import {
  useGetTenantIdentityChecksQuery,
  type TenantManualCheck,
} from "@/store/services/compliance-api";
import type { VerificationGrant, VerificationServiceCode } from "@/store/services/verification-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

const CHECK_NAMES: Record<VerificationServiceCode, string> = {
  AADHAAR: "Aadhaar App e-KYC",
  AADHAAR_OKYC: "Aadhaar OTP e-KYC",
};

const DOCUMENT_NAMES: Record<string, string> = {
  AADHAAR: "Aadhaar",
  DRIVING_LICENCE: "Driving licence",
  OTHER: "Other ID",
  PAN: "PAN",
  PASSPORT: "Passport",
  VOTER_ID: "Voter ID",
};

const GENDER_NAMES: Record<string, string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Other",
  TRANSGENDER: "Transgender",
};

type Tone = "good" | "bad" | "waiting" | "neutral";
type Outcome = "passed" | "failed" | "noted";
type Fact = { label: string; outcome: Outcome; value: string };

/**
 * How this tenant was verified, read from the record (user, 2026-10-31): each
 * e-KYC check with what it established, the manual ID check with who made it,
 * the declaration carried over from before Khatiyan, or plainly that nobody
 * verified them. A failed read says it failed: it must never read as "Not verified".
 */
export function TenantVerificationSection({ tenancyId }: { tenancyId: string }) {
  const query = useGetTenantIdentityChecksQuery(tenancyId, {
    refetchOnMountOrArgChange: true,
    skip: !tenancyId,
  });
  const checks = query.data;
  const nothingOnRecord =
    checks && checks.ekycChecks.length === 0 && !checks.manualCheck && !checks.verifiedBeforeKhatiyan;

  return (
    <View style={{ gap: spacing.sm }}>
      <Section title="Tenant verification" />
      {!checks && query.isError ? <LoadFailedCard error={query.error} onReload={() => void query.refetch()} /> : null}
      {!checks && !query.isError ? (
        <CheckCard icon={Clock3} subtitle="Reading the record." title="Loading" tone="neutral" />
      ) : null}
      {checks?.ekycChecks.map((check) => <EkycCard check={check} key={check.id} />)}
      {checks?.manualCheck ? <ManualCard check={checks.manualCheck} /> : null}
      {checks?.verifiedBeforeKhatiyan ? (
        <CheckCard
          icon={FileCheck2}
          subtitle="Declared at onboarding. No check ran in the app."
          title="Verified before Khatiyan"
          tone="neutral"
        />
      ) : null}
      {nothingOnRecord ? (
        <CheckCard
          icon={ShieldX}
          subtitle="No identity check is on record for this stay."
          title="Not verified"
          tone="bad"
        />
      ) : null}
    </View>
  );
}

function EkycCard({ check }: { check: VerificationGrant }) {
  const name = CHECK_NAMES[check.serviceCode] ?? "e-KYC";

  if (check.status !== "VERIFIED") {
    const outOfAttempts = check.status === "EXHAUSTED";
    return (
      <CheckCard
        icon={outOfAttempts ? ShieldX : Clock3}
        subtitle={outOfAttempts ? "Not verified. The tenant used every attempt." : "Pending. Waiting for the tenant to finish this check."}
        title={name}
        tone={outOfAttempts ? "bad" : "waiting"}
      >
        <AttemptsMeter granted={check.attemptsGranted} remaining={check.attemptsRemaining} />
      </CheckCard>
    );
  }

  const facts: Fact[] = [];
  if (check.nameMatched !== null) {
    facts.push({ label: "Name match", outcome: check.nameMatched ? "passed" : "failed", value: check.nameMatched ? "Matched" : "Did not match" });
  }
  if (check.faceMatched !== null) {
    facts.push({ label: "Face check", outcome: check.faceMatched ? "passed" : "failed", value: check.faceMatched ? "Passed" : "Failed" });
  }
  if (check.adultAtVerification !== null) {
    facts.push({ label: "Age check", outcome: check.adultAtVerification ? "passed" : "failed", value: check.adultAtVerification ? "18 or older" : "Under 18" });
  }
  if (check.verifiedGender) {
    facts.push({ label: "Gender", outcome: "passed", value: GENDER_NAMES[check.verifiedGender] ?? "-" });
  }
  // Not a failure: people register with a work phone, an old SIM, a spouse's number.
  if (check.phoneMatched !== null) {
    facts.push({ label: "Aadhaar mobile", outcome: check.phoneMatched ? "passed" : "noted", value: check.phoneMatched ? "Same as their phone" : "Different number" });
  }

  return (
    <CheckCard
      icon={ShieldCheck}
      subtitle={`Verified on ${formatInstant(check.verifiedAt)}`}
      title={name}
      tone="good"
    >
      <IdentityPanel
        rows={[
          { icon: UserRound, label: "Name on Aadhaar", value: check.verifiedName ?? "-" },
          { icon: CreditCard, label: "Aadhaar number", value: check.maskedIdLastFour ? `Ending ${check.maskedIdLastFour}` : "-" },
        ]}
      />
      <FactList facts={facts} />
    </CheckCard>
  );
}

function ManualCard({ check }: { check: TenantManualCheck }) {
  const facts: Fact[] = [];
  if (check.ageChecked) {
    facts.push({ label: "Age check", outcome: "passed", value: "18 or older" });
  }
  if (check.gender) {
    facts.push({ label: "Gender", outcome: "passed", value: GENDER_NAMES[check.gender] ?? "-" });
  }

  return (
    <CheckCard
      icon={BadgeCheck}
      subtitle={`Checked on ${formatInstant(check.checkedAt)}`}
      title="Manual ID check"
      tone="good"
    >
      <IdentityPanel
        rows={[
          {
            icon: CreditCard,
            label: (check.documentType && DOCUMENT_NAMES[check.documentType]) || "Document",
            value: check.lastFour ? `Ending ${check.lastFour}` : "-",
          },
          { icon: UserRound, label: "Checked by", value: check.checkedByName ? cardName(check.checkedByName) : "-" },
        ]}
      />
      <FactList facts={facts} />
    </CheckCard>
  );
}

/** One way of verifying: a status disc, what it was and when, then whatever it established. */
function CheckCard({
  children,
  icon: Icon,
  subtitle,
  title,
  tone,
}: {
  children?: ReactNode;
  icon: LucideIcon;
  subtitle: string;
  title: string;
  tone: Tone;
}) {
  const { colors, fonts, type } = useTheme();
  const discColor = { bad: colors.danger, good: colors.jadeDeep, neutral: colors.muted, waiting: colors.warning }[tone];

  return (
    <FlatCard>
      <View style={{ gap: spacing.md, padding: spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          {/* A status mark, so a filled disc with a white glyph. */}
          <View
            style={{
              alignItems: "center",
              backgroundColor: discColor,
              borderRadius: 999,
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <Icon color={colors.surface} size={20} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 15 }}>
              {title}
            </FitText>
            <Text style={[type.caption, { color: colors.muted }]}>{subtitle}</Text>
          </View>
        </View>
        {children}
      </View>
    </FlatCard>
  );
}

/** Which identity this check is about, on a grey panel so it reads apart from the results. */
function IdentityPanel({ rows }: { rows: { icon: LucideIcon; label: string; value: string }[] }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSunken,
        borderCurve: "continuous",
        borderRadius: radii.card,
        gap: spacing.sm,
        padding: 12,
      }}
    >
      {rows.map(({ icon: Icon, label, value }) => (
        <View key={label} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
          <Icon color={colors.muted} size={16} strokeWidth={2.2} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[type.caption, { color: colors.muted }]}>{label}</Text>
            <FitText numberOfLines={1} style={{ color: colors.ink, fontFamily: fonts.sansBold, fontSize: 14 }}>
              {value}
            </FitText>
          </View>
        </View>
      ))}
    </View>
  );
}

/** What the check established, one result to a line. */
function FactList({ facts }: { facts: Fact[] }) {
  const { colors, fonts, type } = useTheme();
  if (facts.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {facts.map(({ label, outcome, value }) => {
        const Mark = outcome === "passed" ? CheckCircle2 : outcome === "failed" ? XCircle : Info;
        const markColor = outcome === "passed" ? colors.jadeDeep : outcome === "failed" ? colors.danger : colors.muted;
        return (
          <View key={label} style={{ alignItems: "center", flexDirection: "row", gap: spacing.sm }}>
            <Mark color={markColor} size={16} strokeWidth={2.2} />
            <Text style={[type.body, { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 18 }]}>{label}</Text>
            <Text style={{ color: outcome === "failed" ? colors.danger : colors.ink, fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 18 }}>
              {value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** One segment per attempt given, filled while it is still left to use. */
function AttemptsMeter({ granted, remaining }: { granted: number; remaining: number }) {
  const { colors, fonts, type } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={[type.caption, { color: colors.muted }]}>Attempts left</Text>
        <Text style={{ color: remaining === 0 ? colors.danger : colors.ink, fontFamily: fonts.sansBold, fontSize: 13 }}>
          {`${remaining} of ${granted}`}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: granted }, (_, index) => (
          <View
            key={index}
            style={{
              backgroundColor: index < remaining ? colors.warning : colors.surfaceSunken,
              borderRadius: 999,
              flex: 1,
              height: 6,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** The day it happened in India, whatever the phone's own zone. */
function formatInstant(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date(value));
}
