package com.khatiyan.d_modules.chat.model;

/**
 * Who is on the management side of a conversation.
 *
 * <p>This one value is the whole access model. {@link #TEAM} means the side is a
 * role resolved per request; {@link #DIRECT} means it is a named person.
 */
public enum ChatThreadKind {

    /**
     * One outsider talking to the property's management team.
     *
     * <p>Shared: the owner and every manager with chat access read it and
     * whoever is free answers. No assignment, no ownership, no routing.
     */
    TEAM,

    /** Exactly two named people. Invisible to everyone else. */
    DIRECT
}
