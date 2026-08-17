import {
  RE_RAISE_WINDOW_DAYS,
  type TenancyExitRequest,
  type TenancyExitRequestStatus,
  type TenancyRoomChangeRequest,
} from "@/store/services/tenancy-api";

/**
 * A re-raise and everything it replaces, newest first.
 *
 * <p>A rejected or expired request that the tenant raises again is the same
 * intent expressed twice, not two unrelated requests. Shown flat, an owner sees
 * "three exit requests" from one tenant and loses the fact that the notice clock
 * still runs from the *first* one.
 */
export type ExitRequestChain = {
  /** The newest request — the one whose status is live. */
  head: TenancyExitRequest;
  /** Newest first, including the head. Length 1 when nothing was re-raised. */
  links: TenancyExitRequest[];
};

/**
 * Groups requests into chains by walking `supersededRequestId` backwards.
 *
 * <p>Chains are found from their heads: a request nobody supersedes is a head,
 * and everything reachable from it through the link field belongs to it. That
 * ordering falls out of the data rather than out of timestamps, so it stays
 * right even if two requests share a creation second.
 */
export function buildExitRequestChains(requests: TenancyExitRequest[]): ExitRequestChain[] {
  const byId = new Map(requests.map((request) => [request.id, request]));
  const superseded = new Set(
    requests.map((request) => request.supersededRequestId).filter((id): id is string => id != null),
  );

  return requests
    .filter((request) => !superseded.has(request.id))
    .map((head) => {
      const links: TenancyExitRequest[] = [];
      // Guard against a cycle in the link field. The DB forbids self-reference
      // and the service only ever points at an older row, but a render loop is
      // a worse failure than a truncated chain.
      const seen = new Set<string>();
      let current: TenancyExitRequest | undefined = head;

      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        links.push(current);
        current = current.supersededRequestId ? byId.get(current.supersededRequestId) : undefined;
      }

      return { head, links };
    })
    .sort(
      (left, right) =>
        new Date(right.head.updatedAt ?? right.head.createdAt).getTime()
        - new Date(left.head.updatedAt ?? left.head.createdAt).getTime(),
    );
}

/**
 * Who a step came from.
 *
 * <p>Drives which side of the timeline rail it sits on. SYSTEM covers the things
 * neither party did — a scheduled execution, a request lapsing unreviewed — and
 * renders down the middle, because attributing "nobody acted" to a side would be
 * editorialising.
 */
export type RequestActor = "TENANT" | "MANAGEMENT" | "SYSTEM";

/** One dated step in a request's life, newest first. */
export type RequestTimelineStep = {
  at: string;
  label: string;
  /**
   * Extra context. Deliberately NOT the approval or rejection reason — those
   * live on the request card behind an info control, and repeating them in the
   * history turns a scannable sequence of events into a wall of prose.
   */
  detail: string | null;
  actor: RequestActor;
  /** Who did it, by name, where we know. */
  actorName?: string | null;
};

/**
 * The steps a single request went through.
 *
 * <p>A withdrawal is a transition on the same row rather than a new request, so
 * it belongs on this timeline rather than in the chain above. Between them the
 * two levels tell the whole story: the chain says "asked three times", the
 * steps say what happened to each attempt.
 */
export function exitRequestTimeline(
  request: TenancyExitRequest,
  /** When this request was raised again, if it was. Ends the entry differently. */
  reRaisedAt?: string | null,
): RequestTimelineStep[] {
  const steps: RequestTimelineStep[] = [];

  // Newest first, so an entry's ending goes at the top.
  //
  // An approved request ends when it executes. A rejected one has no such
  // moment — rejection is a decision, not an ending, because the tenant may
  // raise it again on the original notice anchor. It ends either by being
  // re-raised, or by that window closing and the request finally dying. Without
  // this, a rejected request just stops mid-sentence while an approved one gets
  // a proper close.
  if (reRaisedAt) {
    steps.push({
      actor: "TENANT",
      at: reRaisedAt,
      detail: "Raised again, keeping the original notice date.",
      label: "Re-raised",
    });
  } else {
    const closedAt = reRaiseWindowClosedAt(request);
    if (closedAt) {
      steps.push({
        actor: "SYSTEM",
        at: closedAt,
        detail: "The window to raise this again has closed.",
        label: "Request expired",
      });
    }
  }

  if (request.withdrawalDecidedAt) {
    const allowed = request.status === "CANCELLED";
    steps.push({
      actor: "MANAGEMENT",
      at: request.withdrawalDecidedAt,
      actorName: request.withdrawalDecidedByName,
      detail: null,
      label: allowed ? "Withdrawal allowed — staying on" : "Withdrawal refused — exit stands",
    });
  }

  if (request.withdrawalRequestedAt) {
    steps.push({
      actor: "TENANT",
      actorName: request.tenantName,
      at: request.withdrawalRequestedAt,
      detail: null,
      label: "Asked to cancel the exit",
    });
  }

  if (request.executedAt) {
    // The scheduler runs this on the checkout date; nobody clicks it.
    steps.push({ actor: "SYSTEM", at: request.executedAt, detail: null, label: "Tenancy ended" });
  }

  if (request.decidedAt) {
    steps.push({
      actor: "MANAGEMENT",
      actorName: request.decidedByName,
      at: request.decidedAt,
      detail: null,
      label: request.status === "REJECTED" ? "Rejected" : "Approved",
    });
  }

  // Expiry has no decision timestamp — nobody decided anything, which is the
  // whole point of the state — so it is dated by the row's last change.
  if (request.status === "EXPIRED") {
    steps.push({
      actor: "SYSTEM",
      at: request.updatedAt,
      detail: "Nobody reviewed it in time. Your notice still counts from when you first asked.",
      label: "Expired unreviewed",
    });
  }

  steps.push({
    actorName: request.tenantName,
    actor: "TENANT",
    at: request.createdAt,
    detail: null,
    label: "Requested",
  });

  return steps;
}

