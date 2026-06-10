# Khatiyan Future Feature Targets

This note captures future product ideas and feature discussions so they can be revisited without losing the thinking behind them.

## Product Direction

Khatiyan should grow from a PG-focused operations app into a broader rental living and operations platform.

The long-term product shape is:

- PG and hostel operations first.
- Tenant living workspace.
- Owner operations dashboard.
- Two-sided property discovery marketplace.
- Flat and house rental support.
- Utility and electricity consumption tracking.
- Chat and owner-user communication layer.

## Owner Dashboard Gap

The owner side currently has module destinations and navigation cards, but it is missing the dashboard intelligence layer.

Current owner screen behavior:

- Shows portfolio, tenancy, billing, concerns, notices, discovery, and manager areas as cards.
- Acts more like a module launcher.
- Does not yet provide a live summary of what is done, pending, or urgent.

Target owner dashboard behavior:

- Show what happened.
- Show what needs attention.
- Show what is already done.
- Show what the owner can do next.
- Let every alert or metric drill into the relevant workflow.

Important dashboard sections:

- Portfolio snapshot: property count, active tenants, occupied rooms/beds, vacant rooms/beds.
- Money snapshot: billed this month, collected, pending, overdue.
- Needs attention: overdue rent, escalated concerns, pending exits, upcoming exits, unresolved onboarding.
- Concern queue: open, assigned, escalated, resolved this week.
- Quick actions: add property, add room, provision tenant, publish notice, create board item.
- Recent activity: tenant added, payment recorded, concern resolved, notice published.

Example dashboard metrics:

- Active tenants.
- Vacant beds.
- Rent collected this month.
- Overdue rent.
- Open concerns.
- Escalated concerns.
- Tenants on notice.
- Pending exit settlements.
- Published notices.
- Recent payments.
- Upcoming billing cycle starts.

## Tenant Requirement Marketplace

Khatiyan should eventually make property finding a two-sided effort.

Today most rental discovery is owner listing first. The future marketplace should also let non-tenant users publish what they need, so owners can discover demand and respond.

Core idea:

- User posts a tenancy requirement.
- Owner sees matching requirements.
- Owner presses connect.
- System records the owner response.
- Chat opens between owner and user.
- User can see how many responses their requirement received.

Suggested entities:

### Tenant Requirement

- User ID.
- City and area.
- Budget min and max.
- Move-in date.
- Stay type.
- Room type.
- Food preference.
- Notes.
- Visibility status: active, paused, expired.
- Created, updated, and expiry timestamps.

### Tenant Requirement Response

- Requirement ID.
- Owner ID.
- Optional property ID.
- Chat thread ID.
- Created timestamp.
- Unique constraint on requirement ID plus owner ID.

Important behavior:

- No duplicate responses from the same owner for the same requirement.
- If owner presses connect again, return the existing response and open the same chat thread.
- User requirement card should show response count.
- Owner view should show either Connect or Open chat depending on whether the owner already responded.

## Profile Visibility

Users should be able to control whether their profile is visible for owner-side provisioning and future marketplace discovery.

Target behavior:

- User can toggle profile visibility on or off.
- Hidden users should not appear in owner-side user search or marketplace discovery.
- Visibility should be consent-driven and easy to understand.

Possible future fields:

- Profile visibility status.
- Visible to owners.
- Marketplace visibility.
- Last visibility change timestamp.

## Chat Feature

Chat can begin as a clean module in the current backend, but should be designed so it can move into a separate backend later.

Reason:

- Chat has different scaling needs.
- It may need websockets, unread counts, attachments, moderation, and push routing.
- Marketplace response data belongs in Khatiyan, but message delivery can later move out.

Design principle:

- Store business interaction records in Khatiyan.
- Keep chat APIs clean and loosely coupled.
- Use IDs and events rather than deep direct database coupling.

## Flat Rental Expansion

Khatiyan should not remain PG-only.

Future supported property types:

- PG.
- Hostel.
- Flat.
- House.
- Co-living.

Modeling direction:

- Property type should drive whether room, bed, or whole-unit tenancy applies.
- Tenancy can attach to room, bed, or full property/unit depending on type.
- Billing should support rent, deposit, utilities, maintenance, penalties, discounts, and adjustments.
- Notices, concerns, billing, documents, and discovery should work across PG and flat rentals.

## Electricity And Utilities

Electricity consumption tracking is a future utility module inspired by apps that show room-level consumption.

This should depend on owner configuration during property creation or later property setup.

Possible electricity setups:

- Included in rent.
- Common meter split.
- Separate room or unit meter.
- Manual meter reading.
- Smart meter integration later.

Possible entities:

- Meter.
- Meter assignment to property, room, bed, or unit.
- Meter reading.
- Reading proof/photo.
- Utility tariff.
- Utility bill line item.

Tenant view should eventually show:

- Current consumption.
- Estimated charge.
- Previous month comparison.
- Utility bill history.

Owner view should eventually support:

- Meter setup.
- Reading entry.
- Bill generation.
- Utility charge attachment to billing cycle.

## Owner Management Gaps

Apart from staff and manager management, owner-side gaps include:

- Real owner dashboard.
- Tenant onboarding flow.
- Room and bed occupancy view.
- Billing collection operations.
- Expense and profit tracking.
- Documents and verification.
- Property setup depth.
- Reports and exports.
- Exit and deposit settlement.
- Communication and broadcast workflows.

