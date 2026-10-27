const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function load(source) {
  const exported = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  vm.runInNewContext(outputText, {
    exports: exported,
    require: (name) => { throw new Error(`Unexpected dependency: ${name}`); },
    Date,
    Intl,
  });
  return exported;
}

const raw = load(read("src/features/lead/lead-display.ts"));
// Values made in the module's own context are compared as plain data.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const display = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, typeof value === "function" ? (...args) => plain(value(...args)) : plain(value)]));

function lead(overrides = {}) {
  return {
    id: "lead-1", referenceCode: "LEAD-2026-000128", propertyId: "p", prospectUserId: "u", prospectName: "Aarav Sharma",
    enquiryId: "e", kind: "ADVANCED_LEAD", stage: "ADVANCED_LEAD", state: "OPEN", closeReason: null, closedAt: null,
    handlerUserId: "h", handlerName: "Debangshu Das", handlerAssignedBy: "FIRST_RESPONSE", handlerAssignedAt: null,
    enquiredAt: "2026-09-25T03:40:00Z", respondedAt: null, becameLeadAt: null, earlyLeadAt: null, advancedLeadAt: null,
    bookedAt: null, movedInAt: null, convertedTenancyId: null, resumed: false, resumedFrom: null, reopenedAt: null,
    repeat: null, goingCold: null,
    visit: { id: "v", referenceCode: "VIS-1", enquiryId: "e", visitDate: "2026-09-30", slotStartMinute: 960, slotEndMinute: 990, status: "VISITED", checkedInAt: "2026-09-30T11:00:00Z", stillInterestedUntil: null },
    booking: null, bookingWindowEndsAt: "2026-10-15T06:00:00Z", followUpEnquiryId: "e", viewerMayFollowUp: true, version: 1,
    ...overrides,
  };
}

test("Advanced lead is shown as Strong lead, and the pipeline's tabs are the four stages", () => {
  assert.equal(display.LEAD_KIND_LABEL.ADVANCED_LEAD.label, "Strong lead");
  assert.deepEqual(display.PIPELINE_TABS.map((tab) => tab.label), ["Early", "Strong", "Booked", "Moved in"]);
  const counts = { enquiries: 9, earlyLeads: 3, advancedLeads: 2, booked: 1, converted: 4, dead: 6, lostEnquiries: 5, duplicates: 0, potentialSpam: 0, resumed: 0, goingCold: 2 };
  assert.equal(display.countOf(counts, "ADVANCED_LEAD"), 2);
  assert.equal(display.leadsInPlay(counts), 6);
  assert.equal(display.leadsInPlay(undefined), null);
});

test("a card says who handles it, the fact its stage turns on, and what comes next", () => {
  // Strong: when they visited, and the days left to book.
  assert.deepEqual(display.leadFacts(lead()), [{ label: "Handler", value: "Debangshu Das" }, { label: "Visited", value: "30 Sept, 4:30 pm" }]);
  assert.deepEqual(display.leadBand(lead()), { tone: "warning", text: "Booking window ends", strong: "15 Oct" });
  // A request waiting on the property says so instead.
  assert.equal(display.leadBand(lead({ booking: { status: "AWAITING_HANDLER" } })).text, "Booking request waits on you");
  // Going cold speaks first, whatever the stage would say.
  assert.deepEqual(display.leadBand(lead({ goingCold: { reason: "TOKEN_DUE_SOON", since: null, by: "2026-10-04T12:30:00Z" } })),
    { tone: "warning", text: "Token due", strong: "4 Oct, 6:00 pm" });
  // Early: the visit's day and slot.
  const early = lead({ kind: "EARLY_LEAD", visit: { ...lead().visit, status: "SCHEDULED", checkedInAt: null } });
  assert.deepEqual(display.leadFacts(early)[1], { label: "Visit", value: "30 Sept, 4:00 pm" });
  assert.equal(display.leadBand(early).tone, "neutral");
  // A strong lead booked straight from the property page has no visit: when it was asked instead.
  assert.deepEqual(display.leadFacts(lead({ visit: null, booking: { status: "AWAITING_HANDLER", submittedAt: "2026-10-11T05:00:00Z" } }))[1],
    { label: "Requested", value: "11 Oct" });
  // Booked: the move-in day.
  const booked = lead({ kind: "BOOKED", bookedAt: "2026-10-02T05:00:00Z", booking: { status: "CONFIRMED", moveInDate: "2026-10-20", roomNumber: "204" } });
  assert.deepEqual(display.leadFacts(booked).map((fact) => fact.label), ["Handler", "Booked", "Room"]);
  assert.deepEqual(display.leadBand(booked), { tone: "neutral", text: "Move-in", strong: "20 Oct" });
  // Ended: why.
  assert.equal(display.leadBand(lead({ kind: "DEAD", closeReason: "BOOKED_ELSEWHERE" })).text, "Booked elsewhere");
  // Nobody handles it yet.
  assert.equal(display.leadFacts(lead({ handlerName: null }))[0].value, "Nobody yet");
});

