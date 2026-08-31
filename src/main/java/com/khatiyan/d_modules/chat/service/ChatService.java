package com.khatiyan.d_modules.chat.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.rate_limit.RateLimitService;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.chat.api.dto.ChatAttachmentRequest;
import com.khatiyan.d_modules.chat.api.dto.ChatContactResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatMessagePageResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatMessageResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatThreadReaderResponse;
import com.khatiyan.d_modules.chat.api.dto.ChatThreadResponse;
import com.khatiyan.d_modules.chat.api.dto.SendChatMessageRequest;
import com.khatiyan.d_modules.chat.model.ChatMessage;
import com.khatiyan.d_modules.chat.model.ChatMessageAttachment;
import com.khatiyan.d_modules.chat.model.ChatReadState;
import com.khatiyan.d_modules.chat.model.ChatThread;
import com.khatiyan.d_modules.chat.model.ChatThreadKind;
import com.khatiyan.d_modules.chat.model.ChatThreadMember;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.chat.repository.ChatMessageRepository;
import com.khatiyan.d_modules.chat.repository.ChatReadStateRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadMemberRepository;
import com.khatiyan.d_modules.chat.repository.ChatThreadRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Conversations, and everything that reads or writes one.
 *
 * <p>Two shapes only. A {@code TEAM} thread is one outsider talking to the
 * property's management, shared by everyone with chat access; a {@code DIRECT}
 * thread is two named people. Which section a thread appears in falls out of its
 * kind and origin, so nothing here stores a section.
 *
 * <p>Access lives in {@link ChatAccessService} and is not re-derived anywhere in
 * this class.
 */
@Slf4j
@Service
public class ChatService {

    /** How many messages a conversation opens with, and the poll's page size. */
    private static final int PAGE_SIZE = 50;

    /**
     * Send limits, per person across every conversation.
     *
     * <p>The burst cap is the one that matters: it stops a loop or a stuck retry
     * from filling somebody's screen, without troubling a real argument. The daily
     * cap is the backstop for a sustained one.
     *
     * <p>Keyed on the SENDER, never the thread. Rationing a conversation would
     * punish two people talking quickly; rationing a person is what actually
     * bounds the damage one account can do.
     */
    private static final int SEND_BURST_LIMIT = 20;
    private static final int SEND_BURST_WINDOW_SECONDS = 60;
    private static final int SEND_DAILY_LIMIT = 300;
    private static final int SEND_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

    private final ChatThreadRepository chatThreadRepository;
    private final ChatThreadMemberRepository chatThreadMemberRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatReadStateRepository chatReadStateRepository;
    private final ChatAccessService chatAccessService;
    private final ChatNotifier chatNotifier;
    private final RateLimitService rateLimitService;
    private final PropertyModule propertyModule;
    private final TenancyModule tenancyModule;
    private final AuthModule authModule;

    public ChatService(
            ChatThreadRepository chatThreadRepository,
            ChatThreadMemberRepository chatThreadMemberRepository,
            ChatMessageRepository chatMessageRepository,
            ChatReadStateRepository chatReadStateRepository,
            ChatAccessService chatAccessService,
            ChatNotifier chatNotifier,
            RateLimitService rateLimitService,
            PropertyModule propertyModule,
            TenancyModule tenancyModule,
            AuthModule authModule) {
        this.chatThreadRepository = chatThreadRepository;
        this.chatThreadMemberRepository = chatThreadMemberRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.chatReadStateRepository = chatReadStateRepository;
        this.chatAccessService = chatAccessService;
        this.chatNotifier = chatNotifier;
        this.rateLimitService = rateLimitService;
        this.propertyModule = propertyModule;
        this.tenancyModule = tenancyModule;
        this.authModule = authModule;
    }

    // ------------------------------------------------------------------
    // Management sections
    // ------------------------------------------------------------------

