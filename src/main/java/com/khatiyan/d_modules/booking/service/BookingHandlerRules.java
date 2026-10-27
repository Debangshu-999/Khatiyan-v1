package com.khatiyan.d_modules.booking.service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.TreeSet;
import java.util.UUID;

import com.khatiyan.d_modules.booking.model.BookingAssignmentMode;

/**
 * Who handles a booking request. Pure rules: the caller supplies who the owner
 * is and which managers hold the bookings grant today, read from the property
 * module, and no client-supplied role is trusted.
 *
 * <p><b>A handler who lost the grant is no handler.</b> Grants change without
 * telling this module, so nothing here trusts the stored name alone: it counts
 * only while that person can still manage bookings. That is what stops a
 * request being stranded with someone who can no longer open it.
 */
public final class BookingHandlerRules {

    private BookingHandlerRules() {
    }

    /**
     * The handler as they stand today: the stored one while they are the owner
     * or still hold the grant, and nobody otherwise.
     */
    public static UUID effectiveHandler(UUID storedHandler, UUID owner, Collection<UUID> managersWithGrant) {
        if (storedHandler == null) {
            return null;
        }
        return storedHandler.equals(owner) || managersWithGrant.contains(storedHandler) ? storedHandler : null;
    }

    /**
     * Whether this person may act on the request. The owner always may. A
     * manager may only while the request is theirs and they hold the grant.
     * Everyone else with the grant may look, and no more.
     */
    public static boolean mayAct(UUID actor, UUID owner, UUID storedHandler, Collection<UUID> managersWithGrant) {
        if (actor == null) {
            return false;
        }
        if (actor.equals(owner)) {
            return true;
        }
        return managersWithGrant.contains(actor)
                && actor.equals(effectiveHandler(storedHandler, owner, managersWithGrant));
    }

    /**
     * Whether answering a request makes this person its handler: only where
     * the first to respond handles it, nobody handles it today, and they are
     * the owner or a manager with the grant (user, 2026-10-11: "Make first to
     * open as first to respond").
     *
     * <p>Opening it takes nothing. It used to be the first to open, which gave
     * a request to whoever looked at it first, whether or not they went on to
     * answer it. The owner is one of them: an owner who answers a request
     * nobody has is its handler, and finds it under Assigned to me. One the
     * owner took is the owner's to answer, as any other handler's is theirs.
     *
     * <p>The mode is still stored as {@code FIRST_VIEW}. A stored name is
     * never renamed, so only what it means has changed.
     */
    public static boolean claimsOnResponse(BookingAssignmentMode mode, UUID actor, UUID owner, UUID storedHandler,
            Collection<UUID> managersWithGrant) {
        return mode == BookingAssignmentMode.FIRST_VIEW
                && actor != null
                && (actor.equals(owner) || managersWithGrant.contains(actor))
                && effectiveHandler(storedHandler, owner, managersWithGrant) == null;
    }

    /**
     * Whether this person may answer the request now: its handler or the
     * owner, as ever, and where the first to respond handles it and nobody
     * does yet, anyone who would become its handler by answering.
     */
    public static boolean mayRespond(BookingAssignmentMode mode, UUID actor, UUID owner, UUID storedHandler,
            Collection<UUID> managersWithGrant) {
        return mayAct(actor, owner, storedHandler, managersWithGrant)
                || claimsOnResponse(mode, actor, owner, storedHandler, managersWithGrant);
    }

    /**
     * Who takes turns, in the fixed order turns are taken in: the managers
     * with the grant, and the owner when the owner opted in. With nobody to
     * give a request to, the owner takes every turn, so a request the system
     * assigns never ends up with nobody.
     */
    public static List<UUID> turnOrder(Collection<UUID> managersWithGrant, UUID owner, boolean includeOwner) {
        TreeSet<UUID> inOrder = new TreeSet<>(managersWithGrant);
        if (includeOwner || inOrder.isEmpty()) {
            inOrder.add(owner);
        }
        return new ArrayList<>(inOrder);
    }

    /**
     * The next turn: whoever follows the person who had the last one, wrapping
     * to the start. Going by who follows a person, not by a stored position,
     * is what keeps turns even when someone joins or leaves between requests.
     *
     * @return the handler, or null when nobody is in the order
     */
    public static UUID nextTurn(List<UUID> order, UUID lastAssigned) {
        if (order.isEmpty()) {
            return null;
        }
        if (lastAssigned != null) {
            for (UUID candidate : order) {
                if (candidate.compareTo(lastAssigned) > 0) {
                    return candidate;
                }
            }
        }
        return order.get(0);
    }
}