/** Tone for a status pill. Tint and caps label only — no dots. */
export function exitStatusTone(status: TenancyExitRequestStatus) {
  if (status === "APPROVED" || status === "EXECUTED") {
    return "success" as const;
  }
  if (status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED") {
    return "warning" as const;
  }
  // WITHDRAWAL_REQUESTED sits with REQUESTED: both are awaiting a decision.
  return "neutral" as const;
}

/**
 * One request's worth of history, ready to render.
 *
 * <p>A re-raised exit contributes several of these — the newest first, each with
 * its own steps — while a room change contributes exactly one. The sheet does
 * not need to know which it is looking at.
 */
export type TimelineEntry = {
  id: string;
  status: string;
  /** A one-line fact worth repeating at the top, e.g. the agreed last day. */
  headline: string | null;
  steps: RequestTimelineStep[];
};

/** Timeline entries for an exit request and everything it re-raises. */
export function exitTimelineEntries(chain: ExitRequestChain): TimelineEntry[] {
  return chain.links.map((request, index) => ({
    headline: request.approvedCheckoutDate ? `Last day ${request.approvedCheckoutDate}` : null,
    id: request.id,
    status: request.status,
    // links are newest-first, so the entry before this one is its successor —
    // the request that re-raised it.
    steps: exitRequestTimeline(request, index > 0 ? chain.links[index - 1].createdAt : null),
  }));
}

/**
 * Timeline entries for a room change — always a single entry.
 *
 * <p>Room changes have no re-raise carve-out, so there is no chain to walk: a
 * refused request is simply asked again as a new one.
 */
export function roomChangeTimelineEntries(request: TenancyRoomChangeRequest): TimelineEntry[] {
  const steps: RequestTimelineStep[] = [];

  if (request.executedAt) {
    steps.push({ actor: "SYSTEM", at: request.executedAt, detail: null, label: "Room changed" });
  }
  if (request.decidedAt) {
    steps.push({
      actorName: request.decidedByName,
      actor: "MANAGEMENT",
      at: request.decidedAt,
      detail: null,
      label: request.status === "REJECTED" ? "Rejected" : "Approved",
    });
  }
  if (request.status === "EXPIRED") {
    steps.push({
      actor: "SYSTEM",
      at: request.updatedAt,
      detail: "Nobody reviewed it in time. You can ask again.",
      label: "Expired unreviewed",
    });
  }
  steps.push({
    actorName: request.tenantName,
    actor: "TENANT",
    at: request.createdAt,
    detail: null,
    label: "Requested",
  });

  return [
    {
      headline: `Transfer date ${request.effectiveTransferDate}`,
      id: request.id,
      status: request.status,
      steps,
    },
  ];
}

/** Tone for a room change status pill. */
export function roomChangeStatusTone(status: TenancyRoomChangeRequest["status"]) {
  if (status === "APPROVED" || status === "EXECUTED") {
    return "success" as const;
  }
  if (status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED") {
    return "warning" as const;
  }
  return "neutral" as const;
}

/**
 * Flattens a set of entries into one chronological run of steps, newest first.
 *
 * <p>The alternating rail reads as a single conversation, so the attempts of a
 * re-raised request run together rather than sitting in separate blocks. Which
 * attempt a step belonged to is carried on the step instead.
 */
export function flattenTimeline(entries: TimelineEntry[]) {
  return entries.flatMap((entry, entryIndex) =>
    entry.steps.map((step) => ({
      ...step,
      attemptOrdinal: entries.length - entryIndex,
      entryId: entry.id,
      showAttempt: entries.length > 1,
    })),
  );
}

/**
 * When a lapsed request stopped being re-raisable, or null if it has not yet.
 *
 * <p>Only rejection and expiry have such a window — those are the outcomes that
 * were not the tenant's doing. A cancelled request was their own choice and an
 * approved one is going ahead, so neither expires this way.
 */
function reRaiseWindowClosedAt(request: TenancyExitRequest) {
  if (request.status !== "REJECTED" && request.status !== "EXPIRED") {
    return null;
  }

  const lapsedAt = request.decidedAt ?? request.updatedAt;
  if (!lapsedAt) {
    return null;
  }

  const closesAt = new Date(lapsedAt);
  closesAt.setDate(closesAt.getDate() + RE_RAISE_WINDOW_DAYS);

  return closesAt.getTime() <= Date.now() ? closesAt.toISOString() : null;
}
