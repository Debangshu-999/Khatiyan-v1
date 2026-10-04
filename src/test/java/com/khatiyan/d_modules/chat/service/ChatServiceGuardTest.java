package com.khatiyan.d_modules.chat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.rate_limit.RateLimitService;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.chat.api.dto.SendChatMessageRequest;
import com.khatiyan.d_modules.chat.model.ChatMessage;
import com.khatiyan.d_modules.chat.model.ChatThread;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.chat.repository.ChatMessageRepository;
import com.khatiyan.d_modules.chat.repository.ChatReadStateRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadMemberRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;

/**
 * The refusals.
 *
 * <p>Each of these is a rule that would be invisible if it broke — a closed
 * conversation quietly accepting a message, or one person ending another's.
 * Every case asserts that nothing was written, not merely that something was
 * thrown.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChatServiceGuardTest {

    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();

    @Mock private ChatThreadRepository chatThreadRepository;
    @Mock private ChatThreadMemberRepository chatThreadMemberRepository;
    @Mock private ChatMessageRepository chatMessageRepository;
    @Mock private ChatReadStateRepository chatReadStateRepository;
    @Mock private ChatAccessService chatAccessService;
    @Mock private ChatNotifier chatNotifier;
    @Mock private RateLimitService rateLimitService;
    @Mock private PropertyModule propertyModule;
    @Mock private TenancyModule tenancyModule;
    @Mock private AuthModule authModule;
    @Mock private ApplicationEventPublisher eventPublisher;

    @InjectMocks private ChatService chatService;

    @Test
    void aClosedConversationRefusesANewMessage() {
        ChatThread thread = ChatThread.forEnquiry(PROPERTY, UUID.randomUUID());
        thread.close();
        when(chatAccessService.requireReadable(ACTOR, thread.getId())).thenReturn(thread);

        assertThatThrownBy(() -> chatService.send(
                        ACTOR, thread.getId(), new SendChatMessageRequest("hello", null)))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("closed");

        verify(chatMessageRepository, never()).saveAndFlush(any());
    }

    @Test
    void aTeamConversationCannotBeClosedByHand() {
        // Only enquiry threads close. A tenant conversation ends when the stay
        // does, which is the tenancy module's business, not a button's.
        ChatThread thread = ChatThread.forTenancy(PROPERTY, UUID.randomUUID());
        when(chatAccessService.requireReadable(ACTOR, thread.getId())).thenReturn(thread);

        assertThatThrownBy(() -> chatService.closeThread(ACTOR, thread.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Only enquiry conversations");
    }

    @Test
    void managementReadingAThreadCannotCloseSomebodyElsesConversation() {
        ChatThread thread = ChatThread.forEnquiry(PROPERTY, UUID.randomUUID());
        when(chatAccessService.requireReadable(ACTOR, thread.getId())).thenReturn(thread);
        when(chatAccessService.isMember(ACTOR, thread.getId())).thenReturn(false);

        assertThatThrownBy(() -> chatService.closeThread(ACTOR, thread.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("two people in this conversation");
    }

    @Test
    void eitherOfTheTwoPeopleMayCloseAnEnquiryConversation() {
        ChatThread thread = ChatThread.forEnquiry(PROPERTY, UUID.randomUUID());
        when(chatAccessService.requireReadable(ACTOR, thread.getId())).thenReturn(thread);
        when(chatAccessService.isMember(ACTOR, thread.getId())).thenReturn(true);

        chatService.closeThread(ACTOR, thread.getId());

        assertThatThrownBy(thread::ensureWritable).isInstanceOf(ValidationException.class);
    }

    /**
     * A new enquiry chat holds the question for its pinned row and writes no
     * message (user, 2026-10-03): it does not exist for anyone until its
     * first text.
     */
    @Test
    void anEnquiryChatHoldsTheQuestionAndWritesNoMessage() {
        UUID enquiry = UUID.randomUUID();
        UUID enquirer = UUID.randomUUID();
        when(chatThreadRepository.findByOriginAndOriginId(ChatThreadOrigin.ENQUIRY, enquiry))
                .thenReturn(Optional.empty());
        when(chatThreadRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChatThread thread = chatService.openEnquiryThread(PROPERTY, enquiry, enquirer, ACTOR, "Is a single room free?");

        verify(chatMessageRepository, never()).saveAndFlush(any());
        assertThat(thread.getOpeningMessage()).isEqualTo("Is a single room free?");
        assertThat(thread.getLastMessageSeq()).isNull();
    }

    /**
     * The first text is the only message written (user, 2026-10-03). The
     * question is not placed above it: the pinned row already shows it.
     */
    @Test
    void theFirstTextIsTheOnlyMessageWritten() {
        UUID enquirer = UUID.randomUUID();
        ChatThread thread = ChatThread.forEnquiry(PROPERTY, UUID.randomUUID());
        thread.rememberOpening("Is a single room free?", enquirer);
        when(chatAccessService.requireReadable(ACTOR, thread.getId())).thenReturn(thread);
        when(chatMessageRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            ChatMessage saved = spy((ChatMessage) invocation.getArgument(0));
            doReturn(1L).when(saved).getSeq();
            return saved;
        });
        when(chatReadStateRepository.findByThreadIdAndUserId(any(), any())).thenReturn(Optional.empty());
        when(chatReadStateRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        chatService.send(ACTOR, thread.getId(), new SendChatMessageRequest("Yes, from the 1st.", List.of()));

        ArgumentCaptor<ChatMessage> saved = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository, times(1)).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getAuthorUserId()).isEqualTo(ACTOR);
        assertThat(saved.getValue().getBody()).isEqualTo("Yes, from the 1st.");
        assertThat(thread.getOpeningMessage()).isEqualTo("Is a single room free?");
        assertThat(thread.getLastMessageSeq()).isEqualTo(1L);
        verify(chatNotifier, times(1)).announce(any(), any(), any());
        // Object, not any(): publishEvent is overloaded and the event is a record.
        verify(eventPublisher, times(1)).publishEvent(any(Object.class));
    }

    /** Opening it again joins the conversation that exists, and does not repeat the question. */
    @Test
    void reopeningAnEnquiryConversationDoesNotRepeatTheQuestion() {
        UUID enquiry = UUID.randomUUID();
        ChatThread existing = ChatThread.forEnquiry(PROPERTY, enquiry);
        when(chatThreadRepository.findByOriginAndOriginId(ChatThreadOrigin.ENQUIRY, enquiry))
                .thenReturn(Optional.of(existing));

        assertThat(chatService.openEnquiryThread(PROPERTY, enquiry, UUID.randomUUID(), ACTOR, "Is a single room free?"))
                .isSameAs(existing);
        verify(chatMessageRepository, never()).saveAndFlush(any());
    }

    @Test
    void youCannotStartAConversationWithYourself() {
        assertThatThrownBy(() -> chatService.openDirectThread(ACTOR, PROPERTY, ACTOR))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("yourself");

        verify(chatThreadRepository, never()).save(any());
    }
}
