# Important Application Flows

This document captures the core flows and consistency rules for Khatiyan.
It is a living reference for implementation decisions, not a frozen contract.

## Auth And Owner Entry

1. Owner registers through the auth module.
2. Auth stores the owner as a `User` with role `OWNER`.
3. In the current Firebase path, Firebase verifies phone ownership on the
   client and sends a Firebase ID token to the backend.
4. Auth verifies the Firebase ID token with Firebase Admin SDK, marks the phone
   verified, and creates the Khatiyan account.
5. The client sends the same Firebase ID token again while setting the first
   PIN. Auth re-verifies the Firebase proof, stores the PIN, and issues a
   Khatiyan JWT.
6. In the parked custom OTP path, OTP is issued to Valkey as the primary active
   OTP store and mirrored to `otp_requests` for database fallback.
7. Owner verifies OTP.
8. Owner sets PIN or logs in with PIN.
9. Auth issues a JWT containing user identity and role.
10. Business modules use the authenticated `UserPrincipal` from Spring Security.

Auth endpoints are public because users need them before they have a token.
Business endpoints are protected by JWT and role checks in `SecurityConfig`.

Normal users can also self-register through auth. Self-registered users are
stored as role `USER` with `activeTenant = false` until an owner/manager starts
a tenancy for them.

OTP uses Valkey first for short-lived active OTP state and request-rate
counting. The existing database OTP table remains the fallback path when Valkey
is unavailable. When Valkey is healthy, the same OTP hash is also mirrored to
the database so verification can still fall back if Valkey goes down after OTP
issuance.

Firebase phone auth is the current external phone-verification path while SMS
DLT setup is pending. Firebase handles OTP delivery and verification on the
client side. The backend receives the Firebase ID token, verifies it with
Firebase Admin SDK, extracts the verified phone number, and creates the
Khatiyan user. Registration does not issue a Khatiyan JWT. The first JWT is
issued only after the client sets a PIN through the Firebase PIN setup endpoint.
Khatiyan still owns users, roles, tenancy state, PIN login, and API access.

Firebase-backed auth endpoints:

```text
POST /api/v1/auth/firebase/user/register
POST /api/v1/auth/firebase/owner/register
POST /api/v1/auth/firebase/pin/set
```

Firebase is disabled by default and is enabled with:

```text
FIREBASE_AUTH_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_PATH=...
```

or:

```text
FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=...
```

Custom OTP delivery is separate from OTP storage. This path remains useful for
local development and future provider-backed OTP delivery. The client can
request:

- `SMS`: send the OTP through SMS only.
- `SMS_AND_WHATSAPP`: send the same OTP through SMS and WhatsApp.

SMS is the mandatory delivery channel. WhatsApp is treated as an additional
convenience channel, so a WhatsApp failure should be logged without invalidating
the OTP if SMS already succeeded. Current provider adapters are local log
providers selected by config:

- `app.otp.delivery.sms.provider=log`
- `app.otp.delivery.whatsapp.provider=log`

The `log` providers are local-development adapters. Real SMS/WhatsApp provider
adapters can be added later behind the same `OtpDeliveryProvider` interface
without changing OTP storage or verification logic.

`POST /api/v1/auth/otp/request` accepts an optional OTP purpose:

- `LOGIN`: first PIN setup for newly registered or provisioned users.
- `PIN_RESET`: PIN reset verification.

The name `LOGIN` remains in the enum for compatibility, but the current product
meaning is first PIN setup, not OTP login.

`GET /api/v1/auth/me` is authenticated and returns the current user's public
profile summary.

`PATCH /api/v1/auth/me` is authenticated and lets a user update profile name.
Phone number is not editable in v1 because phone is the login identity.

Profile photo upload is a frontend-owned operation. The frontend uploads the
image to Cloudinary and sends the resulting image reference to the backend.
The database stores Cloudinary references, not image bytes:

- `profile_photo_url`
- `profile_photo_public_id`
- `profile_completed`

There is no backend multipart image upload endpoint in v1. Backend auth flows
should accept/store the already-uploaded image URL/reference when profile
creation or profile update supports it.

Provisioned tenant users may start with a placeholder name such as
`Tenant 3210`. After OTP login and PIN setup, the tenant can complete their
profile by setting their name and profile photo.

