import { Fragment } from "react";
import { Text, View } from "react-native";

import type {
  AgreementClause,
  AgreementPreamble,
  ClauseParagraph,
  ClauseSegment,
  PartyBlock,
} from "@/store/services/compliance-api";
import { radii, spacing } from "@/theme/spacing";
import { useTheme } from "@/theme/use-theme";

/**
 * The deed, rendered as a document.
 *
 * <p>Replaced three grouped cards — "Rent & property policy", "Agreement rules",
 * "House rules & other terms" — which read as a settings summary. A person
 * signing something wants to see the thing they are signing: a title, two named
 * parties, a recital saying which room, and numbered clauses.
 *
 * <p>No cards, no group headings, no lock icons, and no warning callout on the
 * early-exit clause. A warning box inside a legal document reads as an error in
 * the document; the early-exit term is a clause and reads as one.
 *
 * <h2>Set in the serif</h2>
 *
 * <p>`fonts.brand` — which the theme describes as "the ledger / property-deed
 * voice" and otherwise restricts to screen headers and brand moments. A deed is
 * the one surface where that description is literal rather than a metaphor, and
 * setting it in the product sans made it read as another settings screen.
 *
 * <p>Weight is applied with `fontWeight` rather than a bolder family, which is
 * the opposite of the rule everywhere else in this app: the brand face is a
 * SYSTEM serif (Georgia / Noto Serif), not a loaded one, so it has real weights
 * to synthesise from and no second family to point at.
 */
