package com.khatiyan.d_modules.chat.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

class ChatMessageTest {

    private static final UUID THREAD = UUID.randomUUID();
    private static final UUID AUTHOR = UUID.randomUUID();

    @Test
    void aMessageMayBeTextAlone() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "  hello  ", List.of());

        assertThat(message.getBody()).isEqualTo("hello");
        assertThat(message.getAttachments()).isEmpty();
    }

    @Test
    void aMessageMayBeAttachmentsAlone() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, null, List.of(image()));

        assertThat(message.getBody()).isNull();
        assertThat(message.getAttachments()).hasSize(1);
    }

    @Test
    void aMessageCarryingNothingIsRefused() {
        assertThatThrownBy(() -> ChatMessage.of(THREAD, AUTHOR, "   ", List.of()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("either text or an attachment");
    }

    @Test
    void aBodyOverTheLimitIsRefused() {
        String tooLong = "x".repeat(ChatMessage.MAX_BODY_LENGTH + 1);

        assertThatThrownBy(() -> ChatMessage.of(THREAD, AUTHOR, tooLong, List.of()))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void moreThanFiveAttachmentsIsRefused() {
        List<ChatMessageAttachment> six = List.of(image(), image(), image(), image(), image(), image());

        assertThatThrownBy(() -> ChatMessage.of(THREAD, AUTHOR, null, six))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("more than " + ChatMessage.MAX_ATTACHMENTS);
    }

    @Test
    void attachmentsKeepThePickingOrder() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, null, List.of(image(), image(), image()));

        assertThat(message.getAttachments())
                .extracting(ChatMessageAttachment::getSortOrder)
                .containsExactly(0, 1, 2);
    }

    @Test
    void onlyTheSenderCanDeleteTheirMessage() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "hello", List.of());

        assertThatThrownBy(() -> message.deleteBy(UUID.randomUUID(), Instant.now()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only the sender");
    }

    @Test
    void deletingTwiceKeepsTheFirstTimestamp() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "hello", List.of());
        Instant first = Instant.parse("2026-08-23T10:00:00Z");

        message.deleteBy(AUTHOR, first);
        message.deleteBy(AUTHOR, first.plusSeconds(600));

        assertThat(message.getDeletedAt()).isEqualTo(first);
    }

    @Test
    void aDeletedMessageSaysSoInTheListPreview() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "the rent is late", List.of());

        message.deleteBy(AUTHOR, Instant.now());

        assertThat(message.preview()).isEqualTo("Message deleted");
    }

    @Test
    void anAttachmentOnlyMessagePreviewsAsItsKind() {
        assertThat(ChatMessage.of(THREAD, AUTHOR, null, List.of(image())).preview()).isEqualTo("Photo");
        assertThat(ChatMessage.of(THREAD, AUTHOR, null, List.of(file())).preview()).isEqualTo("File");
    }

    @Test
    void textWinsThePreviewEvenWhenSomethingIsAttached() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "see attached", List.of(file()));

        assertThat(message.preview()).isEqualTo("see attached");
    }

    @Test
    void anAttachmentNeedsAUrl() {
        assertThatThrownBy(() -> ChatMessageAttachment.of(
                        ChatAttachmentKind.IMAGE, "  ", null, null, null, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("url");
    }

    @Test
    void onlyTheSenderCanEdit() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "hello", List.of());

        assertThatThrownBy(() -> message.editBy(UUID.randomUUID(), "changed", Instant.now()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only the sender");
    }

    @Test
    void aMessageWithAnAttachmentCannotBeEdited() {
        // The picture is already sent and already seen; changing the words
        // around it edits the caption of something the reader remembers
        // differently.
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "see this", List.of(image()));

        assertThatThrownBy(() -> message.editBy(AUTHOR, "see that", Instant.now()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("attachment");
    }

    @Test
    void aDeletedMessageCannotBeEdited() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "hello", List.of());
        message.deleteBy(AUTHOR, Instant.now());

        assertThatThrownBy(() -> message.editBy(AUTHOR, "hello again", Instant.now()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("deleted");
    }

    @Test
    void editingToNothingIsRefusedRatherThanTreatedAsADelete() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "hello", List.of());

        assertThatThrownBy(() -> message.editBy(AUTHOR, "   ", Instant.now()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Delete it instead");
    }

    @Test
    void anEditMarksTheMessage() {
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "hello", List.of());

        message.editBy(AUTHOR, "hello there", Instant.now());

        assertThat(message.getBody()).isEqualTo("hello there");
        assertThat(message.isEdited()).isTrue();
    }

    @Test
    void resendingTheSameTextMarksNothing() {
        // An "edited" tag on an unchanged message is a claim the reader cannot
        // check and that nothing supports.
        ChatMessage message = ChatMessage.of(THREAD, AUTHOR, "hello", List.of());

        message.editBy(AUTHOR, "  hello  ", Instant.now());

        assertThat(message.isEdited()).isFalse();
    }

    private static ChatMessageAttachment image() {
        return ChatMessageAttachment.of(
                ChatAttachmentKind.IMAGE, "https://cdn/x.jpg", "chat/x", null, "image/jpeg", 1024L);
    }

    private static ChatMessageAttachment file() {
        return ChatMessageAttachment.of(
                ChatAttachmentKind.FILE, "https://cdn/x.pdf", "chat/x", "rent-agreement.pdf",
                "application/pdf", 2048L);
    }
}