Tenant state is not modeled as a separate role for new accounts. A tenant-facing
account is:

```text
role = USER
activeTenant = true
```

Normal signed-up users without a current tenancy are:

```text
role = USER
activeTenant = false
```

Owner accounts keep a dedicated `OWNER` role. Manager capability is not a
global auth role in v1; it comes from active `property_managers` rows. The
legacy `TENANT` enum value is retained only for compatibility while the
codebase migrates away from tenant-as-role authorization.

Tenant-facing profile data is split into two authenticated reads:

```text
GET /api/v1/auth/me
GET /api/v1/tenancies/me/active
```

`/auth/me` returns the public user profile. `/tenancies/me/active` returns the
tenant's active property profile by combining user, tenancy, property, and room
summaries. Tenants do not call owner/manager property APIs to build this view.

## Property Registration

1. Authenticated owner calls the property API.
2. `PropertyController` passes `user.userId()` into `PropertyService`.
3. `PropertyService` creates the property using the authenticated owner id.
4. Property ownership checks later use `owner_id` from the property row.

The auth module only knows that the owner exists. The property module owns
property and room data.

Property updates use:

```text
PATCH /api/v1/properties/{propertyId}
```

Editable property fields are name, address, city, pincode, location, type,
standard facilities, and custom facilities. Standard facilities are stored as
enum values such as `WIFI`, `MESS`, and `WASHING_MACHINE`; owner-defined
custom facilities are stored as trimmed free-text names. The owner id is never
taken from the request body.

Property also owns billing and exit policy defaults used by downstream
modules:

- fixed standard deposit amount
- rent collection timing: enforced as `CYCLE_START` for v1
- rent grace days
- notice period days

Monthly tenancy creation snapshots the current property deposit amount into the
tenancy. Later property deposit edits do not rewrite existing tenancy deposit
terms.

## Property Access Model

Route checks in `SecurityConfig` only answer whether a user is authenticated
or has an owner-only account role for owner setup routes. Domain access still
belongs inside the property module.

Current implemented access model:

- property create/list/update/delete routes are owner-only
- property manager assignment/list/removal routes are owner-only
- property room, property board, notice, concern management, and tenancy
  management routes require authentication at the route layer
- services verify that the actor owns or manages the target property

Property route security is intentionally explicit:

```text
/api/v1/properties
/api/v1/properties/{propertyId}
/api/v1/properties/{propertyId}/managers
/api/v1/properties/{propertyId}/rooms/**
```

There is no broad owner-or-manager matcher for every property sub-route.

Owner access is checked by comparing:

```text
property.ownerId == actorUserId
```

Manager access is enforced through active rows in:

```text
property_managers
- property_id
- manager_user_id
- assigned_by_user_id
- is_active
- created_at
- updated_at
```

Property access is expressed as:

```text
actor owns the property
OR
actor is an active manager assigned to the property
```

When an owner assigns a manager by phone, property calls
`AuthModule.provisionManagerUser(...)`. The auth module only ensures there is
an active user account. The property module owns the actual management
assignment:

- if the phone belongs to an existing `USER`, reuse that user
- if the phone belongs to an existing `OWNER`, keep the role as `OWNER` and let
  the `property_managers` row grant management access to the other property
- if no user exists, create a new `USER`

This keeps manager access user-friendly: a person can own one property and
manage another, and a manager can be assigned to more than one property. There
is no global `MANAGER` role in v1; manager capability is assignment-driven.

Inside the property module, services may call other property services directly.
Across module boundaries, other modules should use `PropertyModule` rather than
importing property services. Other modules should call
`PropertyModule.ensureCanManageProperty(...)` for cross-module access checks.

## Room Creation

Rooms are created under a property owned by the authenticated owner.

Single room create is strict:

1. Owner requests one room.
2. Service checks that the owner owns the property.
3. Service checks that no active room with that room number exists.
4. Room is saved.

Bulk room create is idempotent:

1. Owner sends explicit rooms, generated ranges, or both.
2. Ranges are expanded into normal room requests.
3. Duplicate room numbers inside the same request are rejected.
4. Already-active room numbers in the database are skipped.
5. Missing active room numbers are created.

Inactive/deactivated room rows may still exist in the database. They do not
block creating a new active room with the same room number.