    /**
     * The Tenants section: every current tenant, one row each.
     *
     * <p>A roster, not an inbox. A tenant nobody has written to still gets a row
     * — with a null thread id — so management can open a conversation without
     * picking a name out of a separate list. The thread is created by the first
     * message.
     */
    @Transactional(readOnly = true)
    public List<ChatThreadResponse> listTenantSection(UUID actorUserId, UUID propertyId) {
        chatAccessService.requireTeamAccess(actorUserId, propertyId);

        // Guest stays are left out of the roster entirely. A daily guest has no
        // account and no app, so a row for them would be a conversation that can
        // never have a second person in it — and tapping it would try to open a
        // thread against a tenant who does not exist.
        List<TenancyResponse> tenancies = tenancyModule.findActiveByPropertyId(propertyId).stream()
                .filter(tenancy -> tenancy.userId() != null)
                .toList();
        Map<UUID, ChatThread> byTenancy = new HashMap<>();
        for (ChatThread thread :
                chatThreadRepository.findSection(propertyId, ChatThreadKind.TEAM, ChatThreadOrigin.TENANCY)) {
            byTenancy.put(thread.getOriginId(), thread);
        }

        // A cleared thread is dropped rather than filtered later, so the
        // roster row falls back to "tap to start a conversation" — which is
        // exactly what deleting it was meant to leave behind.
        byTenancy.values().removeIf(thread -> isCleared(actorUserId, thread));

        Map<UUID, Long> readPositions = readPositionsFor(actorUserId, byTenancy.values());
        Map<UUID, Long> receipts =
                counterpartReadPositions(actorUserId, new ArrayList<>(byTenancy.values()));
        Map<UUID, UserSummaryResponse> tenants = authModule.findByIds(
                tenancies.stream().map(TenancyResponse::userId).collect(Collectors.toSet()));

        List<ChatThreadResponse> rows = new ArrayList<>();
        for (TenancyResponse tenancy : tenancies) {
            ChatThread thread = byTenancy.get(tenancy.id());
            // The account is the name of record, not the tenancy's copy of it.
            // findActiveByPropertyId builds its responses with the single-argument
            // TenancyResponse.from, which leaves tenantName null — so reading it
            // here produced a roster of blank rows with "?" for every avatar.
            String name = tenancy.tenantName() != null && !tenancy.tenantName().isBlank()
                    ? tenancy.tenantName()
                    : nameOf(tenants.get(tenancy.userId()), tenancy.userId());
            rows.add(rowFor(thread, name, tenancy.userId(), propertyId,
                    ChatThreadKind.TEAM, ChatThreadOrigin.TENANCY, tenancy.id(),
                    photoOf(tenants.get(tenancy.userId())), readPositions, receipts));
        }

        // Started conversations first, then the rest of the roster alphabetically:
        // a list that opens on somebody who has been waiting beats one that opens
        // on whoever happens to sort first.
        rows.sort(Comparator
                .comparing((ChatThreadResponse row) -> row.lastMessageAt() == null)
                .thenComparing(row -> row.lastMessageAt() == null ? Instant.EPOCH : row.lastMessageAt(),
                        Comparator.reverseOrder())
                .thenComparing(row -> row.title() == null ? "" : row.title().toLowerCase()));
        return rows;
    }

    /** My chats: the reader's own one-to-ones on this property. */
    @Transactional(readOnly = true)
    public List<ChatThreadResponse> listPersonalSection(UUID actorUserId, UUID propertyId) {
        List<ChatThread> threads =
                chatThreadRepository.findSection(propertyId, ChatThreadKind.DIRECT, ChatThreadOrigin.PERSONAL)
                        .stream()
                        .filter(thread -> chatAccessService.isMember(actorUserId, thread.getId()))
                        .toList();
        return describe(actorUserId, stillVisibleTo(actorUserId, threads));
    }

    /**
     * Enquiries: the conversations this person answered.
     *
     * <p>Private to them and the prospect. The owner's oversight of a manager's
     * enquiries comes from the enquiry response log — who answered, by which
     * channel, when — not from reading what was said.
     */
    @Transactional(readOnly = true)
    public List<ChatThreadResponse> listEnquirySection(UUID actorUserId, UUID propertyId) {
        return describe(actorUserId, stillVisibleTo(
                actorUserId, chatThreadRepository.findEnquirySectionFor(propertyId, actorUserId)));
    }

    /**
     * A tenant's or prospect's own list: everything they are a member of, across
     * every property, newest first.
     */
    @Transactional(readOnly = true)
    public List<ChatThreadResponse> listMine(UUID actorUserId) {
        return describe(actorUserId, stillVisibleTo(
                actorUserId, chatThreadRepository.findForMember(actorUserId)));
    }

    // ------------------------------------------------------------------
    // Opening conversations
    // ------------------------------------------------------------------

