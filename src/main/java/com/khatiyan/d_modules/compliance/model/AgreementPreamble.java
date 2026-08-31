package com.khatiyan.d_modules.compliance.model;

import java.util.List;

/**
 * Everything above clause 1: the title, when and where it was executed, the two
 * parties, and the recitals that identify the premises.
 *
 * <p><b>Stored with the agreement, not rendered on read.</b> The content hash
 * covers this record along with the clauses, so a signed deed pins WHO agreed as
 * firmly as it pins what they agreed to. Rendering the parties from the user
 * table at read time would mean a tenant changing their address silently altered
 * a document they had already signed.
 *
 * <p>Not a clause and not part of the numbered run: it cannot be dropped,
 * reordered, or given a position by a custom clause.
 */
public record AgreementPreamble(
        String title,

        /** "This agreement is made and executed on {date} at {place}." */
        List<ClauseParagraph> execution,

        PartyBlock landlord,
        PartyBlock tenant,

        /**
         * The WHEREAS paragraphs: who owns the premises, which room is licensed,
         * and on what term — ending with "Now it is agreed... as follows:".
         */
        List<ClauseParagraph> recitals) {
}