Room updates use:

```text
PATCH /api/v1/properties/{propertyId}/rooms/{roomId}
```

Editable room fields are room number, floor, capacity, room type,
conditioning, and base rent. Capacity cannot be reduced below current
occupancy.

Room behavior is owned by `RoomService`. Property lifecycle is owned by
`PropertyService`.

## Room Occupancy Model

Rooms are capacity-based, not boolean occupied/vacant.

Each room has:

- `capacity`
- `occupiedCount`
- derived `availableVacancies = capacity - occupiedCount`
- `status`

Room status transitions:

```text
occupiedCount = 0              -> VACANT
0 < occupiedCount < capacity   -> PARTIALLY_OCCUPIED
occupiedCount = capacity       -> OCCUPIED
empty and manually blocked     -> MAINTENANCE
```

Owners cannot manually mark a room as `OCCUPIED`. Occupancy comes from tenancy
lifecycle only.

## Tenancy Start And Room Locking

Starting a tenancy must claim one room slot safely.

Current implementation flow:

1. `TenancyService.create(...)` starts a transaction.
2. Tenancy validates user and room vacancy.
3. Tenancy is saved inside the transaction.
4. Tenancy synchronously initializes billing through `BillingModule`.
5. Billing creates the first cycle and opens the deposit account.
6. If billing/deposit initialization fails, the tenancy transaction rolls back.
7. `TenancyStartedEvent` is published for room occupancy and notifications.
8. Before the transaction commits, `PropertyTenancyEventListener` runs.
9. Property service loads the room with `PESSIMISTIC_WRITE`.
10. `room.occupyOneSlot()` increments `occupiedCount`.
11. Room status refreshes automatically.
12. Tenancy, billing, deposit, and room updates commit together.
13. PostgreSQL releases the row lock automatically.

The lock prevents concurrent requests from overbooking the same room.

Example with one vacancy:

```text
Request A locks room, occupiedCount 1 -> 2, commits.
Request B waits, then reads occupiedCount = 2.
Request B fails if capacity is already full.
Request B tenancy rolls back.
```

Example with two vacancies:

```text
Request A locks room, occupiedCount 1 -> 2, commits.
Request B waits, then reads occupiedCount = 2.
Request B locks room, occupiedCount 2 -> 3, commits.
Both tenancies succeed.
```

Owner-facing tenancy creation accepts tenant phone instead of tenant user id:

```json
{
  "tenantPhone": "9876543210",
  "propertyId": "...",
  "roomId": "...",
  "startDate": "2026-05-12"
}
```

Tenancy calls `AuthModule.provisionTenantUser(...)`:

- if a normal `USER` exists for the phone and `activeTenant = false`, reuse
  that user id
- if no user exists, create a `USER` with a placeholder profile name
- after the tenancy row is saved, tenancy calls `AuthModule.markActiveTenant(...)`
  so `activeTenant = true` moves only after tenancy persistence succeeds
- if the phone belongs to an `OWNER`, reject the request
- if the user already has `activeTenant = true`, reject the request before
  creating another tenancy
- auth logs include `provisionedBy` so the audit trail shows which owner
  provisioned or reused the tenant account

Tenancy still stores `userId` internally. The owner should not need to know it.
Tenancy also stores `createdByUserId`, which is the authenticated owner or
manager who created the tenancy record.

Tenancies support two billing shapes:

- `MONTHLY`: long-term stay. The request includes room id and start date. Rent
  is copied from the active room's `baseRentPaise` as the tenancy rent snapshot.
  Deposit is copied from the active property's fixed deposit policy. Rent due
  date is calculated by billing cycle policy, not stored on tenancy.
- `DAILY`: temporary guest stay. The request includes start date and planned
  checkout date, but no rent amount, deposit, or rent due day. The stay must be
  between 1 and 29 days. The tenancy snapshots the property's daily guest rate
  based on room conditioning:
  - AC room -> `daily_guest_ac_rate_paise`
  - non-AC room -> `daily_guest_non_ac_rate_paise`

Daily guest rates live on the property so owners can manage temporary-stay
pricing at property level. The rate is copied into the daily tenancy at creation
time, so later property rate edits do not rewrite historical guest stays.

