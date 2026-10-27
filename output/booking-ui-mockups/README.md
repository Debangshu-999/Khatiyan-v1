# Booking UI mockups

Created 7 October 2026 for design review, using the built-in image-generation tool.
These are raster screen designs, not an implemented booking module or working app.

Open `index.html` to browse the set at phone size and enlarge each screen.
Individual PNG files are numbered in flow order. The gallery selects the reviewed
versions; earlier variants are retained in `drafts/`. `prompts.json` records the exact
generation prompts, screen coverage and any review notes.

This is a mobile light-theme set. Sample people, contacts, photographs and dates
are fictional design data. Some images show alternative states of the same
example booking, rather than a single continuous real record.

## Design language

Pure white screens; navy and ochre two-tone headings; Plus Jakarta Sans-style
display type; Inter-style body type; outlined cards; grey inputs and status pills;
blue primary actions; red cancellation controls; blue/yellow notices; fixed bottom
actions; and full-width draggable bottom sheets. No back-button circles, header
artwork or blue header gradients.

## Coverage

- 01–06: personal details, direct room choice, type/occupancy filtering, future
  vacancy and move-in date, rent/agreement terms, review and submission.
- 07–12: tenant booking lists, pending request, negotiable offer, final offer,
  confirmation and expired history.
- 13–15: property booking workspace, handler review, owner-only access/assignment.
- 16–20: tenant counter, handler counter/final offer, management cancellation,
  tenant cancellation and acceptance confirmation sheets.
- 21–25: tenant/property empty states, no bookable rooms, loading skeleton and
  stale-offer recovery.

## Product rules preserved

- A tenant can raise a booking only after an attended visit, within its 30-day
  post-visit window. Owners cannot create a request for them.
- Move-in is 7–21 days after the original submission date, inclusive. For the
  sample request date, 7 October 2026, that is 14–28 October.
- A future vacancy must be a confirmed, no-longer-reversible exit. Move-in is
  strictly after its checkout. A 16 October exit gives a 17 October minimum.
- One bed is held on submission, not merely when browsing a room. Unresolved
  requests expire after seven days; counters do not reset that clock.
- Monthly rent can use the listed rate or a tenant proposal. Indefinite or
  definite 1–11-month agreements follow the property's existing rules.
- A negotiable offer allows accept/counter/cancel. A final offer allows only
  accept/cancel. Acceptance confirms directly, without another approval stage.
- Owner/assigned handler can act; other authorised managers are read-only.
  Opening a detail deliberately can claim first-view assignment; fetching lists
  must not. System-turn assignment is the alternative.
- Management cancellation requires a reason. Expired/cancelled records remain
  in history and release the hold. Confirmed requests retain their bed hold.
- Confirmed booking is not tenancy activation, billing or agreement signature.

## Shared variants and implementation handoff

The screens illustrate the layouts, rather than exhaustively repeating every
possible data combination. Reuse the same design for cancelled history (display
actor/reason), final offers at the listed rate, owner history filters, live versus
future rooms, indefinite terms and manager read-only detail. A non-handler manager
must not see live accept/counter/cancel controls. If post-visit eligibility has
ended, hide Request again. Permission/network failures should use the existing
app error/notice patterns, not be confused with an empty list.

The four-step form organisation is a proposed presentation for review. The
booking rules come from the current implementation plan, not an implemented API.
Raster text, icon shapes and spacing should be rebuilt with the existing shared
components during implementation; these files are not pixel-perfect code specs.

Token payments, rent collection, Razorpay, financial booking settings, additional
advance-duration settings and tenancy-onboarding handoff are intentionally not
designed in this version. No existing plan, migration or application code is
changed by this design set.