Priority owner-side targets:

1. Owner dashboard.
2. Tenant onboarding.
3. Room and bed occupancy.
4. Billing collection operations.
5. Documents and verification.
6. Exit and deposit settlement.
7. Reports.

### Missing Feature Checklist

#### 1. Owner Dashboard

- Live portfolio summary: property count, active tenants, occupancy, vacancies.
- Money snapshot: billed, collected, pending, overdue.
- Needs-attention queue: overdue rent, escalated concerns, pending exits, onboarding issues.
- Concern summary: open, assigned, escalated, resolved this week.
- Exit summary: tenants on notice, upcoming exits, settlement pending.
- Recent activity feed: tenancy created, payment received, concern resolved, notice published.
- Quick actions: add property, add room, provision tenant, publish notice, create board item.
- Drill-down links from every metric or alert to the relevant workflow.

#### 2. Tenant Onboarding

- Owner-side tenant provisioning wizard.
- Tenant lookup by phone.
- Existing user detection.
- New user invite/provisioning flow.
- Property, floor, room, and bed selection.
- Vacancy and capacity validation.
- Tenancy terms form: billing type, start date, rent, deposit.
- Billing collection timing and grace-day setup where applicable.
- Basic document checklist.
- First bill and deposit preview before confirmation.
- Review and confirm step.
- Success state linking to tenancy, room, billing, and tenant profile.
- Notification to tenant after successful provisioning.

#### 3. Room And Bed Occupancy

- Property -> floor -> room -> bed occupancy view.
- Room status: available, occupied, full, maintenance, inactive.
- Bed-level status where PG/hostel setup needs it.
- Tenant name and tenancy status per occupied room/bed.
- Vacant bed count and room capacity indicators.
- Leaving-soon or on-notice indicator.
- Quick room transfer flow.
- Room maintenance/reservation handling.
- Filters by property, floor, status, rent range, and room type.
- Bulk room creation and editing support.

#### 4. Billing Collection Operations

- Owner view of all open billing cycles.
- Pending, overdue, paid, partially paid, waived, and cancelled states.
- Mark payment collected manually.
- Partial payment support.
- Payment proof upload or reference capture.
- Add extra charges.
- Add discounts or waivers.
- Late fee visibility and recalculation.
- Deposit adjustments linked to billing lines.
- Tenant ledger view.
- Receipt generation or downloadable receipt.
- Overdue list with reminder actions.
- Collection summary by property and month.

#### 5. Documents And Verification

- Tenant document upload placeholders and later full upload.
- Aadhaar, PAN, agreement, and emergency contact records.
- Police verification status.
- Document status: missing, pending review, verified, rejected.
- Owner review UI for uploaded documents.
- Rejection reason and resubmission flow.
- Tenant profile completeness score.
- Document expiry or renewal tracking where needed.
- Agreement generation or agreement file storage.
- Permission rules so documents are visible only to authorized owner/manager and tenant.

#### 6. Room Change Requests

- Tenant raises a room change request by selecting floor and target room.
- Request stores target room, current room, current tenancy, current billing cycle, reason, and requested-at timestamp.
- Current room cannot be selected as target room.
- Target room availability is evaluated from occupancy and room status.
- Request can be raised and approved on any day.
- Execution is always scheduled for the last day of the current billing cycle.
- Execution must happen before the next billing cycle is generated so the next cycle snapshots the new room and new rent.
- Approval does not immediately transfer the tenant; it only authorizes the pending transfer.
- Notifications for request creation, approval, rejection, and execution.
- Request history remains tenancy-derived.

#### 7. Exit And Deposit Settlement

- Owner queue for pending exit requests.
- Normal notice vs premature notice visibility.
- Planned exit date and requested checkout date.
- Review latest billing cycle before approval.
- Final bill amount entry or calculation.
- Deposit payable decision.
- Deposit deduction and settlement amount.
- Refund tracking.
- Approval and rejection notes.
- Room/bed release after exit execution.
- Tenant archive/history after exit.
- Settlement summary shown to tenant.
- Notifications for approval, rejection, execution, and settlement.

#### 8. Reports

- Occupancy report.
- Rent collection report.
- Pending dues report.
- Overdue rent report.
- Deposit ledger report.
- Tenant history report.
- Concern resolution report.
- Exit and settlement report.
- Property-wise performance report.
- Month-wise income report.
- Expense/profit report later.
- Export CSV/PDF.
- Date range and property filters.
- Basic visual summaries for dashboard and detailed downloadable reports for records.

## Admin Frontend First Target

When work starts on the admin/owner-side frontend, the first major implementation target should be the tenant provisioning onboarding flow.

Reason:

- Backend tenancy provisioning already has important foundations.
- Owner UI currently only exposes this as a placeholder card.
- This flow unlocks real property operations because it connects users, rooms, rent, deposit, billing, and tenant workspace activation.

Target v1 flow:

1. Tenant lookup or creation by phone.
2. Property and room/bed selection.
3. Tenancy terms: billing type, start date, rent, deposit.
4. Basic document/checklist placeholders.
5. Billing preview.
6. Review and confirm.
7. Success state with links to tenancy, room, and billing.

## Guiding Principle

Do not build every future feature immediately.

Build the core modules with flexible boundaries so future marketplace, chat, flat rentals, and utilities can plug in without rewriting the foundation.
