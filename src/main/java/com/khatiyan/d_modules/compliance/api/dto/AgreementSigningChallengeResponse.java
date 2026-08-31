package com.khatiyan.d_modules.compliance.api.dto;

/**
 * Handed back when a signing code is sent.
 *
 * @param contentHash    the agreement as it stands right now; the client sends
 *                       this back with the code, and a change in between is
 *                       what the server is watching for
 * @param sentTo         the destination, masked, so the screen can say where to
 *                       look without restating the number
 * @param statementText  the wording to display above the checkbox, from the
 *                       server rather than the build, so what was agreed to is
 *                       not whatever the installed app happened to contain
 * @param statementKey   which statement, for the record
 * @param statementVersion which revision of it
 */
public record AgreementSigningChallengeResponse(
        String contentHash,
        String sentTo,
        String statementText,
        String statementKey,
        int statementVersion) {
}
