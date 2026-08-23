package com.khatiyan.d_modules.chat.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

class ChatThreadTest {

    private static final UUID PROPERTY = UUID.randomUUID();

    @Test
    void tenancyThreadIsSharedWithTheManagementTeam() {
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());

        assertThat(thread.getKind()).isEqualTo(ChatThreadKind.TEAM);
        assertThat(thread.getOrigin()).isEqualTo(ChatThreadOrigin.TENANCY);
        assertThat(thread.getStatus()).isEqualTo(ChatThreadStatus.OPEN);
    }

    @Test
    void enquiryThreadIsPrivateAndCarriesNoPairKey() {
        ChatThread thread = ChatThread.forEnquiry(PROPERTY, UUID.randomUUID());

        assertThat(thread.getKind()).isEqualTo(ChatThreadKind.DIRECT);
        // The absence is the point: a prospect may enquire again and the same
        // manager may answer again, so keying on the pair would collide and the
        // second enquiry could never open.
        assertThat(thread.getPairKey()).isNull();
    }

    @Test
    void personalThreadCarriesAPairKey() {
        ChatThread thread = ChatThread.personal(PROPERTY, UUID.randomUUID(), UUID.randomUUID());

        assertThat(thread.getKind()).isEqualTo(ChatThreadKind.DIRECT);
        assertThat(thread.getOrigin()).isEqualTo(ChatThreadOrigin.PERSONAL);
        assertThat(thread.getPairKey()).isNotNull();
    }

    @Test
    void pairKeyDoesNotDependOnWhoTappedFirst() {
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();

        assertThat(ChatThread.pairKey(PROPERTY, alice, bob))
                .isEqualTo(ChatThread.pairKey(PROPERTY, bob, alice));
    }

    @Test
    void pairKeySeparatesTheSameTwoPeopleOnDifferentProperties() {
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();

        assertThat(ChatThread.pairKey(PROPERTY, alice, bob))
                .isNotEqualTo(ChatThread.pairKey(UUID.randomUUID(), alice, bob));
    }

    @Test
    void closingIsIdempotentBecauseBothSidesMayCloseAtOnce() {
        ChatThread thread = ChatThread.forEnquiry(PROPERTY, UUID.randomUUID());

        thread.close();
        thread.close();

        assertThat(thread.getStatus()).isEqualTo(ChatThreadStatus.READ_ONLY);
        assertThat(thread.isOpen()).isFalse();
    }

    @Test
    void aClosedThreadRefusesAWrite() {
        ChatThread thread = ChatThread.forEnquiry(PROPERTY, UUID.randomUUID());
        thread.close();

        assertThatThrownBy(thread::ensureWritable)
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("closed");
    }

    @Test
    void previewIsTrimmedToTheColumnItHasToFitIn() {
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());

        thread.noteLastMessage(1L, Instant.now(), "x".repeat(400), null);

        assertThat(thread.getLastMessagePreview()).hasSize(ChatThread.MAX_PREVIEW_LENGTH);
    }

    @Test
    void previewCollapsesWhitespaceSoAListRowStaysOneLine() {
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());

        thread.noteLastMessage(1L, Instant.now(), "  hello\n\n  there  ", null);

        assertThat(thread.getLastMessagePreview()).isEqualTo("hello there");
    }

    @Test
    void lastMessageKindIsTextWhenNothingWasAttached() {
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());

        thread.noteLastMessage(1L, Instant.now(), "hello", null);

        assertThat(thread.getLastMessageKind()).isEqualTo("TEXT");
    }

    @Test
    void theLastMessagePointerNeverMovesBackwards() {
        // Two sends in one conversation take their seq at INSERT but reach this
        // update in whatever order they win the thread's row lock, so the older
        // number can arrive last. Letting it win would leave the list showing a
        // stale preview AND compute unread against a seq the reader has already
        // passed — a genuinely unread message sitting in a thread that looks read.
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());
        Instant now = Instant.now();

        thread.noteLastMessage(812L, now, "the later message", null);
        thread.noteLastMessage(811L, now.minusSeconds(1), "the earlier message", null);

        assertThat(thread.getLastMessageSeq()).isEqualTo(812L);
        assertThat(thread.getLastMessagePreview()).isEqualTo("the later message");
    }

    @Test
    void reNotingTheSameSequenceChangesNothing() {
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());

        thread.noteLastMessage(5L, Instant.now(), "first write", null);
        thread.noteLastMessage(5L, Instant.now(), "second write", null);

        assertThat(thread.getLastMessagePreview()).isEqualTo("first write");
    }

    @Test
    void lastMessageKindRemembersAnAttachment() {
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());

        thread.noteLastMessage(2L, Instant.now(), "Photo", ChatAttachmentKind.IMAGE);

        assertThat(thread.getLastMessageKind()).isEqualTo("IMAGE");
    }
}
