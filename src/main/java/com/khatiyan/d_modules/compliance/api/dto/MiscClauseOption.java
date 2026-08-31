package com.khatiyan.d_modules.compliance.api.dto;

import java.util.Arrays;
import java.util.List;

import com.khatiyan.d_modules.compliance.model.MiscClauseType;

/**
 * One clause from the opt-in library, as the picker shows it.
 *
 * <p>Served rather than duplicated in the app bundle. The picker shows each
 * clause's full wording — that is the entire basis on which an owner decides to
 * tick it — and a second copy of that prose in TypeScript would drift from the
 * one actually written into agreements. There would then be no way to tell which
 * of the two a given owner had read.
 */
public record MiscClauseOption(MiscClauseType type, String heading, String body) {

    public static List<MiscClauseOption> all() {
        return Arrays.stream(MiscClauseType.values())
                .map(type -> new MiscClauseOption(type, type.heading(), type.body()))
                .toList();
    }
}