test("the timeline runs oldest first, in words, with who did each step", () => {
  const entries = display.leadTimeline({
    timeline: [
      { id: "3", type: "BOOKING_ENDED", actorName: null, subjectName: null, detail: "BKG-2026-000019: TENANT_CANCELLED", occurredAt: "2026-10-03T00:00:00Z" },
      { id: "1", type: "ENQUIRY_RAISED", actorName: null, subjectName: null, detail: null, occurredAt: "2026-09-25T00:00:00Z" },
      { id: "2", type: "HANDLER_ASSIGNED", actorName: null, subjectName: "Debangshu Das", detail: "FIRST_RESPONSE", occurredAt: "2026-09-25T00:10:00Z" },
      { id: "4", type: "MARKED_DUPLICATE", actorName: null, subjectName: null, detail: "LEAD-2026-000097", occurredAt: "2026-09-25T00:00:01Z" },
      { id: "5", type: "VISIT_ATTENDED", actorName: "Debangshu Das", subjectName: null, detail: "30 Sept, 4:00 pm", occurredAt: "2026-09-30T11:00:00Z" },
    ],
  });
  assert.deepEqual(entries.map((entry) => entry.title), ["Enquiry raised", "Marked duplicate", "Handler assigned", "Visited, now a strong lead", "Booking ended"]);
  assert.equal(entries[1].note, "After LEAD-2026-000097");
  assert.equal(entries[2].by, "Debangshu Das · first to respond");
  assert.equal(entries[3].by, "Debangshu Das");
  assert.equal(entries[4].note, "BKG-2026-000019, cancelled by them");
  // A visit step's note is the visit's own day, drawn with a calendar. Other notes are not.
  assert.equal(entries[3].noteIsVisitDay, true);
  assert.equal(entries[1].noteIsVisitDay, false);
  assert.equal(entries[4].noteIsVisitDay, false);
  const detail = read("app/owner-lead-detail.tsx");
  assert.ok(detail.includes("item.note && item.noteIsVisitDay"));
  // The timeline's visit days and the Visits card's own date both carry it.
  assert.equal(detail.match(/<CalendarDays accessibilityLabel="Visit day"/g).length, 2);
  // A moved visit says where it was moved from.
  assert.ok(detail.includes("visit.movedFromDate ?") && detail.includes("Moved from {leadDay(visit.movedFromDate)}"));
  // Booked straight from the property page: the parts it never had read as not available.
  assert.ok(detail.includes('<NotAvailableCard title="Enquiry" why={direct === "DIRECT_BOOKING" ? "Direct booking" : "Direct visit scheduled"} />'));
  assert.ok(detail.includes('<NotAvailableCard title="Visit" why="Direct booking" />'));
  // One enquiry or one booking: its state sits beside the card's title, not on its line.
  assert.ok(detail.includes("detail.enquiries.length === 1 ? <EnquiryChip enquiry={detail.enquiries[0]} /> : null"));
  assert.ok(detail.includes("detail.bookings.length === 1 ? <OwnerBookingStatus status={detail.bookings[0].status} /> : null"));
  // The code keeps its size on the lead details, and is a size down under the name on the card.
  assert.ok(detail.includes("fontSize: 21 }]}>{lead.referenceCode}"));
  assert.ok(read("src/features/lead/lead-card.tsx").includes("fontSize: 10.5, lineHeight: 14 }]}>{lead.referenceCode}"));
});

test("slots read as times of day", () => {
  assert.equal(display.slotTime(600), "10:00 am");
  assert.equal(display.slotTime(720), "12:00 pm");
  assert.equal(display.slotTime(990), "4:30 pm");
  assert.equal(display.slotTime(0), "12:00 am");
});

test("Property Leads sits under Service Balance on Home and opens the Leads workspace", () => {
  const home = read("app/(tabs)/index.tsx");
  const balance = [...home.matchAll(/<ServiceBalanceCard onPress/g)].map((match) => match.index);
  const leads = [...home.matchAll(/<PropertyLeadsCard onPress=\{\(\) => onNavigate\("\/owner-leads"\)\}/g)].map((match) => match.index);
  assert.equal(balance.length, 2);
  assert.equal(leads.length, 2);
  // Each one right after the balance card's own block, for owner and manager alike.
  balance.forEach((at, index) => assert.ok(leads[index] > at && leads[index] - at < 400));
  assert.ok(home.includes("Property Leads"));
  const layout = read("app/_layout.tsx");
  assert.ok(layout.includes('<Stack.Screen name="owner-leads"') && layout.includes('<Stack.Screen name="owner-lead-detail"'));
});

