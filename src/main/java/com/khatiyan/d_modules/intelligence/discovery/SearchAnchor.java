package com.khatiyan.d_modules.intelligence.discovery;

/**
 * What a search measures distance from.
 *
 * <p>The distinction matters because ordinary discovery always measures from the
 * device (a 2026-07-06 decision), and smart search is the one path allowed to
 * measure from somewhere else. Someone standing in Tollygunge asking for "PGs
 * near Salt Lake" means Salt Lake, and answering from where they happen to be
 * standing would be answering a different question.
 */
public enum SearchAnchor {

    /** A named place: "near Salt Lake", "in Ballygunge". Resolved by the geocoder. */
    PLACE,

    /** "near me", "around here". Needs device coordinates, or the request fails closed. */
    DEVICE,

    /** No location in the sentence. The discovery tab keeps whatever scope it had. */
    NONE
}
