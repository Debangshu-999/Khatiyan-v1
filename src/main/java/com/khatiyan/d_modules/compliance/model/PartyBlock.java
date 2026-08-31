package com.khatiyan.d_modules.compliance.model;

import java.util.List;

/**
 * One named party of the deed, as it is printed.
 *
 * <p>The particulars are paragraphs of segments rather than typed fields — name,
 * age, phone and so on — for one reason: on a property's template none of them
 * exist yet, and the block has to render "Landlord's Name" underlined in the same
 * place a real name will go. Typed fields would have forced a second, parallel
 * rendering path for the placeholder case.
 *
 * <p>{@code heading} is BETWEEN or AND, which is how a deed introduces its two
 * sides.
 */
public record PartyBlock(String heading, String role, List<ClauseParagraph> body) {
}