test("the Home Leads card uses the approved transparent 256px artwork instead of a generic target", () => {
  const home = read("app/(tabs)/index.tsx");
  const card = home.slice(home.indexOf("function PropertyLeadsCard("), home.indexOf("function LatestEventsButton("));
  assert.ok(home.includes('require("../../assets/icons/home-tools/property-leads.png")'));
  assert.match(card, /source=\{PROPERTY_LEADS_ILLUSTRATION\}/);
  assert.match(card, /resizeMode="contain"/);
  assert.doesNotMatch(card, /<Target/);
  const png = fs.readFileSync(path.join(__dirname, "../assets/icons/home-tools/property-leads.png"));
  assert.equal(createHash("sha256").update(png).digest("hex"), "12c91071954913e5b5dc11ed80f9f03a6a2c1e980d65e2c6c6b5bd2b7bf5e215");
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[25], 6, "PNG must retain its RGBA transparency");
});

test("all Leads workspace empty states use the blue illustration and the shared centered layout", () => {
  const screen = read("app/owner-leads.tsx");
  const file = ts.createSourceFile("owner-leads.tsx", screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const emptyStates = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "EmptyState") emptyStates.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(emptyStates.length, 2, "no-property and empty-result states must share the Leads illustration");
  for (const empty of emptyStates) {
    const attributes = empty.attributes.properties;
    assert.ok(!attributes.some((item) => item.name?.text === "compact"), "center the state as on Visits/Bookings, not compact under the filters");
    assert.ok(!attributes.some((item) => item.name?.text === "icon"));
    const artwork = attributes.find((item) => item.name?.text === "artworkNode");
    assert.equal(artwork.initializer.expression.getText(file), "<PropertyLeadsIcon size={64} />");
  }
  assert.ok(screen.includes('title={narrowed ? "No matching leads" : EMPTY_TITLE[tab]}'));
  assert.ok(screen.includes('description={narrowed ? "Try another search or filter." : EMPTY_DESCRIPTION[tab]}'));
});