Monthly rent and deposit are now policy/inventory driven. Owners/managers do
not manually set rent or a positive deposit amount while starting a monthly
tenancy. Tenancy reads the active room's `baseRentPaise` and the active
property's `standardDepositPaise`, then stores both snapshots on the tenancy.
Deposit manager then opens the deposit account from the tenancy snapshot.

A tenant can have only one active tenancy at a time. This is enforced twice:

- `AuthService.provisionTenantUser(...)` rejects users already marked
  `activeTenant = true`.
- `TenancyService.create(...)` also rejects creation when
  `findByUserIdAndActiveTrue(...)` already returns a tenancy.
- The database keeps a partial unique index on active `user_id`, so concurrent
  requests cannot create duplicate active tenancies for the same tenant.

## Tenancy Setup Updates

Tenancy setup terms can be corrected only before billing starts.

Editable setup fields:

- `rentAmountPaise`

Locked fields:

- tenant `userId`
- `propertyId`
- `roomId`
- `startDate`
- `createdByUserId`
- lifecycle `status` and `active`

`billingStarted` is false only while the tenancy is being assembled. During
tenancy creation, billing creates the first rent cycle and then marks billing
started before the transaction commits. After that, setup terms are locked.

Room transfer keeps the same tenancy and updates its room/rent snapshot:

1. Owner/manager selects a target room.
2. Tenancy verifies the target room belongs to the same property and has
   vacancy.
3. Tenancy copies the target room's `baseRentPaise` into
   `tenancy.rentAmountPaise`.
4. Tenancy updates `roomId` on the same tenancy record.
5. `TenancyRoomTransferredEvent` is published.
6. Before commit, property listener decrements old room occupancy and increments
   new room occupancy.

This keeps billing cycles, deposit account, exit requests, and tenant active
state attached to the same tenancy while still moving occupancy correctly.

## Tenancy Room Change Requests

Tenant-driven room changes use a request workflow instead of directly
transferring rooms from the tenant side.

1. Tenant selects a target room from their active property's room list.
2. Tenancy verifies the target room belongs to the same property, is not the
   current room, is active, has vacancy, and has rent configured.
3. Tenancy loads the latest billing cycle and stores that cycle id on the
   request.
4. The request's `effectiveTransferDate` is always the current billing cycle's
   `periodEndDate`.
5. Owner/manager can approve or reject the request on any day.
6. Approval does not immediately transfer the tenant.
7. Manual or scheduled execution can run only on or after
   `effectiveTransferDate`.
8. The room-change scheduler runs before monthly billing generation by default,
   so due approved transfers can update tenancy room/rent before the next cycle
   snapshots billing details.
9. Execution delegates to `TenancyService.transferRoom(...)`, preserving the
   same tenancy, billing history, deposit account, and active-tenant identity.
10. The request stores the requested target room rent and the executed rent
    amount for audit.

## Tenancy End And Room Vacancy

Ending a tenancy releases one occupied room slot.

1. `TenancyService.end(...)` starts a transaction.
2. Tenancy is ended.
3. `TenancyEndedEvent` is published.
4. Before commit, property listener runs.
5. Property service locks the room row.
6. `room.vacateOneSlot()` decrements `occupiedCount`.
7. Room status refreshes automatically.
8. Tenancy end and room update commit together.

A room becomes `VACANT` only when `occupiedCount` reaches zero.

When the tenancy is ended normally, auth clears the user's `activeTenant` flag.
Room transfer does not end the tenancy, so the user remains an active tenant and
billing/deposit continuity is preserved.

## Tenancy Exit Requests

Tenant-driven exits use a request workflow instead of directly ending tenancy.

Normal notice exit:

1. Tenant requests normal exit through their active tenancy.
2. Tenancy loads the latest billing cycle.
3. The request is allowed only inside the cycle rent window:
   `periodStartDate <= today <= rentDueDate`.
4. Checkout date is calculated from the billing policy snapshot:
   - v1 enforces `CYCLE_START`, so checkout date is the current cycle
     `periodEndDate`
5. Owner/manager approves or rejects.
6. Approved normal requests mark tenancy `ON_NOTICE` while keeping it active.
7. Manual or scheduled execution can run only on or after the approved checkout
   date.
