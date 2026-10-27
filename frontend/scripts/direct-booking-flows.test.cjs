const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const SHARED_TEXT = require("./shared-text-mocks.cjs");

const source = fs.readFileSync(path.join(__dirname, "../src/features/discovery/components/direct-booking-flows.tsx"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const element = (type, props) => ({ type, props });
const theme = { colors: { primary: "#3F6ED8", ink: "#111111", muted: "#777777" }, fonts: { display: "display" }, type: { modalDescription: { fontSize: 14 }, description: { fontSize: 13 } } };

function nodes(tree, type) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
const one = (tree, type) => { const node = nodes(tree, type)[0]; assert.ok(node, `Missing ${type}`); return node; };
const button = (tree, label) => { const node = nodes(tree, "ActionButton").find((item) => item.props.label === label); assert.ok(node, `Missing ${label}`); return node; };

function harness({ loading = false, refusal = false, granted = false } = {}) {
  const state = [];
  const writes = [];
  const routes = [];
  let cursor = 0;
  let closed = 0;
  const exported = {};
  const dependencies = {
    "react": { useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; } },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "react-native": { ActivityIndicator: "ActivityIndicator", Image: "Image", Text: "Text", View: "View" },
    "../../../../assets/images/workspace/manage_visits.png": "vms-tool.png",
    "@/components/alert-modal": { AlertModal: "AlertModal" },
    "@/components/sheet-shell": { SheetShell: "SheetShell" },
    "@/components/modal-title": { ModalTitle: "Text" },
    "@/features/discovery/components/enquiry-consent-modal": { EnquiryConsentModal: "EnquiryConsentModal" },
    "@/features/enquiry/visit-sheet": { VisitSheet: "VisitSheet" },
    "@/features/forms/server-error": { errorMessage: (error) => error.message },
    "@/features/owner/owner-ui": { ActionButton: "ActionButton" },
    "@/navigation/use-guarded-router": { useGuardedRouter: () => ({ push: (route) => routes.push(route) }) },
    "@/store/services/enquiry-api": {
      useGetMyEnquiryChannelConsentsQuery: () => ({ data: { channels: [], anyGranted: granted } }),
      useOpenDirectBookingMutation: () => [(propertyId) => ({ unwrap: async () => { writes.push(propertyId); if (refusal) throw new Error("Booking unavailable"); return { enquiryId: "direct-enquiry-1" }; } }), { isLoading: loading }],
    },
    "@/theme/spacing": { spacing: { xs: 6, sm: 10, md: 14, lg: 18 } },
    "@/theme/use-theme": { useTheme: () => theme },
  };
  vm.runInNewContext(compiled, { exports: exported, require: (name) => { if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
  const props = { propertyId: "property-1", onDone: () => { closed++; } };
  return { exported, writes, routes, props, get closed() { return closed; }, render() { cursor = 0; return exported.BookAStayFlow(props); }, renderVisit() { cursor = 0; return exported.DirectVisitFlow(props); } };
}

test("Visit first centers the Home VMS artwork, title and copy with no duplicate shell title", () => {
  const h = harness();
  const tree = h.render();
  assert.equal(tree.type, "SheetShell");
  assert.equal(tree.props.title, "");
  const icon = one(tree, "Image");
  assert.equal(icon.props.source, "vms-tool.png");
  assert.equal(icon.props.resizeMode, "contain");
  assert.equal(icon.props.style.height, 72);
  assert.equal(icon.props.style.width, 72);
  assert.equal(icon.props.style.tintColor, undefined);
  const stack = nodes(tree, "View").find((node) => Array.isArray(node.props.children) && node.props.children[0] === icon);
  assert.ok(stack);
  assert.equal(stack.props.style.alignItems, "center");
  assert.equal(stack.props.style.paddingTop, 6);
  const text = nodes(stack, "Text");
  assert.deepEqual(text.map((node) => node.props.children), ["Visit first?", "Seeing the rooms first helps you choose well."]);
  assert.equal(text[0].props.accessibilityRole, "header");
  assert.equal(text[0].props.style.fontFamily, theme.fonts.display);
  assert.equal(text[0].props.style.fontSize, 24);
  for (const node of text) assert.equal(Object.assign({}, ...[].concat(node.props.style)).textAlign, "center");
  assert.equal(h.writes.length, 0);
});

test("the shared Visit and Enquiry consent sheet uses the communication permissions title", () => {
  const consentSource = fs.readFileSync(path.join(__dirname, "../src/features/discovery/components/enquiry-consent-modal.tsx"), "utf8");
  const consentCompiled = ts.transpileModule(consentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exported = {};
  const dependencies = {
    "react": { useEffect() {}, useMemo: (read) => read(), useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}] },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "react-native": { Text: "Text", View: "View" },
    "lucide-react-native": { Check: "Check", Mail: "Mail", MessageSquare: "MessageSquare", Phone: "Phone" },
    "@/components/alert-modal": { AlertModal: "AlertModal" },
    "@/components/sheet-shell": { SheetShell: "SheetShell" },
    "@/components/modal-title": { ModalTitle: "Text" },
    "@/components/animated-pressable": { AnimatedPressable: "AnimatedPressable" },
    "@/features/compliance/clickwrap-consent": { ConsentTick: "ConsentTick" },
    "@/features/owner/owner-ui": { ActionButton: "ActionButton" },
    "@/store/services/enquiry-api": { describeEmailChannelGapShort: () => null, useUpdateEnquiryChannelConsentsMutation: () => [() => { assert.fail("Opening permissions must not save consent"); }, { isLoading: false }] },
    "@/theme/spacing": { radii: { card: 12 }, spacing: { sm: 10 } },
    "@/theme/use-theme": { useTheme: () => theme },
  };
  vm.runInNewContext(consentCompiled, { exports: exported, require: (name) => { if (name in SHARED_TEXT) return SHARED_TEXT[name]; assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
  const onClose = () => {};
  const tree = exported.EnquiryConsentModal({ consents: { channels: [], emailChannelState: "AVAILABLE" }, onClose, onGranted() {} });
  assert.equal(tree.type, "SheetShell");
  assert.equal(tree.props.title, "Communication permissions");
  assert.equal(tree.props.onClose, onClose);
  assert.equal(one(tree, "ConsentTick").props.checked, false);
  assert.equal(button(tree, "Save and continue").props.disabled, true);
  const enquirySource = fs.readFileSync(path.join(__dirname, "../src/features/discovery/components/enquire-action.tsx"), "utf8");
  assert.match(enquirySource, /<EnquiryConsentModal\b/);
  assert.match(source, /<EnquiryConsentModal\b/);
  assert.doesNotMatch(consentSource, /How should they reply\?/);
});

test("both choices retain their order and choosing a visit does not open a booking", () => {
  const h = harness();
  const tree = h.render();
  assert.deepEqual(nodes(tree, "ActionButton").map((node) => node.props.label), ["Schedule a visit", "Book without a visit"]);
  assert.equal(button(tree, "Schedule a visit").props.variant, "secondary");
  button(tree, "Schedule a visit").props.onPress();
  const visit = h.render();
  assert.equal(visit.type, h.exported.DirectVisitFlow);
  assert.equal(visit.props.propertyId, "property-1");
  assert.equal(visit.props.onDone, h.props.onDone);
  assert.equal(h.writes.length, 0);
});

test("booking without a visit still asks consent before opening the server's booking form", async () => {
  const h = harness();
  button(h.render(), "Book without a visit").props.onPress();
  const consent = h.render();
  assert.equal(consent.type, "EnquiryConsentModal");
  assert.equal(h.writes.length, 0);
  consent.props.onGranted();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.writes, ["property-1"]);
  assert.equal(h.closed, 1);
  assert.equal(h.routes[0].pathname, "/booking-request");
  assert.equal(h.routes[0].params.enquiryId, "direct-enquiry-1");
});

test("the shared close control dismisses the choice without a write or navigation", () => {
  const h = harness();
  h.render().props.onClose();
  assert.equal(h.closed, 1);
  assert.equal(h.writes.length, 0);
  assert.equal(h.routes.length, 0);
});

test("loading and refusals keep their existing progress and error surfaces", async () => {
  const pending = harness({ loading: true });
  button(pending.render(), "Book without a visit").props.onPress();
  const loading = pending.render();
  assert.equal(loading.props.title, "Book a stay");
  one(loading, "ActivityIndicator");
  const refused = harness({ refusal: true });
  button(refused.render(), "Book without a visit").props.onPress();
  refused.render().props.onGranted();
  await new Promise((resolve) => setImmediate(resolve));
  const error = refused.render();
  assert.equal(error.type, "AlertModal");
  assert.equal(error.props.message, "Booking unavailable");
  assert.equal(refused.routes.length, 0);
  error.props.onClose();
  assert.equal(refused.closed, 1);
});

// Once any of the three profile buttons has the permission, the others do not ask again (user, 2026-10-18).
test("a visit goes straight to the slots once a channel is already granted", () => {
  const h = harness({ granted: true });
  assert.equal(h.renderVisit().type, "VisitSheet");
});

test("a visit still asks first while nothing is granted", () => {
  const h = harness();
  assert.equal(h.renderVisit().type, "EnquiryConsentModal");
});

test("booking without a visit skips the permission sheet once a channel is already granted", async () => {
  const h = harness({ granted: true });
  button(h.render(), "Book without a visit").props.onPress();
  assert.notEqual(h.render().type, "EnquiryConsentModal");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.writes, ["property-1"]);
  assert.equal(h.routes[0].pathname, "/booking-request");
});
