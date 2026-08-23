package com.khatiyan.d_modules.chat.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.rate_limit.RateLimitService;
import com.khatiyan.d_modules.chat.api.dto.ChatMessagePageResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatThreadReaderResponse;
import com.khatiyan.d_modules.chat.model.ChatReadState;
import com.khatiyan.d_modules.chat.model.ChatThread;
import com.khatiyan.d_modules.chat.model.ChatThreadMember;
import com.khatiyan.d_modules.chat.repository.ChatMessageRepository;
import com.khatiyan.d_modules.chat.repository.ChatReadStateRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadMemberRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.TenancyModule;

/**
 * Who a receipt is about.
 *
 * <p>The rule is asymmetric, and the wrong answer is the kind that never throws:
 * a manager would see their own message ticked as read by the tenant when in fact
 * only a colleague had opened it.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChatReadReceiptTest {

    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID MANAGER = UUID.randomUUID();

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

    @InjectMocks private ChatService chatService;

    @Test
    void aTenantSeesEveryManagerWhoOpenedTheTeamThread() {
        ChatThread thread = teamThread();
        // The tenant is the only member; the other two are management.
        givenThread(thread, List.of(TENANT), List.of(
                ChatReadState.of(thread.getId(), TENANT, 9L),
                ChatReadState.of(thread.getId(), OWNER, 7L),
                ChatReadState.of(thread.getId(), MANAGER, 4L)));

        ChatMessagePageResponse page = chatService.listMessages(TENANT, thread.getId(), null);

        assertThat(page.readers())
                .extracting(ChatThreadReaderResponse::userId)
                .containsExactlyInAnyOrder(OWNER, MANAGER);
        // Ordered by how far each has read, so the furthest reader leads.
        assertThat(page.readers().get(0).lastReadSeq()).isEqualTo(7L);
        assertThat(page.counterpartLastReadSeq()).isEqualTo(7L);
    }

    @Test
    void aManagerSeesOnlyTheTenantsPositionNeverAColleagues() {
        ChatThread thread = teamThread();
        givenThread(thread, List.of(TENANT), List.of(
                ChatReadState.of(thread.getId(), TENANT, 3L),
                // A colleague has read far further. It must not count as the
                // tenant having seen anything.
                ChatReadState.of(thread.getId(), OWNER, 12L)));

        ChatMessagePageResponse page = chatService.listMessages(MANAGER, thread.getId(), null);

        assertThat(page.readers())
                .extracting(ChatThreadReaderResponse::userId)
                .containsExactly(TENANT);
        assertThat(page.counterpartLastReadSeq()).isEqualTo(3L);
    }

    @Test
    void nobodyHavingOpenedItReadsAsUnseenRatherThanBlank() {
        ChatThread thread = teamThread();
        givenThread(thread, List.of(TENANT), List.of(
                ChatReadState.of(thread.getId(), TENANT, 5L)));

        ChatMessagePageResponse page = chatService.listMessages(TENANT, thread.getId(), null);

        assertThat(page.readers()).isEmpty();
        assertThat(page.counterpartLastReadSeq()).isZero();
    }

    @Test
    void aOneToOneReportsTheOtherPersonAlone() {
        ChatThread thread = ChatThread.personal(PROPERTY, OWNER, MANAGER);
        givenThread(thread, List.of(OWNER, MANAGER), List.of(
                ChatReadState.of(thread.getId(), OWNER, 6L),
                ChatReadState.of(thread.getId(), MANAGER, 2L)));

        ChatMessagePageResponse page = chatService.listMessages(OWNER, thread.getId(), null);

        assertThat(page.readers())
                .extracting(ChatThreadReaderResponse::userId)
                .containsExactly(MANAGER);
        assertThat(page.counterpartLastReadSeq()).isEqualTo(2L);
    }

    private ChatThread teamThread() {
        return ChatThread.forTenancy(PROPERTY, UUID.randomUUID());
    }

    private void givenThread(ChatThread thread, List<UUID> memberIds, List<ChatReadState> states) {
        when(chatAccessService.requireReadable(any(), any())).thenReturn(thread);
        when(chatMessageRepository.findLatest(any(), any())).thenReturn(List.of());
        when(authModule.findByIds(any())).thenReturn(Map.of());
        when(chatThreadMemberRepository.findByThreadId(thread.getId()))
                .thenReturn(memberIds.stream()
                        .map(userId -> ChatThreadMember.of(thread.getId(), userId))
                        .toList());
        when(chatReadStateRepository.findByThreadIdIn(anyList())).thenReturn(states);
    }
}
