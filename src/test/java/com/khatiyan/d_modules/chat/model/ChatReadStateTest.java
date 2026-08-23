package com.khatiyan.d_modules.chat.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class ChatReadStateTest {

    private static final UUID THREAD = UUID.randomUUID();
    private static final UUID USER = UUID.randomUUID();

    @Test
    void aFreshReaderHasReadNothing() {
        assertThat(ChatReadState.of(THREAD, USER, 0L).getLastReadSeq()).isZero();
    }

    @Test
    void theMarkMovesForward() {
        ChatReadState state = ChatReadState.of(THREAD, USER, 4L);

        state.advanceTo(9L);

        assertThat(state.getLastReadSeq()).isEqualTo(9L);
    }

    @Test
    void aStaleReportCannotReLightABadgeAlreadyCleared() {
        // Two devices report independently and the older report can arrive last.
        ChatReadState state = ChatReadState.of(THREAD, USER, 9L);

        state.advanceTo(4L);

        assertThat(state.getLastReadSeq()).isEqualTo(9L);
    }

    @Test
    void aNegativeStartingPositionIsClampedToZero() {
        assertThat(ChatReadState.of(THREAD, USER, -5L).getLastReadSeq()).isZero();
    }
}
