package com.khatiyan.d_modules.compliance.model;

import java.util.Arrays;
import java.util.List;

/**
 * One paragraph of a clause, as runs of text.
 *
 * <p>{@code bullet} carries the only structure a clause body has ever needed:
 * three of the fourteen end in a list — the permitted deductions, the move-out
 * checklist and the furniture schedule — and consecutive bullet paragraphs
 * render as one list. A second block type would buy nothing and would have to be
 * discriminated in JSON.
 */
public record ClauseParagraph(boolean bullet, List<ClauseSegment> segments) {

    public static ClauseParagraph of(ClauseSegment... segments) {
        return new ClauseParagraph(false, Arrays.asList(segments));
    }

    public static ClauseParagraph text(String text) {
        return of(ClauseSegment.plain(text));
    }

    public static ClauseParagraph bullet(String text) {
        return new ClauseParagraph(true, List.of(ClauseSegment.plain(text)));
    }
}
