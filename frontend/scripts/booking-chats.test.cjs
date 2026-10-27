const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Booking chats (user, 2026-10-27): a booking made in the app has a chat with
// whoever handles it, opened from either side's card at every stage, and
// listed under a Bookings section in Chats.
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const chatTab = read("app/(tabs)/chat.tsx");
const chatApi = read("src/store/services/chat-api.ts");
const bookingApi = read("src/store/services/booking-api.ts");
const ownerList = read("src/features/booking/booking-request-list.tsx");
const myBookings = read("app/my-bookings.tsx");
const hook = read("src/features/booking/use-open-booking-chat.ts");
const thread = read("app/chat/[threadId].tsx");

test("both sides open the booking's chat from the server, which makes it the first time", () => {
  assert.match(bookingApi, /url: `\$\{mine\(requestId\)\}\/chat`/);
  assert.match(bookingApi, /url: `\/api\/v1\/properties\/\$\{propertyId\}\/booking-requests\/\$\{requestId\}\/chat`/);
  assert.match(bookingApi, /canChat: boolean;/);
  assert.match(hook, /pathname: "\/chat\/\[threadId\]"/);
  assert.match(hook, /subtitle: `Booking \$\{referenceCode\}`/);
});

test("the owner's card and the tenant's card carry Chat beside the main button, where the reader can chat", () => {
  assert.match(ownerList, /\{onChat && item\.canChat \? <ActionButton icon=\{MessageCircle\} label="Chat" onPress=\{onChat\} variant="secondary" \/> : null\}/);
  assert.match(ownerList, /const openChat = useOpenBookingChat\("property"\);/);
  // A card the reader may not open still offers its chat.
  assert.match(ownerList, /\{canOpen \|\| \(onChat && item\.canChat\) \?/);
  assert.match(myBookings, /\{item\.canChat \? <ActionButton icon=\{MessageCircle\} label="Chat" onPress=\{onChat\} variant="secondary" \/> : null\}/);
  assert.match(myBookings, /const openChat = useOpenBookingChat\("booker"\);/);
});

test("Chats has a Bookings section on both sides, after Enquiries", () => {
  assert.match(chatApi, /export type ChatThreadOrigin = "TENANCY" \| "ENQUIRY" \| "PERSONAL" \| "BOOKING";/);
  assert.match(chatApi, /`\$\{base\}\/properties\/\$\{propertyId\}\/threads\/bookings`/);
  assert.match(chatTab, /\["MINE", "TENANTS", "ENQUIRIES", "BOOKINGS", "NUDGES"\]/);
  assert.match(chatTab, /const personalOrder: PersonalSection\[\] = \["MINE", "ENQUIRIES", "BOOKINGS", "NUDGES"\];/);
  assert.equal(chatTab.split('label="Bookings"').length - 1, 2, "a Bookings pill on each side");
  // A tenant's booking chats are not mixed into My chats.
  assert.match(chatTab, /thread\.origin !== "ENQUIRY" && thread\.origin !== "BOOKING"/);
  assert.match(chatTab, /const bookingChats = threads\.filter\(\(thread\) => thread\.origin === "BOOKING"\);/);
});

test("an ended booking's chat says so", () => {
  assert.match(thread, /"This booking has ended\. You can still read the chat\."/);
});
