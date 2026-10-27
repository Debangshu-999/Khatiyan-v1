const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const spacing = { xs: 4, sm: 8, md: 12, lg: 16 };
const jsx = (type, props) => ({ type, props });

function load(source, dependencies = {}, globals = {}) {
  const exported = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  vm.runInNewContext(outputText, {
    exports: exported,
    require: (name) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return exported;
}

const { themes } = load(read("src/theme/colors.ts"));
const cardSource = ts.createSourceFile("owner-enquiries.tsx", read("app/owner-enquiries.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const cardFunction = cardSource.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "EnquiryCard");
const reasons = cardSource.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(cardSource) === "END_REASONS"));
assert.ok(cardFunction && reasons, "Owner card and its end reasons must exist");

function harness(colors) {
  const useTheme = () => ({ colors, fonts: { sansBold: "bold", sansMedium: "medium", display: "display" }, type: {} });
  const tags = load(read("src/features/enquiry/enquiry-tags.tsx"), {
    "react-native": { Text: "Text", View: "View" },
    "lucide-react-native": { Timer: "Timer" },
    "@/components/skeletons/boundary": { GhostPill: "GhostPill" },
    "@/theme/spacing": { spacing, radii: { card: 16 } },
    "@/theme/use-theme": { useTheme },
  });
  const icons = Object.fromEntries(["CalendarCheck", "CalendarPlus", "CalendarX", "CheckCircle2", "ThumbsDown", "ThumbsUp", "Timer", "User", "UserPlus", "Ellipsis", "Copy", "ShieldAlert"].map((name) => [name, name]));
  const { EnquiryCard } = load(`${reasons.getText(cardSource)}\n${cardFunction.getText(cardSource)}\nexports.EnquiryCard = EnquiryCard;`, {}, {
    ...icons,
    ...tags,
    useTheme,
    spacing,
    Card: "Card",
    View: "View",
    Text: "Text",
    FitText: "Text",
    cardName: require("./shared-text-mocks.cjs")["@/lib/person-name"].cardName,
    EnquiryMessagePreview: "EnquiryMessagePreview",
    ActionButton: "ActionButton",
    ActionLogButton: "ActionLogButton",
    hasLapsed: () => false,
    isNewToday: () => false,
    hasReachedOut: () => false,
    actionLogCount: () => 0,
    formatWhen: () => "today",
    formatExpiryDate: () => "6 Nov",
    formatVisitDay: () => "Tue 7 Oct", formatVisitShort: () => "7 Oct, 10am",
    formatClosesIn: () => "Closes in 7d",
  });

  function statuses(overrides = {}, visit = null) {
    const enquiry = { status: "RESPONDED", enquirerName: "Tenant", message: "An enquiry", createdAt: "2026-10-07", expiresAt: "2026-11-06", sentiment: null, responses: [], ...overrides };
    const tree = EnquiryCard({ enquiry, hasVisit: Boolean(visit), visit });
    const found = [];
    function collect(node) {
      if (Array.isArray(node)) return node.forEach(collect);
      if (!node || typeof node !== "object") return;
      if (node.type === tags.StateChip || node.type === tags.StatusNote) found.push(node);
      collect(node.props?.children);
    }
    collect(tree);
    for (const node of found) {
      // The repeat mark is the one tinted note: its tone's pale fill, and no edge.
      if (node.props.tinted) continue;
      assert.equal(node.props.neutralBackground, true, node.props.label);
      assert.equal(node.type(node.props).props.style.backgroundColor, colors.neutralSoft, node.props.label);
    }
    return found;
  }
  return { tags, statuses };
}

for (const [mode, colors] of Object.entries(themes)) {
  test(`${mode}: bookings can show No requests while existing zero-count queues stay hidden`, () => {
    const { tags } = harness(colors);
    assert.equal(tags.CountPill({ count: 0 }), null);
    for (const [count, label] of [[0, "No requests"], [1, "1 request"], [6, "6 requests"]]) {
      const pill = tags.CountPill({ count, noun: ["request", "requests"], emptyLabel: "No requests" });
      assert.equal(pill.props.style.backgroundColor, colors.primarySoft);
      assert.equal(pill.props.children.props.children, label);
    }
  });
  test(`${mode}: grey badges preserve outcome text/icon colours and other screens keep tinted defaults`, () => {
    const { tags } = harness(colors);
    for (const [tone, text, background] of [["success", colors.successText, colors.successSoft], ["danger", colors.danger, colors.dangerSoft], ["warning", colors.warningText, colors.warningSoft], ["neutral", colors.neutralText, colors.neutralSoft]]) {
      const props = { icon: "Icon", label: "Status", text: null, tone };
      assert.equal(tags.StateChip(props).props.style.backgroundColor, background);
      assert.equal(tags.StatusNote(props).props.style.backgroundColor, background);
      const chip = tags.StateChip({ ...props, neutralBackground: true });
      assert.equal(chip.props.style.backgroundColor, colors.neutralSoft);
      assert.equal(chip.props.children[0].props.color, text);
      assert.equal(chip.props.children[1].props.style.color, text);
      const note = tags.StatusNote({ ...props, neutralBackground: true });
      assert.equal(note.props.style.backgroundColor, colors.neutralSoft);
      assert.equal(note.props.children[0].props.children.props.color, text);
      assert.equal(note.props.children[1].props.style[1].color, text);
    }
  });
}

test("owner sentiment rows are grey with green thumbs-up or red thumbs-down", () => {
  const { statuses } = harness(themes.light);
  const interested = statuses({ sentiment: "INTERESTED" }).find((node) => node.props.label === "Interested");
  assert.equal(interested.props.icon, "ThumbsUp");
  assert.equal(interested.props.tone, "success");
  const negative = statuses({ sentiment: "NOT_INTERESTED", notInterestedClosesAt: "2026-10-14" });
  const notInterested = negative.find((node) => node.props.label === "Not interested");
  assert.equal(notInterested.props.icon, "ThumbsDown");
  assert.equal(notInterested.props.tone, "danger");
  assert.ok(negative.some((node) => node.props.icon === "Timer" && node.props.tone === "danger"));
});

test("scheduled, rescheduled and attended visits have grey surfaces and green outcomes", () => {
  const { statuses } = harness(themes.light);
  for (const visit of [{ state: "SCHEDULED", managementMayChange: true }, { state: "SCHEDULED", rescheduled: true }, { state: "VISITED" }]) {
    const state = statuses({ sentiment: "INTERESTED" }, { date: "2026-10-07", slotStart: "10:00", ...visit }).find((node) => node.props.label.startsWith("Visit"));
    assert.equal(state.props.tone, "success");
  }
});

test("missed/cancelled visits and cancellation notes have grey surfaces and red outcomes", () => {
  const { statuses } = harness(themes.light);
  const missed = statuses({}, { state: "MISSED", date: "2026-10-07", slotStart: "10:00" });
  assert.equal(missed.find((node) => node.props.label.startsWith("Visit missed")).props.tone, "danger");
  const cancelled = statuses({ sentiment: "INTERESTED", cancelledVisit: { reason: "Could not come", byTenant: true } });
  for (const label of ["Visit cancelled", "Cancellation reason"]) {
    assert.equal(cancelled.find((node) => node.props.label === label).props.tone, "danger");
  }
});

test("all expired-card outcomes stay grey and resolve to green or red, not amber", () => {
  const { statuses } = harness(themes.light);
  for (const reason of ["HANDLER_DID_NOT_RESPOND", "TENANT_DID_NOT_RESPOND", "NOT_INTERESTED", "NO_VISIT_BOOKED", "VISIT_CANCELLED", "VISIT_BOOKED", "VISIT_MISSED", "VISITED"]) {
    const [outcome] = statuses({ status: "EXPIRED", endReason: reason });
    assert.equal(outcome.props.tone, ["VISIT_BOOKED", "VISITED"].includes(reason) ? "success" : "danger");
  }
});

test("a person who keeps walking away carries the leads mark and its reason on the card", () => {
  const { statuses } = harness(themes.light);
  assert.equal(statuses().some((node) => ["Duplicate", "Potential spam"].includes(node.props.label)), false);
  const reason = "Has 1 expired lead from this user before, expired due to the user's non interest.";
  const duplicate = statuses({ repeatMark: { flag: "DUPLICATE", earlierLeads: 1, reason } }).find((node) => node.props.label === "Duplicate");
  assert.equal(duplicate.props.text, reason);
  assert.equal(duplicate.props.icon, "Copy");
  assert.equal(duplicate.props.tone, "warning");
  const spam = statuses({ repeatMark: { flag: "POTENTIAL_SPAM", earlierLeads: 3, reason: "Has 3 expired leads" } }).find((node) => node.props.label === "Potential spam");
  assert.equal(spam.props.icon, "ShieldAlert");
  assert.equal(spam.props.tone, "danger");
});
