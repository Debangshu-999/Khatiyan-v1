package com.khatiyan.d_modules.compliance.model;

/**
 * A clause the owner wrote, and where in the main run they want it.
 *
 * <p>{@code position} is 1-based against the SURVIVING main clauses, resolved at
 * assembly and clamped to the end of the list. It is deliberately not an index
 * into {@link MainClauseType}: an owner may have dropped clauses, and a position
 * that pointed at a clause rather than at a gap would move when an unrelated
 * clause was excluded.
 *
 * <p>A custom clause is how an owner replaces wording they cannot edit — drop the
 * deposit clause, write your own at position four. That is the entire reason
 * nothing in the main run is locked.
 */
public record CustomClauseSpec(String heading, String body, int position) {
}
