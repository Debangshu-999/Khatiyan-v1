# Khatiyan — Project Plan

PG and hostel management — the digital khatiyan.

This document is the source of truth for what gets built across every module. Each module section lists its responsibilities, entities, services, controllers, events, repositories, and external integrations. Use this as the working reference while building; treat it as a living document that gets updated as scope shifts.

---

## Table of contents

1. [Vision and scope](#vision-and-scope)
2. [Architecture overview](#architecture-overview)
3. [Module dependency graph](#module-dependency-graph)
4. [Build order](#build-order)
5. Modules:
   - [shared (cross-cutting)](#module-shared)
   - [config (cross-cutting)](#module-config)
   - [auth](#module-auth)
   - [property](#module-property)
   - [tenancy](#module-tenancy)
   - [notification](#module-notification)
   - [concern](#module-concern)
   - [notice](#module-notice)
   - [discovery](#module-discovery)
   - [payment](#module-payment)
6. [Cross-cutting concerns](#cross-cutting-concerns)
7. [Roadmap and future modules](#roadmap-and-future-modules)

---

## Vision and scope

**The problem:** PG and hostel owners run their business on WhatsApp, Excel, and screenshots. Rent collection is informal and forgeable. Tenant complaints get lost in chat threads. New tenants don't know where the local pharmacy is. There's no audit trail when disputes happen.

**The product:** A mobile-first SaaS that gives PG/hostel owners a structured way to manage tenancies, collect rent verifiably, handle complaints with SLAs, post property notices, and curate a local-services guide for their tenants.

**Primary users:**
- **Owners** — run one or more PGs, want clarity and control
- **Managers** — delegated by owners to handle day-to-day operations
- **Tenants** — pay rent, raise concerns, find local services

**India-first.** All design assumes Indian context: phone-number identity, UPI as the dominant payment method, IST, INR, English-default UI. Not built to scale to international markets without rework.

**v1 scope (this plan):** All eight modules below to a working production-quality state. Owner can sign up, create a property with rooms, add tenants, collect rent (manually first, then via Razorpay), handle concerns, post notices, and tenants get a curated discovery feed.

**Explicitly out of scope for v1:**
- Apartment-society features (visitor management, society-wide voting, common-area bookings)
- Multi-language UI
- Web admin panel (mobile-only for v1)
- Multi-property tenant accounts (one active tenancy per user)
- Internationalization

---

## Architecture overview

**Pattern:** Modular monolith. One Spring Boot application, one PostgreSQL database, internally organized into modules with strict boundaries enforced by ArchUnit at build time.

**Tech stack:**
- **Backend:** Java 21, Spring Boot 3.3, Spring Data JPA, Spring Security
- **Database:** PostgreSQL 16, schema-per-module, Flyway for migrations
- **Mobile:** React Native + Expo, TypeScript, Redux Toolkit
- **Auth:** Phone OTP + 6-digit PIN, JWT
- **Payments:** Razorpay
- **Notifications:** Firebase Cloud Messaging (FCM)
- **OTP delivery:** Firebase Auth (later: MSG91)
- **Storage:** AWS S3 (concern photos, listing photos, receipt PDFs)
- **Resilience:** Resilience4j (circuit breakers, retries, timeouts on external calls)
- **Rate limiting:** Bucket4j

**Cross-cutting decisions:**
- Money is always `long` paise, never float
- Times are stored as UTC `TIMESTAMPTZ`, displayed in local time
- Soft deletes via `is_active` flags + partial unique indexes
- Idempotency keys on all mutating endpoints
- Per-tenant rent due dates (anchored to check-in, owner-overridable) — distributes load uniformly across the month
- No in-app maps; deep-link to Google Maps for navigation

**Module communication:**
- **Synchronous facade calls** — module A imports module B's `Module.java` facade, calls methods directly. In-process, transactional.
- **Asynchronous domain events** — module A publishes a past-tense event (`PaymentCapturedEvent`), module B's listener reacts after commit. Decoupled, fault-isolated.
- Modules never import another module's `domain`, `repository`, `service`, or `event` packages — only the `Module.java` facade and exposed DTOs.

---

## Module dependency graph

```
                    ┌──────────┐
                    │   auth   │  ← used by everyone
                    └────┬─────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌──────────┐    ┌──────────┐    ┌──────────────┐
  │ property │◄───│ tenancy  │    │ notification │
  └─────┬────┘    └────┬─────┘    └──────▲───────┘
        │              │                  │
        ├──────────────┼──────────────────┤
        │              │                  │
        ▼              ▼                  │
  ┌──────────┐    ┌──────────┐    ┌───────┴───┐
  │ concern  │    │ payment  │    │   notice  │
  └─────┬────┘    └──────────┘    └───────────┘
        │
        ▼
  ┌──────────┐
  │discovery │
  └──────────┘
```

**Direct dependencies (synchronous facade calls):**
- Everyone → `auth` (current user lookup)
- `tenancy` → `auth` (provision tenants), `property` (rooms)
- `concern` → `tenancy`, `property` (which tenant, which property)
- `payment` → `tenancy`, `property` (rent amount, owner info)
- `notice` → `property`, `tenancy` (target audience)
- `discovery` → `property` (geo lookup)

**Event dependencies (async):**
- `notification` listens to: `PaymentCapturedEvent`, `PaymentFailedEvent`, `ConcernRaisedEvent`, `ConcernStatusChangedEvent`, `NoticePostedEvent`, `TenancyStartedEvent`, `RentDueEvent`, `RentOverdueEvent`
- `tenancy` listens to: `PaymentCapturedEvent` (updates `last_payment_at`)
- `property` listens to: `TenancyStartedEvent` (mark room occupied), `TenancyEndedEvent` (mark room available)

No cycles. Enforced by ArchUnit's `slices().beFreeOfCycles()` rule.

---

## Build order

Modules are best built in this order — each one depends only on what came before:

1. **`shared`** — base entity, exceptions, identity, money. ~2 hours.
2. **`config`** — Spring config (security, async, JPA, OpenAPI). ~2 hours.
3. **`auth`** — JWT, OTP, PIN. Foundation for everything else. **~1 weekend.**
4. **`property`** — properties, rooms, manager assignments. **~1 weekend.**
5. **`tenancy`** — wire to auth+property, tenancy lifecycle, due-date logic. **~1 weekend.** (Already partly built.)
6. **`notification`** — FCM integration, preferences, listener infrastructure. **~1 weekend.**
7. **`concern`** — tickets, status machine, photos to S3. **~1 weekend.**
8. **`notice`** — property notices, audience targeting. **~3 days.**
9. **`discovery`** — owner-curated listings, Google Places integration. **~1 weekend.**
10. **`payment`** — manual marking first, then Razorpay, then receipts. **~2 weekends.**

Total: ~9-10 weekends of focused solo work to a usable v1.

---

## Module: `shared`

Cross-cutting code used by every other module. Not a domain module — has no entities, no business logic.

### Subcomponents

| Type | Name | Responsibility |
|------|------|----------------|
| Class | `BaseEntity` | `@MappedSuperclass` providing `created_at` and `updated_at` audit fields via `AuditingEntityListener`. All persisted entities extend this. |
| Class | `AuditorProvider` | Implements `AuditorAware<UUID>`. Reads the current user from `SecurityContextHolder` for `created_by`/`updated_by` columns (added later when needed). |
| Exception | `BusinessException` | Base class for all expected exceptions. Carries a stable `code` field. |
| Exception | `NotFoundException` | 404 — resource doesn't exist. Code: `NOT_FOUND`. |
| Exception | `ValidationException` | 400 — bad input or business rule violation. Code: `VALIDATION_ERROR`. |
| Exception | `ForbiddenException` | 403 — caller doesn't have permission. Code: `FORBIDDEN`. |
| Class | `ErrorResponse` | Standard JSON error shape: `{code, message, fieldErrors, timestamp}`. |
| Class | `GlobalExceptionHandler` | `@RestControllerAdvice` — maps exceptions to HTTP responses. |
| Record | `UserPrincipal` | `(userId, phone, role)`. Populated by JWT filter, read by all controllers via `@AuthenticationPrincipal`. |
| Record | `Money` | Wraps `long paise`. Methods: `add`, `subtract`, `percentOf` (basis points), `formatRupees`. All money math goes through this. |

### Files (~12 files)
```
shared/
├── audit/
│   ├── BaseEntity.java
│   └── AuditorProvider.java
├── exception/
│   ├── BusinessException.java
│   ├── NotFoundException.java
│   ├── ValidationException.java
│   ├── ForbiddenException.java
│   ├── ErrorResponse.java
│   └── GlobalExceptionHandler.java
├── identity/
│   └── UserPrincipal.java
└── money/
    └── Money.java
```

---

## Module: `config`

Spring framework configuration. No domain logic, just wiring.

### Subcomponents

| Class | Responsibility |
|-------|----------------|
| `KhatiyanApplication` | Spring Boot entry point. Annotations: `@SpringBootApplication`, `@EnableJpaAuditing`, `@EnableAsync`, `@EnableScheduling`, `@EnableCaching`. |
| `JpaConfig` | Defines the `auditorProvider` bean. |
| `AsyncConfig` | Defines `taskExecutor` — bounded thread pool (5 core, 10 max, 50 queue). Wraps with `DelegatingSecurityContextExecutor` later for security propagation. |
| `SecurityConfig` | Spring Security setup. Wires JWT filter, defines public vs. authenticated endpoints, CORS rules. Stateless (no sessions). |
| `OpenApiConfig` | Swagger UI configuration. Available at `/swagger-ui.html`. |
| `Resilience4jConfig` | (Later) Circuit breaker / retry / timeout defaults for external calls. |
| `CacheConfig` | (Later) Cache region configurations once we have specific things to cache. |

### Files (~5 initial, ~7 eventually)
```
config/
├── AsyncConfig.java
├── JpaConfig.java
├── SecurityConfig.java
├── OpenApiConfig.java
└── (later) Resilience4jConfig, CacheConfig
```

---

## Module: `auth`

Authentication and user lifecycle. **Owns `User` and `OtpRequest` entities. Most-imported module.**

### Responsibilities
- Owner self-signup via phone + OTP
- Owner provisions tenants/managers (creates pending-activation users)
- First-login flow: phone → OTP → set PIN
- Daily login: phone + PIN → JWT
- PIN reset via OTP
- JWT issuance and validation
- Spring Security filter populating `UserPrincipal`
- OTP rate limiting

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `User` | Phone, full name, role, PIN hash, activation flags, credential version. Soft-deletable via `is_active`. |
| `UserRole` enum | `OWNER`, `MANAGER`, `TENANT`. |
| `OtpRequest` | Phone, hashed OTP, purpose, expiry, attempts counter, consumed timestamp. |
| `OtpPurpose` enum | `LOGIN`, `NEW_DEVICE`, `PIN_RESET`. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `UserRepository` | `findByPhoneAndActiveTrue`, `existsByPhoneAndActiveTrue` |
| `OtpRepository` | `findLatestUsable(phone, purpose, now)`, `countRecentRequests(phone, since)` |

### Services
| Service | Responsibility |
|---------|----------------|
| `AuthService` | Orchestrates registration, login, provisioning, PIN reset. Validates phone format. |
| `OtpService` | Generates 6-digit OTPs, hashes with BCrypt, enforces rate limits (3 per phone per 15 min), verifies. v1 logs OTP to console; later integrates with Firebase Auth or MSG91. |
| `PinService` | BCrypt hash and verify. Validates PIN format (6 digits, not weak like `123456`). |
| `JwtService` | Issues HS256-signed JWTs containing `(userId, phone, role, credentialVersion)`. Parses and validates incoming tokens. |

### Security
| Class | Responsibility |
|-------|----------------|
| `JwtAuthenticationFilter` | `OncePerRequestFilter` — extracts `Bearer` token from `Authorization` header, validates, populates `SecurityContextHolder` with `UserPrincipal`. Re-checks user is active and `credentialVersion` matches (so PIN reset invalidates old tokens). |

### Controllers
**`AuthController`** at `/api/v1/auth/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /owners/register` | Owner self-signup (phone + name) → OTP sent |
| `POST /otp/request` | Existing user requests login OTP |
| `POST /otp/verify` | Verify OTP → returns `{userId, mustSetPin}` |
| `POST /pin/set` | First-time PIN set after OTP → returns JWT |
| `POST /pin/login` | Daily phone + PIN login → returns JWT |
| `POST /pin/reset/request` | Request OTP for PIN reset |
| `POST /pin/reset/confirm` | Reset PIN with OTP → returns new JWT |

### DTOs
`RegisterOwnerRequest`, `RequestOtpRequest`, `VerifyOtpRequest`, `SetPinRequest`, `PinLoginRequest`, `ResetPinRequest`, `OtpVerifyResponse`, `TokenResponse`, `UserSummaryResponse`.

### Events (published)
| Event | When | Listeners |
|-------|------|-----------|
| `UserRegisteredEvent` | New owner self-registers OR new user provisioned | `notification` (welcome message — later) |
| `PinChangedEvent` | PIN reset or first-time set | `notification` (security audit alert — later) |

### Module facade
**`AuthModule`** exposes:
- `findById(userId): Optional<UserSummaryResponse>`
- `findByPhone(phone): Optional<UserSummaryResponse>`
- `provisionUser(phone, fullName, role, provisionedBy): UUID`

### Database tables
- `auth.users` — primary user table
- `auth.otp_requests` — OTP issuance log

### Migrations
- `V1001__create_users_and_otp.sql`

### External integrations
- v1: none (OTP printed to console)
- v2: Firebase Auth or MSG91 for SMS delivery

---

## Module: `property`

Properties, rooms, and the owner/manager relationships that scope everything else.

### Responsibilities
- Owner creates and manages one or more properties
- Each property has rooms with capacity and base rent
- Owner can assign managers to a property with scoped permissions
- Other modules query property/room info via the facade
- Listens to tenancy events to update room occupancy

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `Property` | Owned by a user (FK to `auth.users`). Name, address, city, pincode, lat/lng, type. |
| `PropertyType` enum | `PG`, `HOSTEL`, `APARTMENT`, `SOCIETY` (last one for future). |
| `Room` | Belongs to a property. Room number, floor, capacity, room type, base rent, active flag. |
| `RoomType` enum | `SINGLE`, `DOUBLE`, `TRIPLE`, `SHARED`. |
| `RoomStatus` enum | `VACANT`, `OCCUPIED`, `MAINTENANCE`. Derived from active tenancies + manual override. |
| `PropertyManager` | Join entity. Property + user + permissions array + audit timestamps. |
| `ManagerPermission` enum | `MANAGE_TENANTS`, `MANAGE_CONCERNS`, `MANAGE_PAYMENTS`, `MANAGE_NOTICES`, `MANAGE_LISTINGS`. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `PropertyRepository` | `findByOwnerId`, `existsByIdAndOwnerId` |
| `RoomRepository` | `findByPropertyIdAndIsActiveTrue`, `findVacantByPropertyId`, `existsByPropertyIdAndRoomNumber` |
| `PropertyManagerRepository` | `findActiveByPropertyId`, `findActiveByUserId`, `existsActiveAssignment` |

### Services
| Service | Responsibility |
|---------|----------------|
| `PropertyService` | CRUD on properties. Verifies caller is the owner. |
| `RoomService` | CRUD on rooms. Marks vacant/occupied based on tenancy events. Prevents deletion of occupied rooms. |
| `PropertyManagerService` | Add/remove managers. Validates the manager user exists and has `MANAGER` role. Provisioning a brand-new manager goes through `AuthModule.provisionUser` first. |
| `PropertyAuthorizationService` | Helper used by other modules: `canManageProperty(userId, propertyId)`, `isOwnerOf(userId, propertyId)`. |

### Listeners
| Listener | Reacts to |
|----------|-----------|
| `TenancyEventListener` | `TenancyStartedEvent` → mark room occupied. `TenancyEndedEvent` → mark room vacant. |

### Controllers
**`PropertyController`** at `/api/v1/properties/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Owner creates a new property |
| `GET /` | List properties owned/managed by current user |
| `GET /{id}` | Property details |
| `PATCH /{id}` | Update property (name, address) |
| `DELETE /{id}` | Soft-delete property (only if no active tenancies) |

**`RoomController`** at `/api/v1/properties/{propertyId}/rooms/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Add a room |
| `GET /` | List rooms (with occupancy status) |
| `GET /{roomId}` | Room details |
| `PATCH /{roomId}` | Update room (rent, capacity) |
| `DELETE /{roomId}` | Soft-delete (rejects if occupied) |

**`PropertyManagerController`** at `/api/v1/properties/{propertyId}/managers/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Add a manager — provisions a new user via `AuthModule` if needed |
| `GET /` | List active managers |
| `DELETE /{managerId}` | Remove a manager |

### DTOs
`CreatePropertyRequest`, `UpdatePropertyRequest`, `PropertyResponse`, `CreateRoomRequest`, `UpdateRoomRequest`, `RoomResponse`, `RoomWithOccupancyResponse`, `AddManagerRequest`, `ManagerResponse`.

### Events (published)
| Event | When | Listeners |
|-------|------|-----------|
| `PropertyCreatedEvent` | New property created | `notification` (welcome / setup nudges — later) |
| `RoomStatusChangedEvent` | Room marked occupied/vacant/maintenance | (none initially) |

### Module facade
**`PropertyModule`** exposes:
- `findById(propertyId): Optional<PropertyResponse>`
- `findRoom(roomId): Optional<RoomResponse>`
- `findByOwner(ownerId): List<PropertyResponse>`
- `findManagedBy(userId): List<PropertyResponse>` — for managers
- `markRoomOccupied(roomId)`, `markRoomVacant(roomId)` — called by tenancy event listener
- `canManageProperty(userId, propertyId): boolean`
- `isOwnerOf(userId, propertyId): boolean`

### Database tables
- `property.properties`
- `property.rooms`
- `property.property_managers`

### Migrations
- `V2001__create_properties.sql`
- `V2002__create_rooms.sql`
- `V2003__create_property_managers.sql`

---

## Module: `tenancy`

The link between users (tenants) and rooms in properties. Owns rent due day logic.

### Responsibilities
- Owner adds a tenant to a room (provisions the tenant user via `AuthModule`)
- Tenancy lifecycle: active → exited (with optional eviction)
- Per-tenant rent due day, anchored to check-in or owner-overridable
- Compute "next due date" for any active tenancy
- Owner can update tenant details (rent, deposit, due day)

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `Tenancy` | User + property + room + rent + deposit + due day + start/end dates + status. |
| `TenancyStatus` enum | `ACTIVE`, `EXITED`, `EVICTED`. |
| `ExitDetails` | Value object: end date, reason. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `TenancyRepository` | `findByUserIdAndActiveTrue`, `findByPropertyIdAndActiveTrue`, `existsActiveTenancy(userId, propertyId)`, `isRoomOccupied(roomId)` |

### Services
| Service | Responsibility |
|---------|----------------|
| `TenancyService` | Create, end, look up tenancies. Validates one-active-per-user, room availability. Coordinates with `AuthModule` (provision tenant) and `PropertyModule` (room lookup). |
| `RentDueDateCalculator` | Pure function: given `(rent_due_day, billing_period)`, returns the actual due date. Handles short months (`min(due_day, last_day_of_month)`). |
| `RentStatusService` | For a tenancy and billing period, computes whether rent is upcoming / due today / overdue / paid. Reads from `payment` module's facade for paid status. |

### Controllers
**`TenancyController`** at `/api/v1/tenancies/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Owner adds tenant: `(phone, fullName, propertyId, roomId, rent, deposit, startDate, dueDay?)` — provisions user, creates tenancy |
| `GET /me` | Tenant fetches their own active tenancy |
| `GET /{id}` | Look up by id (auth-scoped: tenant or property's owner/manager) |
| `GET /?propertyId=` | List active tenancies for a property |
| `PATCH /{id}` | Update rent / deposit / due day |
| `POST /{id}/end` | End tenancy with reason |

### DTOs
`CreateTenancyRequest`, `EndTenancyRequest`, `UpdateTenancyRequest`, `TenancyResponse`, `TenancyWithRentStatusResponse`.

### Events (published)
| Event | When | Listeners |
|-------|------|-----------|
| `TenancyStartedEvent` | New tenancy created | `property` (mark room occupied), `notification` (welcome push) |
| `TenancyEndedEvent` | Tenancy ended | `property` (mark room vacant), `notification`, `payment` (deposit refund flow — later) |

### Module facade
**`TenancyModule`** exposes:
- `findById(tenancyId): Optional<TenancyResponse>`
- `findActiveTenancyForUser(userId): Optional<TenancyResponse>`
- `findActiveTenanciesByProperty(propertyId): List<TenancyResponse>`
- `isUserTenantOfProperty(userId, propertyId): boolean`

### Database tables
- `tenancy.tenancies`

### Migrations
- `V3001__create_tenancies.sql` (already done)
- `V3002__add_fk_to_users_and_rooms.sql` — adds FKs once `auth` and `property` exist

---

## Module: `notification`

Centralized notification dispatch. Listens to events from other modules and delivers via FCM/SMS/in-app.

### Responsibilities
- Listen to events from other modules and convert to notifications
- Dispatch via FCM (push), SMS (critical fallback), in-app feed
- Per-user preference toggles
- Quiet hours (10 PM – 8 AM by default)
- Notification history accessible to users
- Idempotency to prevent duplicate sends

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `Notification` | User, type, title, body, data payload (JSON), status (queued/sent/failed), channels used, timestamps. |
| `NotificationType` enum | `RENT_DUE_SOON`, `RENT_DUE_TODAY`, `RENT_OVERDUE`, `RENT_PAID`, `CONCERN_RAISED`, `CONCERN_STATUS_CHANGED`, `NOTICE_POSTED`, `WELCOME`, `PIN_CHANGED`, etc. |
| `NotificationChannel` enum | `PUSH`, `SMS`, `IN_APP`. |
| `NotificationPreference` | User + per-type toggles + quiet hours overrides. |
| `UserDevice` | User + FCM token + device name + last seen. Multiple devices per user. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `NotificationRepository` | `findByUserIdOrderByCreatedAtDesc`, paginated; `markRead` |
| `PreferenceRepository` | `findByUserId`, `findByUserIdAndType` |
| `UserDeviceRepository` | `findActiveByUserId`, `findByFcmToken` |

### Services
| Service | Responsibility |
|---------|----------------|
| `NotificationService` | Public API used by listeners: `notifyUser(userId, type, payload)`. Resolves preferences, picks channels, dispatches via the channel-specific dispatchers, persists the record. |
| `FcmDispatcher` | Sends push via Firebase Cloud Messaging Admin SDK. Wrapped in Resilience4j retry + circuit breaker. |
| `SmsDispatcher` | Sends SMS via MSG91 or similar. Used only for critical events (severe overdue, security alerts). |
| `PreferenceService` | CRUD on user preferences. Defaults all-on for new users, except low-priority types. |
| `DeviceService` | Register/unregister devices, FCM token rotation. |
| `QuietHoursPolicy` | Decides whether to defer or skip a notification based on user's local time and preferences. |

### Listeners
Subscribed to events from other modules:

| Listener | Subscribes to | Action |
|----------|---------------|--------|
| `PaymentEventListener` | `PaymentCapturedEvent` → notify tenant + owner. `PaymentFailedEvent` → notify tenant. |
| `ConcernEventListener` | `ConcernRaisedEvent` → notify owner/managers. `ConcernStatusChangedEvent` → notify tenant. |
| `NoticeEventListener` | `NoticePostedEvent` → notify all targeted tenants. |
| `TenancyEventListener` | `TenancyStartedEvent` → welcome notification to tenant. |
| `RentReminderEventListener` | `RentDueEvent` (T-3, T-1, T-0) → reminder pushes. `RentOverdueEvent` → escalating reminders. |
| `AuthEventListener` | `UserRegisteredEvent` → welcome (owner only). `PinChangedEvent` → security alert. |

### Cron jobs
| Schedule | Job | Action |
|----------|-----|--------|
| Daily 11 AM IST | `RentReminderScheduler` | Iterates active tenancies; for each, computes today's status, fires `RentDueEvent` or `RentOverdueEvent` if newly transitioning. Uses `rent_reminders_sent` table for idempotency. |

### Controllers
**`NotificationController`** at `/api/v1/notifications/`:
| Endpoint | Purpose |
|----------|---------|
| `GET /` | Paginated list of current user's notifications |
| `POST /{id}/read` | Mark a notification as read |
| `POST /read-all` | Mark all as read |

**`PreferencesController`** at `/api/v1/notifications/preferences/`:
| Endpoint | Purpose |
|----------|---------|
| `GET /` | Get current user's notification preferences |
| `PATCH /` | Update preferences |

**`DeviceController`** at `/api/v1/notifications/devices/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Register an FCM token for the current device |
| `DELETE /{deviceId}` | Unregister a device |

### DTOs
`NotificationResponse`, `PreferencesDto`, `RegisterDeviceRequest`, `DeviceResponse`.

### Events (published)
| Event | When |
|-------|------|
| `RentDueEvent` | Cron emits when a tenancy crosses a due-date threshold |
| `RentOverdueEvent` | Cron emits when overdue threshold crossed |

### Module facade
**`NotificationModule`** exposes:
- `notify(userId, type, payload)` — direct API for modules that need to trigger ad-hoc notifications outside of events

(But events should be the primary mechanism.)

### Database tables
- `notification.notifications`
- `notification.preferences`
- `notification.user_devices`
- `notification.rent_reminders_sent` (cron idempotency)

### Migrations
- `V7001__create_notifications.sql`
- `V7002__create_preferences.sql`
- `V7003__create_user_devices.sql`
- `V7004__create_rent_reminders_sent.sql`

### External integrations
- **Firebase Cloud Messaging** (Admin SDK in backend, FCM client in mobile)
- **MSG91 or similar** for SMS (later)

---

## Module: `concern`

Tenant-raised tickets with status tracking and SLAs.

### Responsibilities
- Tenants create concerns with category, title, description, photos
- Owners/managers transition status with required notes
- Status changes captured in immutable history
- Compute staleness flag at query time (no scheduled job, dashboard derives it)
- Photos upload to S3 via presigned URLs (mobile uploads directly to S3, sends key to backend)

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `Concern` | Tenancy + category + title + description + status + priority + assigned manager + SLA timestamps. |
| `ConcernCategory` enum | `PLUMBING`, `ELECTRICAL`, `CLEANING`, `SECURITY`, `INTERNET`, `APPLIANCE`, `STRUCTURAL`, `OTHER`. |
| `ConcernStatus` enum | `OPEN`, `ACKNOWLEDGED`, `IN_PROGRESS`, `AWAITING_TENANT`, `DELAYED`, `RESOLVED`, `CLOSED`, `REOPENED`. |
| `ConcernPriority` enum | `NORMAL`, `URGENT`. Tenant can mark urgent (rate-limited, only after SLA breach). |
| `ConcernPhoto` | Concern + S3 key + upload timestamp. Multiple per concern. |
| `ConcernStatusHistory` | Append-only log: from-status, to-status, note, changed-by, timestamp, is-system-generated. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `ConcernRepository` | `findByPropertyIdWithAttentionFlag` (custom JPQL with `CASE` for staleness), `findByTenantId`, `findByIdAndPropertyId` |
| `ConcernHistoryRepository` | `findByConcernIdOrderByChangedAtAsc` |

### Services
| Service | Responsibility |
|---------|----------------|
| `ConcernService` | CRUD on concerns. Validates tenant owns the concern (for tenant actions) or is admin of the property (for status changes). Records history on every status change. |
| `ConcernStatusMachine` | Validates legal transitions (e.g. can't go from `CLOSED` to `IN_PROGRESS` directly). Throws if transition is invalid. |
| `StalenessCalculator` | Pure function: given a concern, returns `attention_flag` (`unattended` if `OPEN > 3 days`, `stalled` if `IN_PROGRESS > 5 days`, `normal` otherwise). |
| `PhotoUploadService` | Generates presigned S3 PUT URLs, validates uploaded keys exist in S3 before persisting. |

### Controllers
**`ConcernController`** at `/api/v1/concerns/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Tenant creates concern (after uploading photos to S3) |
| `GET /me` | Tenant lists their own concerns |
| `GET /?propertyId=` | Owner/manager lists concerns for property, sorted by attention flag |
| `GET /{id}` | Concern detail with full history |
| `POST /{id}/status` | Owner/manager changes status with required note |
| `POST /{id}/urgent` | Tenant marks as urgent (rate-limited) |
| `POST /{id}/withdraw` | Tenant withdraws their concern |

**`PhotoUploadController`** at `/api/v1/concerns/uploads/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /presign` | Returns `{uploadUrl, s3Key, expiresAt}` for direct mobile upload |

### DTOs
`CreateConcernRequest`, `ChangeStatusRequest`, `ConcernResponse`, `ConcernDetailResponse` (with history), `ConcernSummaryForDashboard`, `PresignResponse`.

### Events (published)
| Event | When | Listeners |
|-------|------|-----------|
| `ConcernRaisedEvent` | New concern created | `notification` (notify owner/managers) |
| `ConcernStatusChangedEvent` | Status transitions | `notification` (notify tenant) |

### Module facade
**`ConcernModule`** exposes:
- `findActiveConcernCountForProperty(propertyId): int` — for owner dashboard widgets
- `findConcernById(id): Optional<ConcernResponse>`

### Database tables
- `concern.concerns`
- `concern.concern_status_history`
- `concern.concern_photos`

### Migrations
- `V4001__create_concerns.sql`
- `V4002__create_concern_status_history.sql`
- `V4003__create_concern_photos.sql`

### External integrations
- **AWS S3** for photo storage

---

## Module: `notice`

Property-wide notice board. Owners post; tenants read.

### Responsibilities
- Owner/manager posts notices with optional expiry
- Notice can target whole property or specific rooms
- Tenants see active notices on their dashboard
- Notification fires on post

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `Notice` | Property + author + title + body + audience + expiry + active flag. |
| `NoticeAudience` enum | `ALL_TENANTS`, `SPECIFIC_ROOMS`. |
| `NoticeRoomTarget` | Join entity for `SPECIFIC_ROOMS` audience: notice + room id. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `NoticeRepository` | `findActiveByPropertyId`, `findActiveForTenant(tenancyId)` (joins with room targets) |

### Services
| Service | Responsibility |
|---------|----------------|
| `NoticeService` | CRUD. Validates author is owner/manager of property. Calculates active set (not expired, is_active=true). |

### Controllers
**`NoticeController`** at `/api/v1/notices/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Create notice |
| `GET /?propertyId=` | List notices for property (admin view, includes expired) |
| `GET /me` | Tenant's active notices for their tenancy |
| `GET /{id}` | Notice detail |
| `PATCH /{id}` | Update notice |
| `DELETE /{id}` | Soft-delete |

### DTOs
`CreateNoticeRequest`, `UpdateNoticeRequest`, `NoticeResponse`.

### Events (published)
| Event | When | Listeners |
|-------|------|-----------|
| `NoticePostedEvent` | New notice created | `notification` (push to targeted tenants) |

### Module facade
**`NoticeModule`** exposes:
- `findActiveNoticeCountForProperty(propertyId): int` — for dashboard

### Database tables
- `notice.notices`
- `notice.notice_room_targets`

### Migrations
- `V5001__create_notices.sql`
- `V5002__create_notice_room_targets.sql`

---

## Module: `discovery`

The neighborhood guide — owner-curated local listings + Google Places integration.

### Responsibilities
- Owner adds Tier-3 listings (press-walla, dabba service, etc.) with name, contact, distance bucket, landmark, notes, photo
- Tenants browse listings by category
- Backend integrates with Google Places API for Tier-1/Tier-2 listings (pharmacies, gyms, etc.)
- No in-app map; deep-links open Google Maps for directions
- Aggressive caching of Places API responses

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `LocalListing` | Property + category + name + phone + distance bucket + landmark + notes + photo S3 key. |
| `ListingCategory` enum | `PHARMACY`, `GROCERY`, `LAUNDRY_PRESS`, `HOSPITAL`, `GYM`, `TIFFIN_SERVICE`, `RESTAURANT`, `SALON`, `TAILOR`, `PLUMBER`, `ELECTRICIAN`, `STATIONERY`, `ATM_BANK`, `TRANSPORT`, `OTHER`, etc. (~25 total) |
| `DistanceBucket` enum | `AT_PROPERTY`, `UNDER_100M`, `UNDER_500M`, `UNDER_1KM`, `UNDER_2KM`, `OVER_2KM`. |
| `PlacesCacheEntry` | Cache key + JSONB payload + fetched/expires timestamps. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `LocalListingRepository` | `findByPropertyIdAndCategory`, `findActiveByProperty` |
| `PlacesCacheRepository` | `findByCacheKeyAndNotExpired` |

### Services
| Service | Responsibility |
|---------|----------------|
| `ListingService` | CRUD on owner-curated listings. Validates category enum. |
| `DiscoveryService` | Public API: given `(propertyId, category)`, returns merged response of owner-curated + Google Places results. |
| `GooglePlacesClient` | Wraps Places API calls. Resilience4j circuit breaker + retry + 6-hour TTL caching. Maps internal categories to Google `type` values. |
| `DistanceFormatter` | Converts `DistanceBucket` enum to display strings ("Less than 100m", etc.). |

### Controllers
**`DiscoveryController`** at `/api/v1/discovery/`:
| Endpoint | Purpose |
|----------|---------|
| `GET /?propertyId=&category=` | Merged owner-curated + Places results for tenant browsing |
| `GET /categories` | List available categories with display labels |

**`ListingController`** at `/api/v1/properties/{propertyId}/listings/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Owner adds listing |
| `GET /` | Owner views their property's listings |
| `PATCH /{listingId}` | Edit listing |
| `DELETE /{listingId}` | Soft-delete |

### DTOs
`CreateListingRequest`, `UpdateListingRequest`, `ListingResponse`, `DiscoveryResponse` (curated + places sections), `PlaceResponse` (with `directionsUrl` pre-built).

### Events (published)
| Event | When | Listeners |
|-------|------|-----------|
| `ListingCreatedEvent` | Owner adds listing | (none initially; future analytics) |

### Module facade
**`DiscoveryModule`** — minimal external surface, mostly self-contained. Possibly:
- `findListingCountForProperty(propertyId): int` — for dashboard

### Database tables
- `discovery.local_listings`
- `discovery.places_cache`

### Migrations
- `V6001__create_local_listings.sql`
- `V6002__create_places_cache.sql`

### External integrations
- **Google Places API (New)** — Nearby Search + Place Details

---

## Module: `payment`

Razorpay-based rent collection, with manual marking as a fallback.

### Responsibilities
- Manual payment marking by owner (cash / UPI / bank transfer with reference)
- Razorpay order creation, Checkout SDK on mobile
- Webhook handler — single source of truth for payment status
- Webhook signature verification, idempotency on `razorpay_payment_id`
- Receipt PDF generation, S3 upload, public verification URL
- Late payment penalty calculation
- Daily reconciliation cron (catches missed webhooks)
- Per-user rate limiting on payment endpoints
- Circuit breaker on Razorpay calls

### Domain
| Entity / VO | Description |
|-------------|-------------|
| `Payment` | Tenancy + property + tenant + payment type + billing period + amounts + Razorpay IDs + method + status + receipt key + audit timestamps. |
| `PaymentStatus` enum | `CREATED`, `ATTEMPTED`, `CAPTURED`, `FAILED`, `REFUNDED`. |
| `PaymentType` enum | `RENT`, `DEPOSIT`, `PENALTY`, `OTHER`. |
| `PaymentMethod` enum | `UPI`, `CARD`, `NETBANKING`, `WALLET`, `CASH`, `BANK_TRANSFER`, `OTHER`. |
| `Receipt` | Payment + receipt number + S3 key + verification URL. |
| `IdempotencyRecord` | Key + endpoint + user + request hash + cached response. |
| `PenaltyPolicy` | Per-property: grace period days + penalty type (`FLAT` or `PERCENTAGE`) + amount/rate. |

### Repositories
| Repository | Key methods |
|------------|-------------|
| `PaymentRepository` | `findByRazorpayOrderId`, `findCapturedForPeriod(tenancyId, period)`, `findByTenancyIdOrderByCreatedAtDesc`, `existsCapturedFor` |
| `ReceiptRepository` | `findByPaymentId` |
| `IdempotencyRepository` | `findByKeyAndEndpoint` |
| `PenaltyPolicyRepository` | `findByPropertyId` |

### Services
| Service | Responsibility |
|---------|----------------|
| `PaymentService` | Orchestration: create order, mark captured (from webhook), mark manually paid, refund. Handles idempotency. |
| `RazorpayClient` | Wraps Razorpay SDK. Circuit breaker + retry + timeout via Resilience4j. |
| `WebhookProcessor` | Verifies signature, looks up payment, updates status atomically, publishes `PaymentCapturedEvent`. |
| `WebhookSignatureVerifier` | HMAC-SHA256 verification of Razorpay webhook signatures. |
| `ReceiptService` | Generates PDF (HTML + Flying Saucer or similar), uploads to S3, builds verification URL. |
| `PenaltyCalculator` | Given `(tenancy, billing_period, today)`, returns penalty amount based on property's `PenaltyPolicy`. |
| `ReconciliationService` | Daily cron: fetches all Razorpay payments from last 24h, ensures every captured payment exists in DB. Logs and recovers anomalies. |
| `PaymentRateLimiter` | Bucket4j-backed: 5 create-order requests per user per minute, 20 per hour. |

### Controllers
**`PaymentController`** at `/api/v1/payments/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /orders` | Create Razorpay order. Requires `Idempotency-Key` header. Rate-limited. |
| `POST /manual` | Owner records a manual payment (cash, etc.) |
| `GET /me` | Tenant's payment history |
| `GET /?propertyId=` | Owner's view: all payments for a property |
| `GET /{id}/receipt` | Get receipt URL (cached) |
| `POST /{id}/refund` | Initiate refund (owner action) |

**`RazorpayWebhookController`** at `/api/v1/webhooks/razorpay/`:
| Endpoint | Purpose |
|----------|---------|
| `POST /` | Receives webhook events from Razorpay. Verifies signature, processes, returns 200 fast. |

**`ReceiptVerificationController`** at `/api/v1/receipts/verify/`:
| Endpoint | Purpose |
|----------|---------|
| `GET /{receiptNumber}` | Public endpoint — verifies a receipt is genuine. Returns minimal info. Used by QR codes on receipts. |

### DTOs
`CreateOrderRequest`, `OrderResponse` (includes Razorpay key + order id for mobile to open Checkout), `MarkPaidRequest`, `PaymentResponse`, `ReceiptResponse`, `RefundRequest`, `RazorpayWebhookPayload` (parsed shape).

### Events (published)
| Event | When | Listeners |
|-------|------|-----------|
| `PaymentCapturedEvent` | Webhook captures a payment OR owner marks manually paid | `notification` (notify tenant + owner), `tenancy` (update last_payment_at), payment's own listener (generate receipt) |
| `PaymentFailedEvent` | Webhook reports failed payment | `notification` |
| `ReceiptGeneratedEvent` | Receipt PDF created and uploaded | `notification` (push with download link) |
| `RefundProcessedEvent` | Refund completed | `notification` |

### Listeners (within payment module — own events)
| Listener | Reacts to |
|----------|-----------|
| `ReceiptGenerationListener` | `PaymentCapturedEvent` → generates receipt async (after commit) |

### Cron jobs
| Schedule | Job | Action |
|----------|-----|--------|
| Daily 2 AM IST | `ReconciliationService.runDailyReconciliation()` | Fetch Razorpay payments, cross-check with DB, alert on mismatches |

### Module facade
**`PaymentModule`** exposes:
- `findLastCapturedPaymentForTenancy(tenancyId): Optional<PaymentResponse>` — for tenancy module's status display
- `existsCapturedForPeriod(tenancyId, billingPeriod): boolean` — for rent status

### Database tables
- `payment.payments`
- `payment.receipts`
- `payment.idempotency_keys`
- `payment.penalty_policies`

### Migrations
- `V8001__create_payments.sql`
- `V8002__create_receipts.sql`
- `V8003__create_idempotency_keys.sql`
- `V8004__create_penalty_policies.sql`

### External integrations
- **Razorpay** — order creation, webhooks, refunds
- **AWS S3 + CloudFront** — receipt PDF storage and serving

---

## Cross-cutting concerns

These don't belong to a single module but affect all of them.

### Authentication & authorization
- JWT issued by `auth`, validated by `JwtAuthenticationFilter`
- `UserPrincipal` available in every controller via `@AuthenticationPrincipal`
- Role-based gates: `@PreAuthorize("hasRole('OWNER')")` where appropriate
- Cross-property isolation enforced in services: every method that touches property-scoped data takes a `propertyId` and verifies the caller has access via `PropertyModule.canManageProperty(...)`

### Idempotency
- Mutating endpoints accept an `Idempotency-Key` header
- Stored per (key, endpoint) tuple with the cached response
- 7-day TTL, cleanup cron later

### Rate limiting
- Bucket4j-backed
- OTP requests: 3 per phone per 15 minutes
- PIN login: 5 wrong attempts per phone per 15 minutes (then OTP-required reset)
- Payment create-order: 5 per user per minute, 20 per hour

### Logging
- Structured JSON logs in production via Logback
- Every log line includes request trace id, user id (if authenticated), property id (if scoped)
- No PII in log messages (no full names, phones, OTPs)
- Slow queries logged at WARN

### Monitoring
- Spring Boot Actuator: `/actuator/health`, `/actuator/metrics`, `/actuator/prometheus`
- Sentry for backend exceptions
- Sentry for mobile crashes

### Time and money
- All `TIMESTAMPTZ` in DB, `Instant` in Java
- Crons scheduled with explicit `zone = "Asia/Kolkata"`
- Money always `long paise`, never float; `Money` value object for arithmetic

### Auditing
- All entities extend `BaseEntity` → automatic `created_at` and `updated_at`
- Add `created_by` / `updated_by` columns once `auth` is in place
- Domain-significant changes logged in dedicated history tables (e.g. `concern_status_history`)

---

## Roadmap and future modules

Out of scope for v1 but worth noting:

| Module / feature | When | Notes |
|------------------|------|-------|
| **Apartment-society features** | v2 | Visitor management, society-wide notices with voting, common-area bookings. Different business model. |
| **Web admin panel** | v2 | React + Vite. Uses same backend. For owners with many properties who want a desktop view. |
| **Multi-property tenants** | v2 | Currently one-active-tenancy-per-user. Some tenants legitimately have multiple. |
| **Tenant reputation** | v3 | Cross-property reputation score (paid on time, no concerns). Network effect feature. |
| **Refresh tokens** | v2 | Currently single-token. Add refresh tokens for longer-lived sessions. |
| **Account lockout** | v2 | Add login throttling plus durable PIN profile lock. After a strict failed-attempt threshold, block PIN login and force PIN reset through OTP/Firebase verification. |
| **Device trust** | v2 | Track devices, require OTP on new device even with PIN. |
| **HRA receipts with PAN** | v2 | Tenants need landlord PAN on receipts >₹1L/year for tax. |
| **Deposit refund flow** | v2 | Itemized deductions, refund tracking via manual entry. |
| **Tenant suggestions to listings** | v3 | Crowdsourced discovery with owner approval queue. |
| **Multi-language** | v3 | Hindi, Bengali, Tamil, Telugu translations. |
| **Public API for partners** | v3 | Aggregator integrations (NoBroker, Stanza Living). |
| **Tenant-to-tenant messaging** | maybe never | High abuse risk, low value vs. WhatsApp. |

---

## Document conventions

- This document is the source of truth for module scope and API design
- When scope changes, update this document first, then build
- Every module section follows the same structure (Responsibilities → Domain → Repositories → Services → Controllers → DTOs → Events → Facade → Database → Migrations → External integrations)
- Module names are lowercase singular (`tenancy` not `tenancies`)
- Class names follow Spring conventions (`TenancyService`, `TenancyController`, `TenancyModule`)
- All endpoints under `/api/v1/`
- All event class names are past tense (`TenancyStartedEvent`, never `StartTenancyEvent`)