export function AgreementDocument({
  acceptedAt,
  clauses,
  preamble,
}: {
  /** Rendered in place of the execution-date placeholder once signed. */
  acceptedAt?: string | null;
  clauses: AgreementClause[];
  preamble?: AgreementPreamble | null;
}) {
  const { colors } = useTheme();

  const main = clauses.filter((clause) => clause.kind !== "MISC");
  const misc = clauses.filter((clause) => clause.kind === "MISC");

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: spacing.lg,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.xl,
      }}
    >
      {preamble ? <Preamble acceptedAt={acceptedAt} preamble={preamble} /> : null}

      <View style={{ gap: spacing.lg }}>
        {main.map((clause, index) => (
          <Clause clause={clause} key={`main-${clause.mainType ?? clause.heading}-${index}`} />
        ))}
      </View>

      {/* Their own section, numbered from 1 again — these are options the owner
          added on top, not terms the agreement is built from. */}
      {misc.length > 0 ? (
        <View style={{ gap: spacing.lg }}>
          {/* Trailing colon: this heading introduces the list under it, where
              BETWEEN and AND name a party and end there. */}
          <SectionHeading align="left" text="Miscellaneous Clauses:" />
          {misc.map((clause, index) => (
            <Clause clause={clause} key={`misc-${clause.miscType ?? clause.heading}-${index}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Preamble({ acceptedAt, preamble }: { acceptedAt?: string | null; preamble: AgreementPreamble }) {
  const { colors, fonts } = useTheme();

  return (
    <View style={{ gap: spacing.lg }}>
      <Text
        style={{
          color: colors.text,
          fontFamily: fonts.brand,
          fontSize: 21,
          fontWeight: "700",
          letterSpacing: 0.3,
          lineHeight: 30,
          textAlign: "center",
          textDecorationLine: "underline",
        }}
      >
        {preamble.title}
      </Text>

      {preamble.execution.map((paragraph, index) => (
        <Paragraph
          acceptedAt={acceptedAt}
          align="center"
          key={`execution-${index}`}
          paragraph={paragraph}
        />
      ))}

      <Party block={preamble.landlord} />
      <Party block={preamble.tenant} />

      <View style={{ gap: spacing.md }}>
        {preamble.recitals.map((paragraph, index) => (
          <Paragraph key={`recital-${index}`} paragraph={paragraph} />
        ))}
      </View>
    </View>
  );
}

function Party({ block }: { block: PartyBlock }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeading text={block.heading} />
      {block.body.map((paragraph, index) => (
        <Paragraph key={`${block.role}-${index}`} paragraph={paragraph} />
      ))}
    </View>
  );
}

function Clause({ clause }: { clause: AgreementClause }) {
  const { colors, fonts } = useTheme();

  return (
    // Inset from the recitals above, as the reference deed is: the numbered
    // terms are a list inside the document, not more of its prose, and running
    // them to the same margin loses that distinction.
    <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.sm }}>
      {/* A fixed-width gutter so every clause body starts on the same margin,
          rather than shifting once the numbering reaches double digits. */}
      <Text
        style={{
          color: colors.text,
          fontFamily: fonts.brand,
          fontSize: 14,
          fontWeight: "700",
          lineHeight: 23,
          minWidth: 22,
        }}
      >
        {clause.displayOrder}.
      </Text>

      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text
          style={{
            color: colors.text,
            fontFamily: fonts.brand,
            fontSize: 14,
            fontWeight: "700",
            lineHeight: 23,
          }}
        >
          {clause.heading}
        </Text>
        <ClauseBody body={clause.body} />
      </View>
    </View>
  );
}

/**
 * A clause's paragraphs, without its number or heading.
 *
 * <p>Exported so the template editor's "read this clause" sheet renders the same
 * text, set the same way. A second renderer for the same words would eventually
 * disagree with this one about a bullet or an emphasis, and the sheet exists
 * precisely so an owner can read what the deed will say.
 */
export function ClauseBody({ body }: { body: ClauseParagraph[] }) {
  return (
    <View style={{ gap: spacing.xs }}>
      {body.map((paragraph, index) => (
        <Paragraph key={index} paragraph={paragraph} />
      ))}
    </View>
  );
}

/**
 * BETWEEN, AND, Miscellaneous Clauses.
 *
 * <p>The party markers are centred, as a deed sets them — they introduce the two
 * sides and sit apart from the prose. The miscellaneous heading is left-aligned,
 * because it labels the run of numbered clauses beneath it and belongs on the
 * same margin they do.
 */
function SectionHeading({ align = "center", text }: { align?: "center" | "left"; text: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text
      style={{
        color: colors.text,
        fontFamily: fonts.brand,
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 1.1,
        textAlign: align,
        textTransform: "uppercase",
      }}
    >
      {text}
    </Text>
  );
}

function Paragraph({
  acceptedAt,
  align,
  paragraph,
}: {
  acceptedAt?: string | null;
  align?: "center";
  paragraph: ClauseParagraph;
}) {
  const { colors, fonts } = useTheme();

  const body = (
    <Text
      style={{
        color: colors.ink,
        fontFamily: fonts.brand,
        fontSize: 14,
        lineHeight: 23,
        // Justified like a printed deed. Android only honours this from API 26;
        // below that it falls back to left, which is the right degradation.
        textAlign: align ?? "justify",
      }}
    >
      {paragraph.segments.map((segment, index) => (
        <Segment acceptedAt={acceptedAt} key={index} segment={segment} />
      ))}
    </Text>
  );

  if (!paragraph.bullet) {
    return body;
  }

  return (
    <View style={{ flexDirection: "row", gap: spacing.xs, paddingLeft: spacing.sm }}>
      <Text style={{ color: colors.kicker, fontFamily: fonts.brand, fontSize: 14, lineHeight: 23 }}>{"•"}</Text>
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  );
}

/**
 * One run of text.
 *
 * <p>`VALUE` is semibold: a reader scanning for the rent or the dates finds them
 * without reading the sentence. `PLACEHOLDER` adds an underline, because it names
 * a value rather than stating one — the way a printed form shows a line to be
 * completed. Nothing is coloured; an accent on a legal document reads as a link.
 */
function Segment({ acceptedAt, segment }: { acceptedAt?: string | null; segment: ClauseSegment }) {
  const { colors, fonts } = useTheme();

  // The execution date is the one placeholder a signed deed can fill, and it is
  // filled HERE rather than server-side: writing it into the stored preamble
  // would move the content hash at the exact instant of signing.
  if (segment.style === "PLACEHOLDER" && segment.text === "Execution Date" && acceptedAt) {
    return (
      <Text style={{ color: colors.text, fontFamily: fonts.brand, fontWeight: "700" }}>
        {formatExecutionDate(acceptedAt)}
      </Text>
    );
  }

  if (segment.style === "PLAIN") {
    return <Fragment>{segment.text}</Fragment>;
  }

  return (
    <Text
      style={{
        color: colors.text,
        fontFamily: fonts.brand,
        fontWeight: "700",
        textDecorationLine: segment.style === "PLACEHOLDER" ? "underline" : "none",
      }}
    >
      {segment.text}
    </Text>
  );
}

function formatExecutionDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  });
}