8. Before ending the tenancy, billing verifies the latest billing cycle is paid.
9. If the latest cycle is unpaid/overdue, execution is blocked.
10. Normal exit does not generate a separate receipt; payment state lives on the
   billing cycle for now.

Premature exit:

1. Tenant requests a custom checkout date and reason.
2. Request can be raised inside or outside the rent window.
3. Owner/manager reviews tenancy, current billing cycle, deposit account, and
   property rules/board information.
4. Owner/manager manually decides billing/deposit notes and amounts.
5. Before approval is recorded, tenancy calls billing synchronously:
   - latest cycle is loaded
   - monthly deposit account is verified to exist
6. Billing line edits are made directly on the billing cycle before payment.
7. If billing/deposit preparation fails, the premature request remains
   `REQUESTED`.
8. Approved premature requests mark tenancy `ON_PREMATURE_NOTICE` while keeping
   it active.
9. Owner/manager can still adjust the unpaid billing cycle/deposit ledger before
   execution.
10. Manual or scheduled execution can run only on or after the approved checkout
   date.
11. Before ending the tenancy, billing verifies the latest billing cycle is paid.
   It does not auto-calculate premature-exit charges.
12. Tenancy is ended only after the final cycle payment check succeeds.

Approved exit requests do not end tenancy until their approved checkout date.
Manual execution and the tenancy exit scheduler call the same execution service:

```text
approved exit request due today
-> verify actor can still manage property
-> verify latest billing cycle is paid
-> call TenancyService.end(...)
-> publish TenancyEndedEvent
-> mark exit request EXECUTED
```

`TenancyEndedEvent`, room vacancy updates, and `activeTenant` cleanup still use
the existing lifecycle path. Direct tenancy ending is also guarded by billing:
`TenancyService.end(...)` verifies the latest billing cycle is paid before
ending the tenancy.

The tenancy exit scheduler is configurable:

```text
app.tenancy.exit-execution-cron=0 5 0 * * *
app.tenancy.exit-execution-zone=Asia/Kolkata
app.tenancy.exit-execution-batch-size=50
```

## Manual Room Status Changes

Owner-facing manual changes are limited:

- `MAINTENANCE` is allowed only when the room is empty.
- `VACANT` means "available again" and is allowed only when the room is empty.
- `OCCUPIED` is rejected manually.

This keeps real occupancy tied to active tenancy records.

## Billing And Deposit Initialization

Billing is initialized synchronously inside `TenancyService.create(...)`, not by
an after-commit event listener. This is intentional: a tenancy is not considered
successfully started unless its first billing cycle and deposit account are
created in the same transaction.

When a monthly tenancy starts:

1. Billing creates the first billing cycle.
2. The cycle snapshots `CYCLE_START` and the property's current grace days.
3. Base cycle line items include rent. Deposit is not a billing cycle line item.
4. Deposit manager opens the deposit account and records the tenancy deposit as
   the first `ADDITION` movement.
5. The cycle remains the live payable workspace until payment succeeds.

For v1, monthly billing is pay-at-start only. Future monthly cycle generation
should create the next cycle directly.

Billing cycles now have a payment status:

```text
UNPAID/OVERDUE -> PAID
```

`recordPaymentSuccess(...)` marks the billing cycle paid when the paid amount
matches the cycle total.

When owner/manager adds an extra charge, they choose whether it is added to the
cycle payable or deducted from deposit:

- `ADDED_TO_BILL`: line amount contributes to `totalAmountPaise`
- `ADJUSTED_FROM_DEPOSIT`: line amount is zero, settlement amount is stored, and
  deposit manager immediately creates or updates the linked deposit movement

Deposit accounts do not store original/current balances. They only identify the
tenant/property/tenancy deposit account and lifecycle status. The current
balance is recalculated from deposit movements:

- `ADDITION`: increases balance
- `DEDUCTION`: decreases balance
- `SETTLEMENT`: decreases balance when the deposit is paid out/closed

If the owner edits a deposit-adjusted line, the linked deposit movement amount
is updated in the same transaction. If the owner moves the line back to payable
or clears it, the linked deposit movement amount is set to `0`. No cached account
balance is patched.

There is no separate `Bill` entity in the current code. A future receipt/audit
snapshot can be rebuilt later from the paid cycle and deposit movements once the
payments module is ready.


## Concern Lifecycle

