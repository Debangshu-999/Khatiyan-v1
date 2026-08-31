package com.khatiyan.d_modules.compliance.model;

/**
 * What kind of clause this is, and therefore who wrote its words.
 *
 * <p>{@code MAIN} and {@code MISC} are both platform-authored with wording fixed
 * in code — an owner can decide whether they appear, never what they say. They
 * are separate kinds because they are chosen differently and numbered
 * differently: the main run is present by default and opted OUT of, the
 * miscellaneous library is absent by default and opted IN to, and the
 * miscellaneous clauses always follow the whole main run.
 *
 * <p>{@code CUSTOM} is the owner's own prose, and the reason nothing in the main
 * run is locked: an owner who wants different words for the deposit drops the
 * deposit clause and writes their own in its position.
 */
public enum ClauseKind {
    MAIN,
    MISC,
    CUSTOM
}