    /**
     * The team thread for a stay, created on demand.
     *
     * <p>Called by both sides — management from the tenant's roster row, the
     * tenant from their pinned Property Management Team row — so it opens or
     * returns rather than refusing a second time.
     */
    @Transactional
    public ChatThread openTeamThread(UUID actorUserId, UUID tenancyId) {
        TenancyResponse tenancy = tenancyModule.findById(tenancyId)
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId.toString()));

        // Refused outright rather than null-guarded past: there is no second
        // party to this thread. A daily guest holds no account, so nothing they
        // need is handled through the app — it is handled with them in person.
        if (tenancy.userId() == null) {
            throw new ValidationException("This is a guest stay, so there is nobody to message here.");
        }

        boolean isTenant = tenancy.userId().equals(actorUserId);
        if (!isTenant) {
            chatAccessService.requireTeamAccess(actorUserId, tenancy.propertyId());
        }

        return chatThreadRepository.findByOriginAndOriginId(ChatThreadOrigin.TENANCY, tenancyId)
                .orElseGet(() -> {
                    ChatThread thread = chatThreadRepository.save(
                            ChatThread.forTenancy(tenancy.propertyId(), tenancyId));
                    // Only the tenant is a member. The management side is a role
                    // resolved per request, never a row.
                    chatThreadMemberRepository.save(ChatThreadMember.of(thread.getId(), tenancy.userId()));
                    log.info("Chat team thread opened tenancyId={} threadId={}", tenancyId, thread.getId());
                    return thread;
                });
    }

    /** {@link #openTeamThread} plus the list row for it, so the client can render immediately. */
    @Transactional
    public ChatThreadResponse openTeamThreadRow(UUID actorUserId, UUID tenancyId) {
        return describe(actorUserId, List.of(openTeamThread(actorUserId, tenancyId))).get(0);
    }

    /**
     * A one-to-one, created on demand.
     *
     * <p>Both people become members. The pair key makes a double tap safe: the
     * second insert loses to the unique index rather than opening a second
     * conversation each side then replies into separately.
     */
    @Transactional
    public ChatThread openDirectThread(UUID actorUserId, UUID propertyId, UUID withUserId) {
        if (actorUserId.equals(withUserId)) {
            throw new ValidationException("You cannot start a conversation with yourself");
        }
        ensureMayStartDirect(actorUserId, propertyId, withUserId);

        String pairKey = ChatThread.pairKey(propertyId, actorUserId, withUserId);
        Optional<ChatThread> existing = chatThreadRepository.findByPairKey(pairKey);
        if (existing.isPresent()) {
            return existing.get();
        }

        ChatThread thread = chatThreadRepository.save(
                ChatThread.personal(propertyId, actorUserId, withUserId));
        chatThreadMemberRepository.save(ChatThreadMember.of(thread.getId(), actorUserId));
        chatThreadMemberRepository.save(ChatThreadMember.of(thread.getId(), withUserId));
        log.info("Chat direct thread opened propertyId={} threadId={}", propertyId, thread.getId());
        return thread;
    }

    /** {@link #openDirectThread} plus its list row. */
    @Transactional
    public ChatThreadResponse openDirectThreadRow(UUID actorUserId, UUID propertyId, UUID withUserId) {
        return describe(actorUserId, List.of(openDirectThread(actorUserId, propertyId, withUserId))).get(0);
    }

    /**
     * The conversation behind an answered enquiry.
     *
     * <p>Called by the enquiry module as it records the response, inside the same
     * transaction, so an enquiry can never be marked answered-by-chat without the
     * thread the answer lives in.
     */
    @Transactional
    public ChatThread openEnquiryThread(
            UUID propertyId, UUID enquiryId, UUID enquirerUserId, UUID responderUserId) {
        return chatThreadRepository.findByOriginAndOriginId(ChatThreadOrigin.ENQUIRY, enquiryId)
                .orElseGet(() -> {
                    ChatThread thread = chatThreadRepository.save(
                            ChatThread.forEnquiry(propertyId, enquiryId));
                    chatThreadMemberRepository.save(ChatThreadMember.of(thread.getId(), enquirerUserId));
                    chatThreadMemberRepository.save(ChatThreadMember.of(thread.getId(), responderUserId));
                    log.info("Chat enquiry thread opened enquiryId={} threadId={}", enquiryId, thread.getId());
                    return thread;
                });
    }

    /**
     * Who the + button offers.
     *
     * <p>Management may write to the owner, the other managers and any current
     * tenant. A tenant may write to the owner and the managers, never to another
     * tenant — nothing in the product needs tenant-to-tenant, and it is the one
     * direction that would need moderating.
     */
    @Transactional(readOnly = true)
    public List<ChatContactResponse> listContacts(UUID actorUserId, UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        boolean management = chatAccessService.hasTeamAccess(actorUserId, propertyId)
                || property.ownerId().equals(actorUserId);
        Optional<TenancyResponse> ownTenancy = activeTenancyOf(actorUserId, propertyId);

        if (!management && ownTenancy.isEmpty()) {
            throw new ValidationException("You have no conversations available on this property");
        }

        Map<UUID, String> people = new HashMap<>();
        Map<UUID, String> roles = new HashMap<>();

        people.put(property.ownerId(), null);
        roles.put(property.ownerId(), "OWNER");
        for (UUID managerUserId : propertyModule.findActiveManagerUserIds(propertyId)) {
            people.put(managerUserId, null);
            roles.put(managerUserId, "MANAGER");
        }
        if (management) {
            for (TenancyResponse tenancy : tenancyModule.findActiveByPropertyId(propertyId)) {
                // Same reason as the roster above: a guest stay has nobody to
                // put in a contact list.
                if (tenancy.userId() == null) {
                    continue;
                }
                people.put(tenancy.userId(), tenancy.tenantName());
                roles.put(tenancy.userId(), "TENANT");
            }
        }
        people.remove(actorUserId);

        Map<UUID, UserSummaryResponse> summaries = authModule.findByIds(people.keySet());
        List<ChatContactResponse> contacts = new ArrayList<>();
        for (Map.Entry<UUID, String> person : people.entrySet()) {
            UUID userId = person.getKey();
            String name = person.getValue() != null
                    ? person.getValue()
                    : nameOf(summaries.get(userId), userId);
            UUID existing = chatThreadRepository
                    .findByPairKey(ChatThread.pairKey(propertyId, actorUserId, userId))
                    .map(ChatThread::getId)
                    .orElse(null);
            contacts.add(new ChatContactResponse(userId, name, roles.get(userId), existing));
        }

        contacts.sort(Comparator
                .comparing(ChatContactResponse::role)
                .thenComparing(contact -> contact.name() == null ? "" : contact.name().toLowerCase()));
        return contacts;
    }

    // ------------------------------------------------------------------
    // Messages
    // ------------------------------------------------------------------

    /** The newest page of a conversation, oldest first for rendering. */
    @Transactional(readOnly = true)
    public ChatMessagePageResponse listMessages(UUID actorUserId, UUID threadId, Long afterSeq) {
        ChatThread thread = chatAccessService.requireReadable(actorUserId, threadId);

        // Everything at or below the reader's clear mark is invisible TO THEM.
        // Applied here rather than at the repository so both the opening page
        // and the poll obey it, and neither can be reached around by passing a
        // lower cursor from the client.
        long clearedAt = clearedPositionOf(actorUserId, threadId);
        List<ChatMessage> messages = afterSeq == null
                ? new ArrayList<>(chatMessageRepository.findLatestAfter(
                        threadId, clearedAt, PageRequest.of(0, PAGE_SIZE)))
                : chatMessageRepository.findAfter(
                        threadId, Math.max(afterSeq, clearedAt), PageRequest.of(0, PAGE_SIZE));

        if (afterSeq == null) {
            // findLatest reads newest-first so the page is the RECENT fifty
            // rather than the oldest fifty; the screen wants them the other way.
            messages.sort(Comparator.comparing(ChatMessage::getSeq));
        }

        Map<UUID, UserSummaryResponse> authors = authModule.findByIds(
                messages.stream().map(ChatMessage::getAuthorUserId).collect(Collectors.toSet()));

        List<ChatMessageResponse> rendered = messages.stream()
                .map(message -> ChatMessageResponse.from(
                        message,
                        nameOf(authors.get(message.getAuthorUserId()), message.getAuthorUserId()),
                        photoOf(authors.get(message.getAuthorUserId())),
                        actorUserId))
                .toList();

        List<ChatReadState> otherSide = readersOnTheOtherSide(actorUserId, thread);
        Map<UUID, UserSummaryResponse> readerNames = authModule.findByIds(
                otherSide.stream().map(ChatReadState::getUserId).collect(Collectors.toSet()));

        return new ChatMessagePageResponse(
                rendered,
                otherSide.stream().mapToLong(ChatReadState::getLastReadSeq).max().orElse(0L),
                otherSide.stream()
                        .map(state -> new ChatThreadReaderResponse(
                                state.getUserId(),
                                nameOf(readerNames.get(state.getUserId()), state.getUserId()),
                                state.getLastReadSeq()))
                        .sorted(Comparator.comparingLong(ChatThreadReaderResponse::lastReadSeq).reversed())
                        .toList(),
                describe(actorUserId, List.of(thread)).get(0),
                chatReadStateRepository.findByThreadIdAndUserId(threadId, actorUserId)
                        .map(ChatReadState::getLastReadSeq)
                        .orElse(0L));
    }

    /** Sends into an existing conversation. */
    @Transactional
    public ChatMessageResponse send(UUID actorUserId, UUID threadId, SendChatMessageRequest request) {
        ChatThread thread = chatAccessService.requireReadable(actorUserId, threadId);
        thread.ensureWritable();
        ensureNotSendingTooFast(actorUserId);

        ChatMessage message = chatMessageRepository.saveAndFlush(ChatMessage.of(
                threadId, actorUserId, request.body(), toAttachments(request.attachments())));

        thread.noteLastMessage(
                message.getSeq(), message.getCreatedAt(), message.preview(), message.attachmentKind());

        // The sender has by definition read their own message. Without this their
        // own thread lights up unread the moment they send one.
        readStateFor(threadId, actorUserId).advanceTo(message.getSeq());

        log.info("Chat message sent threadId={} authorUserId={} seq={} attachments={}",
                threadId, actorUserId, message.getSeq(), message.getAttachments().size());

        UserSummaryResponse author = authModule.findById(actorUserId).orElse(null);
        String authorName = nameOf(author, actorUserId);

        // Announced, not delivered — the message is already durable. This is the
        // tap on the shoulder, and it is allowed to fail silently.
        chatNotifier.announce(thread, message, authorName);

        return ChatMessageResponse.from(message, authorName, photoOf(author), actorUserId);
    }

    /** Rewrites one of your own messages. Refused on anything with an attachment. */
    @Transactional
    public ChatMessageResponse editMessage(
            UUID actorUserId, UUID threadId, UUID messageId, String body) {
        ChatThread thread = chatAccessService.requireReadable(actorUserId, threadId);
        thread.ensureWritable();

        ChatMessage message = chatMessageRepository.findById(messageId)
                .filter(candidate -> candidate.getThreadId().equals(threadId))
                .orElseThrow(() -> new NotFoundException("Message", messageId.toString()));

        message.editBy(actorUserId, body, Instant.now());

        // The list preview is a copy of the newest message, so an edit to THAT
        // message has to be copied across or the row keeps quoting the old text.
        if (thread.getLastMessageSeq() != null && thread.getLastMessageSeq().equals(message.getSeq())) {
            thread.repeatLastMessagePreview(message.preview());
        }

        log.info("Chat message edited threadId={} messageId={}", threadId, messageId);
        UserSummaryResponse author = authModule.findById(actorUserId).orElse(null);
        return ChatMessageResponse.from(message, nameOf(author, actorUserId), photoOf(author), actorUserId);
    }

    /** Hides one of your own messages from both sides. */
    @Transactional
    public void deleteMessage(UUID actorUserId, UUID threadId, UUID messageId) {
        ChatThread thread = chatAccessService.requireReadable(actorUserId, threadId);

        ChatMessage message = chatMessageRepository.findById(messageId)
                .filter(candidate -> candidate.getThreadId().equals(threadId))
                .orElseThrow(() -> new NotFoundException("Message", messageId.toString()));

        message.deleteBy(actorUserId, Instant.now());

        // The list keeps its own copy of the newest message so a page of rows
        // costs one query. That copy was written when the message was sent, so
        // without this the conversation reads "Message deleted" while the list
        // still shows what it said.
        if (message.getSeq() != null && message.getSeq().equals(thread.getLastMessageSeq())) {
            thread.noteLastMessageWithdrawn(message.preview());
        }

        log.info("Chat message deleted threadId={} messageId={}", threadId, messageId);
    }

    // ------------------------------------------------------------------
    // Read state
    // ------------------------------------------------------------------

    /** Moves the reader's mark forward. Never backwards — see {@link ChatReadState}. */
    @Transactional
    public void markRead(UUID actorUserId, UUID threadId, long lastReadSeq) {
        chatAccessService.requireReadable(actorUserId, threadId);
        readStateFor(threadId, actorUserId).advanceTo(lastReadSeq);
    }

    /**
     * Threads with something unread in them, for the header badge.
     *
     * <p>Counts conversations rather than messages: a badge on a list is about
     * how many rows want attention, not how much was said in them.
     */
    @Transactional(readOnly = true)
    public long countUnread(UUID actorUserId) {
        List<ChatThread> mine = stillVisibleTo(actorUserId, chatThreadRepository.findForMember(actorUserId));
        Map<UUID, Long> positions = readPositionsFor(actorUserId, mine);
        return mine.stream().filter(thread -> isUnread(thread, positions)).count();
    }

    // ------------------------------------------------------------------
    // Closing
    // ------------------------------------------------------------------

    /**
     * Ends an enquiry conversation.
     *
     * <p>Either named party may: the responder because they took it, the prospect
     * because they have the least power in it and should be able to stop an
     * exchange they did not ask to continue. Management reading a shared thread
     * cannot close somebody else's.
     *
     * <p>Only enquiry threads close by hand. A team conversation ends when the
     * stay does, and a one-to-one between colleagues has no natural end.
     */
    @Transactional
    public void closeThread(UUID actorUserId, UUID threadId) {
        ChatThread thread = chatAccessService.requireReadable(actorUserId, threadId);

        if (thread.getOrigin() != ChatThreadOrigin.ENQUIRY) {
            throw new ValidationException("Only enquiry conversations can be closed");
        }
        if (!chatAccessService.isMember(actorUserId, threadId)) {
            throw new ValidationException("Only the two people in this conversation can close it");
        }

        thread.close();
        log.info("Chat enquiry thread closed threadId={} actorUserId={}", threadId, actorUserId);
    }

    /**
     * Deletes a conversation for one person, and for nobody else.
     *
     * <p>A soft delete in the strict sense: no row is removed, no message is
     * touched, and the other side's copy is unchanged. What is written is a mark
     * on the reader's own read-state row saying how far the thread had got, and
     * both the list and the message page read past it.
     *
     * <p>That single mark also answers "what if they start again with the same
     * person". They get the same thread — the pair key guarantees there can only
     * be one — but it opens empty, because the page starts after the mark.
     * Creating a second thread row instead would have meant either abandoning
     * the pair key or leaving an orphan nobody can reach.
     *
     * <p>Deliberately available on every kind of thread, unlike
     * {@link #closeThread}. Closing an enquiry ends it for both parties and is a
     * decision about the conversation; this is a decision about one person's own
     * list, and there is no thread somebody should be forced to keep looking at.
     */
    @Transactional
    public void deleteThreadForMe(UUID actorUserId, UUID threadId) {
        ChatThread thread = chatAccessService.requireReadable(actorUserId, threadId);
        long head = thread.getLastMessageSeq() == null ? 0L : thread.getLastMessageSeq();

        readStateFor(threadId, actorUserId).clearUpTo(head);
        log.info("Chat thread cleared for one reader threadId={} actorUserId={} throughSeq={}",
                threadId,
                actorUserId,
                head);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /**
     * Drops the threads this person has deleted.
     *
     * <p>A cleared thread comes back on its own once its head moves past the
     * mark, which is what makes a new message from the other side reappear
     * without anything having to un-hide it.
     */
    private List<ChatThread> stillVisibleTo(UUID actorUserId, List<ChatThread> threads) {
        if (threads.isEmpty()) {
            return threads;
        }

        Map<UUID, Long> cleared = clearedPositionsFor(actorUserId, threads);
        return threads.stream()
                .filter(thread -> !isCleared(thread, cleared.getOrDefault(thread.getId(), 0L)))
                .toList();
    }

    private boolean isCleared(UUID actorUserId, ChatThread thread) {
        return isCleared(thread, clearedPositionOf(actorUserId, thread.getId()));
    }

    private boolean isCleared(ChatThread thread, long clearedAt) {
        if (clearedAt <= 0L) {
            return false;
        }

        Long head = thread.getLastMessageSeq();
        return head == null || head <= clearedAt;
    }

    private long clearedPositionOf(UUID actorUserId, UUID threadId) {
        return chatReadStateRepository.findByThreadIdAndUserId(threadId, actorUserId)
                .map(ChatReadState::getClearedAtSeq)
                .orElse(0L);
    }

    /** Clear marks for a set of threads in one query, mirroring readPositionsFor. */
    private Map<UUID, Long> clearedPositionsFor(UUID userId, List<ChatThread> threads) {
        List<UUID> ids = threads.stream().map(ChatThread::getId).toList();
        if (ids.isEmpty()) {
            return Map.of();
        }

        Map<UUID, Long> cleared = new HashMap<>();
        for (ChatReadState state : chatReadStateRepository.findByUserIdAndThreadIdIn(userId, ids)) {
            cleared.put(state.getThreadId(), state.getClearedAtSeq());
        }
        return cleared;
    }

    /**
     * Two buckets, both on the sender.
     *
     * <p>Checked after the thread is loaded and found writable, so a message
     * refused for being too fast is never also a message nobody could have sent
     * anyway — the reader gets the more specific reason.
     */
    private void ensureNotSendingTooFast(UUID actorUserId) {
        rateLimitService.consumeOrThrow(
                "khatiyan:chat:send:burst:" + actorUserId,
                SEND_BURST_LIMIT,
                SEND_BURST_WINDOW_SECONDS,
                "You are sending messages too quickly. Wait a moment and try again.");
        rateLimitService.consumeOrThrow(
                "khatiyan:chat:send:daily:" + actorUserId,
                SEND_DAILY_LIMIT,
                SEND_DAILY_WINDOW_SECONDS,
                "You have sent a lot of messages today. Try again tomorrow.");
    }

    private void ensureMayStartDirect(UUID actorUserId, UUID propertyId, UUID withUserId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        Set<UUID> managementSide = new HashSet<>(propertyModule.findActiveManagerUserIds(propertyId));
        managementSide.add(property.ownerId());

        boolean actorIsManagement = managementSide.contains(actorUserId);
        boolean targetIsManagement = managementSide.contains(withUserId);

        if (actorIsManagement) {
            if (targetIsManagement || activeTenancyOf(withUserId, propertyId).isPresent()) {
                return;
            }
            throw new ValidationException("You can only message managers and current tenants of this property");
        }

        // A tenant may reach management, and nobody else. Tenant-to-tenant is the
        // one direction that would need moderating, and nothing needs it.
        if (activeTenancyOf(actorUserId, propertyId).isPresent() && targetIsManagement) {
            return;
        }
        throw new ValidationException("You can only message the owner or a manager of your property");
    }

    private Optional<TenancyResponse> activeTenancyOf(UUID userId, UUID propertyId) {
        return tenancyModule.findActiveByPropertyId(propertyId).stream()
                .filter(tenancy -> tenancy.userId().equals(userId))
                .findFirst();
    }

    private List<ChatMessageAttachment> toAttachments(List<ChatAttachmentRequest> requests) {
        if (requests == null) {
            return List.of();
        }
        return requests.stream()
                .map(request -> ChatMessageAttachment.of(
                        request.kind(),
                        request.url(),
                        request.publicId(),
                        request.fileName(),
                        request.contentType(),
                        request.sizeBytes()))
                .toList();
    }

    private ChatReadState readStateFor(UUID threadId, UUID userId) {
        return chatReadStateRepository.findByThreadIdAndUserId(threadId, userId)
                .orElseGet(() -> chatReadStateRepository.save(ChatReadState.of(threadId, userId, 0L)));
    }

    /**
     * Read marks for a set of threads in one query.
     *
     * <p>A thread with no row is absent from the map, and every caller treats
     * that as zero — the right default for somebody who has never opened it.
     */
    private Map<UUID, Long> readPositionsFor(UUID userId, Iterable<ChatThread> threads) {
        List<UUID> ids = new ArrayList<>();
        threads.forEach(thread -> ids.add(thread.getId()));
        if (ids.isEmpty()) {
            return Map.of();
        }

        Map<UUID, Long> positions = new HashMap<>();
        for (ChatReadState state : chatReadStateRepository.findByUserIdAndThreadIdIn(userId, ids)) {
            positions.put(state.getThreadId(), state.getLastReadSeq());
        }
        return positions;
    }

    /**
     * The read rows that belong to the OTHER side of one conversation.
     *
     * <p>Who that is depends on which side is asking, and getting it wrong is the
     * one way receipts lie:
     *
     * <ul>
     *   <li><b>The outsider on a team thread</b> — every manager who has opened
     *       it. They wrote to the property rather than to a person, so "who has
     *       seen this" is a list, not a tick.
     *   <li><b>Management on a team thread</b> — the tenant alone. Including
     *       colleagues here would tick a manager's message as seen by the tenant
     *       when it was only seen by another manager.
     *   <li><b>A one-to-one</b> — the other member, which the first branch
     *       already covers since both people are members.
     * </ul>
     */
    private List<ChatReadState> readersOnTheOtherSide(UUID actorUserId, ChatThread thread) {
        Set<UUID> members = chatThreadMemberRepository.findByThreadId(thread.getId()).stream()
                .map(ChatThreadMember::getUserId)
                .collect(Collectors.toSet());
        boolean actorIsMember = members.contains(actorUserId);

        return chatReadStateRepository.findByThreadIdIn(List.of(thread.getId())).stream()
                .filter(state -> !state.getUserId().equals(actorUserId))
                .filter(state -> actorIsMember || members.contains(state.getUserId()))
                .toList();
    }

    /**
     * How far the other side has read, per thread.
     *
     * <p>Who "the other side" is depends on which side is asking, and getting it
     * wrong is the one way receipts lie:
     *
     * <ul>
     *   <li><b>The outsider asking about a team thread</b> — the furthest ANY
     *       manager has read. They wrote to the property, not to a person, so one
     *       manager opening it means the property has seen it.
     *   <li><b>Management asking about a team thread</b> — the tenant's own
     *       position, and only theirs. Taking a maximum here would tick as soon
     *       as a COLLEAGUE read it, telling a manager their message had reached
     *       the tenant when it had not.
     *   <li><b>A one-to-one</b> — the other member, which both branches reduce to
     *       anyway.
     * </ul>
     */
    private Map<UUID, Long> counterpartReadPositions(UUID actorUserId, List<ChatThread> threads) {
        if (threads.isEmpty()) {
            return Map.of();
        }

        List<UUID> threadIds = threads.stream().map(ChatThread::getId).toList();

        Map<UUID, Set<UUID>> membersByThread = new HashMap<>();
        for (ChatThreadMember member : chatThreadMemberRepository.findByThreadIdIn(threadIds)) {
            membersByThread.computeIfAbsent(member.getThreadId(), key -> new HashSet<>())
                    .add(member.getUserId());
        }

        Map<UUID, List<ChatReadState>> statesByThread = new HashMap<>();
        for (ChatReadState state : chatReadStateRepository.findByThreadIdIn(threadIds)) {
            statesByThread.computeIfAbsent(state.getThreadId(), key -> new ArrayList<>()).add(state);
        }

        Map<UUID, Long> positions = new HashMap<>();
        for (ChatThread thread : threads) {
            Set<UUID> members = membersByThread.getOrDefault(thread.getId(), Set.of());
            List<ChatReadState> states = statesByThread.getOrDefault(thread.getId(), List.of());
            boolean actorIsMember = members.contains(actorUserId);

            // Same predicate as readersOnTheOtherSide, batched: a list may hold
            // fifty rows and one query beats fifty.
            long furthest = 0L;
            for (ChatReadState state : states) {
                if (state.getUserId().equals(actorUserId)) {
                    continue;
                }
                // Management reading a team thread wants the member's position
                // alone; everyone else takes the best of whoever is left.
                boolean counts = actorIsMember || members.contains(state.getUserId());
                if (counts) {
                    furthest = Math.max(furthest, state.getLastReadSeq());
                }
            }
            positions.put(thread.getId(), furthest);
        }
        return positions;
    }

    private boolean isUnread(ChatThread thread, Map<UUID, Long> positions) {
        if (thread.getLastMessageSeq() == null) {
            return false;
        }
        return thread.getLastMessageSeq() > positions.getOrDefault(thread.getId(), 0L);
    }

    private List<ChatThreadResponse> describe(UUID actorUserId, List<ChatThread> threads) {
        if (threads.isEmpty()) {
            return List.of();
        }

        Map<UUID, Long> positions = readPositionsFor(actorUserId, threads);
        Map<UUID, Long> receipts = counterpartReadPositions(actorUserId, threads);
        List<UUID> threadIds = threads.stream().map(ChatThread::getId).toList();

        Map<UUID, UUID> counterparts = new HashMap<>();
        for (ChatThreadMember member : chatThreadMemberRepository.findByThreadIdIn(threadIds)) {
            if (!member.getUserId().equals(actorUserId)) {
                counterparts.put(member.getThreadId(), member.getUserId());
            }
        }

        Map<UUID, UserSummaryResponse> people =
                authModule.findByIds(new HashSet<>(counterparts.values()));

        List<ChatThreadResponse> rows = new ArrayList<>();
        for (ChatThread thread : threads) {
            UUID counterpartId = counterparts.get(thread.getId());
            String title = titleFor(thread, counterpartId, people);
            rows.add(new ChatThreadResponse(
                    thread.getId(),
                    thread.getKind(),
                    thread.getOrigin(),
                    thread.getOriginId(),
                    thread.getPropertyId(),
                    thread.getStatus(),
                    title,
                    counterpartId,
                    photoOf(counterpartId == null ? null : people.get(counterpartId)),
                    thread.getLastMessagePreview(),
                    thread.getLastMessageAt(),
                    thread.getLastMessageKind(),
                    thread.getLastMessageSeq() == null ? 0L : thread.getLastMessageSeq(),
                    isUnread(thread, positions),
                    receipts.getOrDefault(thread.getId(), 0L)));
        }
        return rows;
    }

    /**
     * What a row is called.
     *
     * <p>A team thread read by its tenant is the property, because that is who
     * they think they are writing to — not whichever manager happened to answer
     * last.
     */
    private String titleFor(ChatThread thread, UUID counterpartId, Map<UUID, UserSummaryResponse> people) {
        if (thread.getKind() == ChatThreadKind.TEAM && counterpartId == null) {
            // Defensive: a property that has been deactivated should cost a
            // conversation its name, not its existence. The history is still
            // readable and still theirs.
            PropertyResponse property = propertyModule.getActiveProperty(thread.getPropertyId());
            return property == null || property.name() == null ? "Property management" : property.name();
        }
        if (counterpartId == null) {
            return "Property management";
        }
        return nameOf(people.get(counterpartId), counterpartId);
    }

    private ChatThreadResponse rowFor(
            ChatThread thread,
            String title,
            UUID counterpartUserId,
            UUID propertyId,
            ChatThreadKind kind,
            ChatThreadOrigin origin,
            UUID originId,
            String counterpartPhotoUrl,
            Map<UUID, Long> positions,
            Map<UUID, Long> receipts) {
        if (thread == null) {
            // A roster row for somebody nobody has written to yet. Null id is the
            // signal to the client that the first message creates the thread.
            return new ChatThreadResponse(
                    null, kind, origin, originId, propertyId,
                    com.khatiyan.d_modules.chat.model.ChatThreadStatus.OPEN,
                    title, counterpartUserId, counterpartPhotoUrl, null, null, null, 0L, false, 0L);
        }
        return new ChatThreadResponse(
                thread.getId(), thread.getKind(), thread.getOrigin(), thread.getOriginId(),
                thread.getPropertyId(), thread.getStatus(), title, counterpartUserId,
                counterpartPhotoUrl,
                thread.getLastMessagePreview(), thread.getLastMessageAt(), thread.getLastMessageKind(),
                thread.getLastMessageSeq() == null ? 0L : thread.getLastMessageSeq(),
                isUnread(thread, positions),
                receipts.getOrDefault(thread.getId(), 0L));
    }

    /** Null unless they have actually uploaded one; initials stand in otherwise. */
    private String photoOf(UserSummaryResponse summary) {
        return summary == null || summary.profilePhotoUrl() == null || summary.profilePhotoUrl().isBlank()
                ? null
                : summary.profilePhotoUrl();
    }

    /** A missing user is a deleted or unreadable account, not a crash. */
    private String nameOf(UserSummaryResponse summary, UUID userId) {
        if (summary == null || summary.fullName() == null || summary.fullName().isBlank()) {
            return "Khatiyan user";
        }
        return summary.fullName();
    }
}