Concerns are tenant-raised issues tied to the tenant's active tenancy.

When a tenant raises a concern, the concern stores:

- `raisedByUserId`
- `tenancyId`
- `propertyId`
- `roomId`
- category, priority, title, and description
- up to four photo references uploaded by the frontend

The tenant does not choose property or room ids in the request. The concerns
module derives them from `TenancyModule.findActiveByUserId(...)`.

Current concern endpoints:

```text
POST /api/v1/concerns
GET /api/v1/concerns/me/current
GET /api/v1/concerns/me/history
POST /api/v1/concerns/{concernId}/reopen
GET /api/v1/properties/{propertyId}/concerns/available
GET /api/v1/properties/{propertyId}/concerns/history
GET /api/v1/concerns/undertaken
PATCH /api/v1/concerns/{concernId}/assign
PATCH /api/v1/concerns/{concernId}/status
PATCH /api/v1/concerns/{concernId}/resolve
```

Tenant concern endpoints require role `USER`. Property-scoped work queues and
management actions require authentication, then the concerns service uses
`PropertyModule.ensureCanManageProperty(...)` to verify access to the actual
property.

Admin-side concern tabs:

- Available: `OPEN` concerns for a selected property.
- Undertaken: `IN_PROGRESS` concerns assigned to the current owner/manager.
- History: `RESOLVED` and `CLOSED` concerns for a selected property.

Tenant-side concern tabs:

- Current: `OPEN`, `IN_PROGRESS`, and `RESOLVED` concerns raised by the tenant.
- History: `CLOSED` concerns raised by the tenant.

When an owner/manager marks a concern `IN_PROGRESS`, the concern is assigned to
that actor. This moves it into their undertaken tab.

When an owner/manager resolves a concern, the concern enters `RESOLVED` and gets
a three-day `reopenUntil` window. During that window the tenant can reopen the
concern with a `reopenReason`. Reopened concerns move back to `IN_PROGRESS` and
are assigned to the previous resolver, with `reopened = true` for UI badging.

After the reopen window expires, a service method can close expired resolved
concerns. A scheduled job can later call this daily or hourly.

## Notice And Property Board

The notice module has two separate concepts:

- Property board categories: configurable property sections such as Rules,
  Visitors, Food, Wi-Fi, Contacts, Facilities, and payment instructions.
- Property board items: stable dashboard information within a category, such
  as gate timings, meal timings, rules, visiting hours, contacts, facilities,
  and payment instructions.
- Notices: time-based property communication such as lost-and-found messages,
  rent reminders, fire-drill reminders, water/gas shortages, or emergency
  alerts.

Notice types are intentionally not modeled as an enum. Notices are free-form
human communication, so the module uses priority instead:

```text
NORMAL
IMPORTANT
URGENT
EMERGENCY
```

Notice lifecycle is:

```text
PUBLISHED -> ARCHIVED
PUBLISHED/ARCHIVED -> DELETED
```

`ARCHIVED` means an expired notice has moved into management history.
`DELETED` is a soft delete: the row stays in the database, but the notice is
hidden from published, visible, archived, and tenant views.

Service ownership is split by responsibility:

- `PropertyBoardService` owns property board categories and stable board items.
- `NoticeService` owns time-bound notices, tenant-visible notice lookup, manual
  archival, and the service entry point for future scheduled expiry archival.
- `RecurringNoticeService` owns recurring notice templates. A recurring template
  stores the reusable schedule and embeds normal notice content through
  `CreateNoticeRequest`; it does not create a JPA relationship to `Notice`.

Current notices are selected with:

```text
status = PUBLISHED
visibleFrom <= now
visibleUntil is null OR visibleUntil >= now
```

Management can archive notices manually only after `visibleUntil` has passed.
A scheduled cleanup flow can archive published notices whose `visibleUntil` has passed. Notices remain in
PostgreSQL as the source of truth, while vector search or pgvector can later be
added as a rebuildable search index for older notice lookup.

`NoticeSchedulerService` owns notice-module scheduled jobs. It checks for due
recurring notices every few minutes so same-day templates created after midnight
can still generate today's visible notice. It archives expired published notices
at the configured archive time. Both schedules are configurable:

```text
app.notice.recurring-generation-cron=0 */5 * * * *
app.notice.recurring-generation-zone=Asia/Kolkata
app.notice.archive-expired-cron=0 15 2 * * *
app.notice.archive-expired-zone=Asia/Kolkata
```

Recurring notices can be generated early because tenant visibility still depends
on the generated notice's visibleFrom and visibleUntil window. The template's
`last_processed_for_date` and `last_generated_for_date` guards prevent repeated
same-day generation while still allowing newly-created templates to be picked up
by the next scheduler interval.

Management property-board endpoints use property-scoped dynamic categories:

```text
POST /api/v1/properties/{propertyId}/property-board/categories
GET /api/v1/properties/{propertyId}/property-board/categories
PATCH /api/v1/properties/{propertyId}/property-board/categories/{categoryId}
DELETE /api/v1/properties/{propertyId}/property-board/categories/{categoryId}

POST /api/v1/properties/{propertyId}/property-board/items
GET /api/v1/properties/{propertyId}/property-board/items
GET /api/v1/properties/{propertyId}/property-board/items?categoryId=...
PATCH /api/v1/properties/{propertyId}/property-board/items/{itemId}
DELETE /api/v1/properties/{propertyId}/property-board/items/{itemId}
```

Management notice endpoints are separate from property board endpoints:

```text
POST /api/v1/properties/{propertyId}/notices
GET /api/v1/properties/{propertyId}/notices/published
GET /api/v1/properties/{propertyId}/notices/visible
GET /api/v1/properties/{propertyId}/notices/archived
PATCH /api/v1/notices/{noticeId}
PATCH /api/v1/notices/{noticeId}/archive
DELETE /api/v1/notices/{noticeId}
```

Management recurring notice endpoints manage templates, not tenant-visible
notice rows:

```text
POST /api/v1/properties/{propertyId}/recurring-notices
GET /api/v1/properties/{propertyId}/recurring-notices
PATCH /api/v1/recurring-notices/{recurringNoticeId}
DELETE /api/v1/recurring-notices/{recurringNoticeId}
```

Tenant notice lookup uses the tenant's active tenancy to resolve the property:

```text
GET /api/v1/notices/me/visible
```

Recurring notices are templates that generate normal `Notice` rows with concrete
visible windows. Tenants never read recurring templates directly; they only see
the generated notices through the same visible-notice endpoint.

Recurring generation does not load every active template. The repository filters
templates that are eligible for the current generation date:

```text
status = ACTIVE
activeFrom is null OR activeFrom <= today
activeUntil is null OR activeUntil >= today
lastProcessedForDate is null OR lastProcessedForDate != today
```

After that, `RecurringNotice.shouldGenerateFor(...)` applies the final
frequency rule. For v1, `DAILY` runs every eligible day, `WEEKLY` runs on the
weekday of `activeFrom`, and `MONTHLY` runs on the day-of-month of `activeFrom`.
The scheduler marks every fetched template as processed for the day, but only
marks it generated when a real `Notice` row is created.

## Module Boundary Rules

Property and tenancy remain separate modules.

Property owns:

- properties
- rooms
- capacity
- occupied count
- room status

Tenancy owns:

- active tenancy records
- tenancy history
- tenant-property-room links

Modules communicate through facades/events:

- `PropertyModule`
- `TenancyModule`
- `ConcernModule`
- `NoticeModule`
- `TenancyStartedEvent`
- `TenancyEndedEvent`

Avoid direct JPA relationships like `Room -> List<Tenancy>` across module
boundaries.

Current property module service split:

- `PropertyService` owns property lifecycle and owner-property access.
- `RoomService` owns room lifecycle, bulk setup, vacancy checks, and occupancy.
- `PropertyModule` exposes room vacancy and tenancy lifecycle operations to
  other modules.

Property listens to tenancy lifecycle events only for core occupancy sync.
Notification/activity events such as `PropertyCreatedEvent` or `RoomUpdatedEvent`
should be added later only when a real listener needs them.

## Notification Delivery Model

Notifications are DB-first. The in-app notification tab reads from
`notification.notifications` plus `notification.notification_recipients`.
Push delivery is tracked separately in `notification.push_notifications` so a
backend crash or restart does not lose pending push work.

Current notification tables:

- `notifications`: message content, broad category, priority, and optional
  source id for navigation.
