package com.khatiyan.d_modules.discovery.api.dto;

import java.util.UUID;

/**
 * One way a prospect can reach a property.
 *
 * @param owner true for the property's owner, who is always present and cannot
 *     be removed. False for a manager the owner chose to list.
 * @param email only when the person has VERIFIED an address, so the client can
 *     offer or grey out the mail action without deciding the rule itself.
 */
public record PropertyContactResponse(
    UUID userId,
    String name,
    String phone,
    String email,
    boolean owner
) {
}