test("the Leads workspace has no settings, and Follow up opens the enquiry's respond sheet", () => {
  const screen = read("app/owner-leads.tsx");
  assert.doesNotMatch(screen, /Settings/);
  // A filter looks across every stage with no tab filled, and a tab clears the filters (user, 2026-10-17).
  assert.ok(screen.includes("? PIPELINE_TABS.map((option) => option.kind)"));
  assert.ok(screen.includes("<PipelineTabs active={filtered ? null : tab}"));
  assert.ok(screen.includes("setFilters(NO_LEAD_FILTERS);"));
  // Clear in the filter sheet applies at once, it does not only untick the boxes.
  assert.ok(read("src/features/lead/lead-filter-sheet.tsx").includes('label="Clear" onPress={() => onApply(NO_LEAD_FILTERS)}'));
  assert.ok(screen.includes("respondFirst"));
  assert.ok(read("app/owner-lead-detail.tsx").includes("respondFirst"));
  const enquiries = read("app/owner-enquiries.tsx");
  assert.ok(enquiries.includes('useState<EnquiryCardStep | null>(respondFirst ? "respond" : null)'));
  // Follow up opens the respond sheet alone, never the enquiry card under it (user, 2026-10-18).
  assert.ok(enquiries.includes("{respondFirst ? ("));
  assert.ok(enquiries.includes("if (respondFirst && step === null) {"));
  // Follow up is offered only where the reader may answer an enquiry that is still open.
  const card = read("src/features/lead/lead-card.tsx");
  assert.ok(card.includes("lead.followUpEnquiryId && lead.viewerMayFollowUp"));
  // On a tab no stage chip: the Duplicate chip takes its place, with a ? that opens why. A filter shows the stage.
  assert.ok(card.includes("{showKind ? <LeadKindChip kind={lead.kind} /> : null}"));
  assert.ok(card.includes("{lead.repeat ? <LeadRepeatChip repeat={lead.repeat} /> : null}"));
  assert.doesNotMatch(card, /\{lead\.repeat \? <LeadRepeatNote/);
  // The ? is a small mark inside the chip's own fill, and the chip opens why.
  assert.ok(card.includes("<CircleHelp color={color} size={13}") && card.includes("onPress={() => setOpen(true)}") && card.includes("<HowItWorksSheet"));
  assert.doesNotMatch(card, /What it changes/);
  assert.ok(screen.includes("showKind={filtered}"));
  // The Enquiries card keeps its note with the reason.
  assert.ok(read("app/owner-enquiries.tsx").includes("text={enquiry.repeatMark.reason}"));
  // The facts run across the card as columns, not as a narrow label column on the left.
  assert.ok(card.includes('flex: fact.label === "Handler" ? 1.5 : 1'));
  assert.doesNotMatch(card, /width: 72/);
});

test("a white button is blue-bordered unless it removes something", () => {
  const ui = read("src/features/owner/owner-ui.tsx");
  assert.ok(ui.includes('variant === "secondary" || variant === "outline" || variant === "primaryQuiet" || variant === "successQuiet"'));
  assert.match(ui, /blueOnWhite\s*\?\s*colors\.primary/);
  assert.ok(read("app/owner-property-visits.tsx").includes('label="Discard" onPress={() => discard(day)} variant="neutral"'));
});

test("the property page books a visit or a stay straight, with no enquiry, after the consent step", () => {
  const flows = read("src/features/discovery/components/direct-booking-flows.tsx");
  // Both ask what to share first, as enquiring does.
  assert.equal((flows.match(/<EnquiryConsentModal/g) || []).length, 2);
  // A visit goes through the visit sheet in its direct mode.
  assert.ok(flows.includes('<VisitSheet direct enquiryId="" onClose={onDone} propertyId={propertyId} viewer="ENQUIRER" />'));
  // A stay offers a visit first, which they may decline, then opens the booking form on the record it gets.
  assert.ok(flows.includes('>Visit first?</ModalTitle>') && flows.includes('label="Schedule a visit"') && flows.includes('label="Book without a visit"'));
  assert.ok(flows.includes('router.push({ pathname: "/booking-request", params: { enquiryId: eligibility.enquiryId } })'));
  const sheet = read("src/features/enquiry/visit-sheet.tsx");
  assert.ok(sheet.includes("await scheduleDirectVisit({ date, propertyId, slotStart }).unwrap();"));
  // Enquire, Visit and Booking in one glass row (user, 2026-10-17), each with its own picture beside its name.
  const actions = read("src/features/discovery/components/profile-actions.tsx");
  assert.ok(actions.includes('label={canEnquire ? "Enquire" : "Enquiry sent"}'));
  assert.ok(actions.includes('label="Visit"') && actions.includes('label="Booking"'));
  assert.ok(actions.includes('require("../../../../assets/empty-states/enquiries.png")'));
  assert.ok(actions.includes('require("../../../../assets/images/workspace/manage_visits.png")'));
  assert.ok(actions.includes('require("../../../../assets/icons/home-tools/bookings.png")'));
  // Glass, a rectangle with the picture beside the words, a phone's shadow floating and a border resting.
  assert.ok(actions.includes("<BlurView") && actions.includes('flexDirection: "row", gap: 6'));
  assert.ok(actions.includes("borderColor: !floating ? colors.borderStrong"));
  assert.ok(actions.includes('import { softShadow } from "@/theme/shadows";') && !actions.includes("useSoftShadow()"));
  // Nothing for who manages the place. Who stays there may enquire, and gets no Visit or Booking.
  assert.ok(actions.includes("{staysHere ? null : <GlassActionButton artwork={VISIT_ARTWORK}"));
  assert.ok(actions.includes("{staysHere ? null : <GlassActionButton artwork={BOOKING_ARTWORK}"));
  // The row floats clear of the tab bar until the page reaches the one below Contacts, where it rests.
  const layer = read("src/features/discovery/components/property-profile-layer.tsx");
  assert.ok(layer.includes("{property && actions.available && !dockInView ? ("));
  assert.ok(layer.includes("{actions.row(true, pageForGlass)}") && layer.includes("{actions.sheets}"));
  assert.ok(layer.includes("bottom: TAB_BAR_HEIGHT_PX + spacing.md") && layer.includes("paddingBottom: TAB_BAR_HEIGHT_PX + spacing.md"));
  assert.ok(layer.includes("<BlurTargetView ref={pageForGlass}"));
  const profile = read("src/features/discovery/components/property-profile.tsx");
  assert.ok(profile.indexOf("{actions ? <View onLayout") > profile.indexOf('<ProfileSection title="Contacts">'));
  // The old row near the top is gone.
  assert.doesNotMatch(profile, /<EnquireAction/);
});