- `notification_recipients`: per-user read/archive state.
- `push_notifications`: durable push delivery job for one recipient.
- `notification_device_tokens`: OneSignal, Firebase, or local log provider
  tokens registered by the client app after login/signup.

Push jobs use:

```text
PENDING -> IN_PROGRESS -> DELIVERED
PENDING -> IN_PROGRESS -> PENDING retry
PENDING -> IN_PROGRESS -> FAILED
```

The repository claim query uses PostgreSQL `FOR UPDATE SKIP LOCKED` so multiple
scheduler workers can safely claim different rows. `IN_PROGRESS` rows with old
`locked_at` values are considered stale and can be retried.

Current notification endpoints:

```text
GET    /api/v1/notifications/me
GET    /api/v1/notifications/me/unread-count
PATCH  /api/v1/notifications/{recipientId}/read
PATCH  /api/v1/notifications/me/read-all
PATCH  /api/v1/notifications/{recipientId}/archive
POST   /api/v1/notifications/devices
GET    /api/v1/notifications/devices
DELETE /api/v1/notifications/devices/{tokenId}
```

Push provider delivery is behind `PushNotificationProvider`. The current local
provider is `LOG`, which records delivery in application logs and marks the
durable push job as delivered. OneSignal and Firebase providers are still
planned.

The notification scheduler currently:

- claims due push jobs from `push_notifications`
- retries stale `IN_PROGRESS` jobs
- archives old read/unread notification recipient rows

Tenancy start/end events are now consumed after commit to create in-app
notifications and durable push jobs for the tenant, owner, and active property
managers.

Additional notification-producing events now wired:

- `UserRegisteredEvent`: notifies the new user with a welcome notification.
- `PinChangedEvent`: notifies the user that their account PIN changed.
- `ConcernRaisedEvent`: notifies owner and active property managers.
- `ConcernAssignedEvent`: notifies the assigned owner/manager.
- `ConcernStatusChangedEvent`: notifies the tenant when the concern moves to
  `IN_PROGRESS`.
- `ConcernResolvedEvent`: notifies the tenant.
- `ConcernReopenedEvent`: notifies owner, active managers, and the assigned
  resolver.
- `ManagerAssignedEvent`: notifies the new manager.
- `ManagerRemovedEvent`: notifies the removed manager.
- `NoticePublishedEvent`: notifies active tenants only when the notice is
  visible immediately at creation time.

Future/recurring notice visibility notifications are intentionally deferred
until notices have a `notification_sent_at`-style guard. Without that guard, a
scheduler could duplicate tenant notifications for the same future notice.

## Flyway And Migration Rule

Flyway versions are global, even though migrations are organized by folders.

If a migration was already applied to the database, do not edit it. Add a new
migration instead.

Important migration decisions:

- `V2003` adds `occupied_count` to rooms.
- `V2004` removes the unique active tenancy per room constraint.
- `V2005` adds tenancy creator tracking through `created_by_user_id`.
- `V2006` adds the temporary tenancy `billing_started` setup-lock flag.
- `V2007` adds Cloudinary profile-photo metadata to users.
- `V2008` adds property manager assignments.
- `V2009` creates concern tables and is already applied in local development.
- `V2010` adds concern reopen-window metadata and removes the temporary
  concern `is_active` column/index filters.
- `V2011` creates the notice module tables for property board categories,
  property board items, and notices.
- `V3004` creates notification tables.
- `V3006` removes notification `source_type` after simplifying source tracking
  to category plus source id.
- `V3007` indexes stale `IN_PROGRESS` push jobs.
- `V3008` enforces one push job per notification recipient.
- `V4007` adds property billing policy and billing-cycle policy snapshots.
- `V4008` adds fixed property deposit, property notice period, tenancy notice
  statuses, and tenancy exit request records.
- `V4009` was part of the earlier bill snapshot attempt and is now legacy
  schema; current code uses billing cycles directly as payable records.
- `V4013` allows cleared billing-linked deposit movements to keep a zero amount
  when owner moves a charge back from deposit to the cycle payable amount.
- `V4014` simplifies deposit accounts into identity/status only and moves
  opening deposit balance into the movement ledger.
- Active tenancy per user remains unique.
- Multiple active tenancies per room are allowed up to room capacity.
