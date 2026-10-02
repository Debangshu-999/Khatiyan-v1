package com.khatiyan.d_modules.enquiry.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.api.PageResponse;
import com.khatiyan.c_shared.concurrency.VersionGuard;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.chat.ChatModule;
import com.khatiyan.d_modules.chat.event.ChatMessageSentEvent;
import com.khatiyan.d_modules.chat.model.ChatThreadOrigin;
import com.khatiyan.d_modules.enquiry.api.dto.AssignEnquiryHandlerRequest;
import com.khatiyan.d_modules.enquiry.api.dto.EmailChannelState;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryCallToSettleResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryCountsResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryDetailResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryListScope;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryParty;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryReceiptResponse;
import com.khatiyan.d_modules.enquiry.api.dto.EnquiryResponseView;
import com.khatiyan.d_modules.enquiry.api.dto.MyEnquiryResponse;
import com.khatiyan.d_modules.enquiry.api.dto.RaiseEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.ReachableChannelResponse;
import com.khatiyan.d_modules.enquiry.api.dto.RespondToEnquiryRequest;
import com.khatiyan.d_modules.enquiry.api.dto.SetEnquirySentimentRequest;
import com.khatiyan.d_modules.enquiry.api.dto.SettleEnquiryAttemptRequest;
import com.khatiyan.d_modules.enquiry.event.EnquiryEndedEvent;
import com.khatiyan.d_modules.enquiry.event.EnquiryRaisedEvent;
import com.khatiyan.d_modules.enquiry.event.EnquiryRespondedEvent;
import com.khatiyan.d_modules.enquiry.model.Enquiry;
import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerMode;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;
import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository;
import com.khatiyan.d_modules.enquiry.repository.EnquiryRepository.AwaitingCounts;
import com.khatiyan.d_modules.enquiry.repository.EnquiryResponseRepository;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;

import lombok.extern.slf4j.Slf4j;

/**
 * Raising and answering enquiries.
 *
 * <p>The one rule worth stating up front: the set of channels an enquirer can be
 * reached on is computed HERE, once, by {@link #reachableChannels}. Both the
 * enquirer's confirmation dialog and the owner's respond sheet render from it,
 * and {@link #respond} validates against it. Nothing recomputes it client-side.
 *
 * <p>That rule now has two halves. Whether a channel <em>works</em> is a fact
 * about the account and lives here. Whether the enquirer <em>agreed</em> to it
 * is decided by {@link EnquiryChannelConsentService}. A channel needs both, and
 * nothing downstream is allowed to see one without the other — which is why the
 * enquirer's phone is withheld from management exactly when the consent is
 * missing.
 *
 * <p><b>The consent half is read once, at {@link #raise}, and frozen onto the
 * enquiry.</b> Every later read — the list, the respond sheet, the validation on
 * answering — uses {@code Enquiry.sharedChannels} rather than asking the consent
 * table again. Changing the standing decision therefore governs the next
 * enquiry and leaves earlier ones exactly as they were asked, instead of
 * reshaping a conversation already underway.
 *
 * <p><b>Reaching out is an attempt, not an answer</b> (owner's rules,
 * 2026-10-02). A call stays open until someone says whether the enquirer
 * responded. A chat message stays open until the enquirer replies on the thread.
 * The enquiry is answered only when an attempt succeeds. The two channels are
 * independent: an unanswered chat never blocks a call, and an unsettled call
 * never blocks a message. Who may act at all is {@link EnquiryHandlerService}'s.
 */
@Slf4j
@Service
public class EnquiryService {

    /** The most one page of the list returns, whatever the client asks for. */
    static final int MAX_PAGE_SIZE = 50;

    private final EnquiryRepository enquiryRepository;
    private final EnquiryResponseRepository enquiryResponseRepository;
    private final EnquiryChannelConsentService consentService;
    private final EnquiryHandlerService handlerService;
    private final ChatModule chatModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final NotificationModule notificationModule;
    private final ApplicationEventPublisher eventPublisher;

    public EnquiryService(
            EnquiryRepository enquiryRepository,
            EnquiryResponseRepository enquiryResponseRepository,
            EnquiryChannelConsentService consentService,
            EnquiryHandlerService handlerService,
            ChatModule chatModule,
            PropertyModule propertyModule,
            AuthModule authModule,
            NotificationModule notificationModule,
            ApplicationEventPublisher eventPublisher) {
        this.enquiryRepository = enquiryRepository;
        this.enquiryResponseRepository = enquiryResponseRepository;
        this.consentService = consentService;
        this.handlerService = handlerService;
        this.chatModule = chatModule;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.notificationModule = notificationModule;
        this.eventPublisher = eventPublisher;
    }

    /**
     * The person reading a list or a card, and what the property lets them do.
     *
     * <p>Resolved once per request and handed to every card, so a page of twenty
     * enquiries asks who the owner is and what the mode is once, not twenty
     * times.
     */
    private record Viewer(UUID userId, UUID ownerUserId, EnquiryHandlerMode mode) {
    }

    // ---- Enquirer side ---------------------------------------------------

    /**
     * Whether this person may enquire about this property, and whether they
     * already have.
     *
     * <p>Drives the profile button. Returning the reason rather than a bare
     * boolean is what lets the button say "Enquiry sent" instead of just going
     * grey for an unexplained reason.
     */
    @Transactional(readOnly = true)
    public MyEnquiryResponse myEnquiryFor(UUID actorUserId, UUID propertyId) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);

        if (managesProperty(actorUserId, property)) {
            return MyEnquiryResponse.blocked("This is your property");
        }

        return enquiryRepository
                .findByPropertyIdAndEnquirerUserIdAndStatus(propertyId, actorUserId, EnquiryStatus.NEW)
                .map(open -> MyEnquiryResponse.alreadyAsked(open.getId(), open.askedAt()))
                .orElseGet(MyEnquiryResponse::allowed);
    }

    @Transactional
    public EnquiryReceiptResponse raise(UUID actorUserId, UUID propertyId, RaiseEnquiryRequest request) {
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);

        if (managesProperty(actorUserId, property)) {
            throw new ValidationException("You cannot enquire about a property you manage.");
        }
        // Checked here as well as by the partial unique index. The index is the
        // guarantee; this is the readable message.
        if (enquiryRepository
                .findByPropertyIdAndEnquirerUserIdAndStatus(propertyId, actorUserId, EnquiryStatus.NEW)
                .isPresent()) {
            throw new ValidationException("You already have an open enquiry with this property.");
        }

        UserSummaryResponse enquirer = authModule.findById(actorUserId).orElse(null);

        // The standing decision is read exactly ONCE, here, and then frozen onto
        // the enquiry. Everything downstream reads the snapshot, so changing the
        // setting later governs the next enquiry and leaves this one as asked.
        List<ReachableChannelResponse> reachable =
                reachableChannels(enquirer, consentService.liveChannels(actorUserId));

        // No "nothing is reachable" guard any more. It existed because an
        // enquiry with every detail declined was one nobody could ever answer,
        // and it would have sat in the property's queue with no way to clear
        // it. Chat removed that: every enquiry now carries a reply path that
        // needs no contact details at all, so declining is a complete and
        // answerable choice rather than a dead end.

        Set<EnquiryResponseChannel> shared = reachable.stream()
                .map(ReachableChannelResponse::channel)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(EnquiryResponseChannel.class)));

        Instant now = Instant.now();
        Enquiry raised = Enquiry.raise(propertyId, actorUserId, request.message(), shared);
        // Before the save, so the handler is part of the row's first write. In
        // every mode but system turns this assigns nobody.
        EnquiryHandlerMode mode = handlerService.assignOnArrival(raised, property, now);
        Enquiry enquiry = enquiryRepository.save(raised);

        eventPublisher.publishEvent(new EnquiryRaisedEvent(enquiry.getId(), propertyId, actorUserId, now));
        tellManagementOfNewEnquiry(property, enquiry, enquirer, mode);

        log.info(
                "Enquiry raised enquiryId={} propertyId={} enquirerUserId={} handlerMode={} handlerUserId={}",
                enquiry.getId(), propertyId, actorUserId, mode, enquiry.getHandlerUserId());

        return new EnquiryReceiptResponse(
                enquiry.getId(),
                propertyId,
                property.name(),
                enquiry.askedAt(),
                reachable,
                emailChannelState(enquirer));
    }

    // ---- Management side: reading ----------------------------------------

    /**
     * The whole visible list at once.
     *
     * <p>Kept for the screen that still reads it. New screens use
     * {@link #pageForProperty}, which stays the same size however many
     * enquiries a property has collected.
     */
    @Transactional(readOnly = true)
    public List<EnquiryDetailResponse> listForProperty(UUID actorUserId, UUID propertyId) {
        Viewer viewer = viewerOf(actorUserId, propertyId);
        return describe(enquiryRepository.findVisibleForProperty(propertyId, hiddenBefore()), viewer);
    }

    /**
     * One page of the property's enquiries, newest first.
     *
     * @param scope ALL for the property's list, MINE for the ones the person
     *              asking handles
     */
    @Transactional(readOnly = true)
    public PageResponse<EnquiryDetailResponse> pageForProperty(
            UUID actorUserId, UUID propertyId, EnquiryListScope scope, int page, int size) {
        Viewer viewer = viewerOf(actorUserId, propertyId);

        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE));
        Page<Enquiry> found = scope == EnquiryListScope.MINE
                ? enquiryRepository.findVisiblePageForHandler(propertyId, actorUserId, hiddenBefore(), pageable)
                : enquiryRepository.findVisiblePageForProperty(propertyId, hiddenBefore(), pageable);

        return new PageResponse<>(
                describe(found.getContent(), viewer),
                found.getNumber(),
                found.getSize(),
                found.getTotalElements(),
                found.getTotalPages(),
                found.hasNext(),
                found.hasPrevious());
    }

    @Transactional(readOnly = true)
    public long countOpenForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        return enquiryRepository.countAwaitingAnswer(propertyId, Instant.now());
    }

    /** The screen's three badges, in one query. */
    @Transactional(readOnly = true)
    public EnquiryCountsResponse countsForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        AwaitingCounts counts = enquiryRepository.countAwaiting(propertyId, actorUserId, Instant.now());
        return new EnquiryCountsResponse(counts.getAwaiting(), counts.getMine(), counts.getUnassigned());
    }

    /**
     * The calls the person asking still has to settle on this property.
     *
     * <p>What "Did they respond?" walks through when they open My enquiries.
     * Each of those enquiries takes no further call until its one is settled.
     * Their other enquiries are not held up.
     */
    @Transactional(readOnly = true)
    public List<EnquiryCallToSettleResponse> callsToSettle(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        List<EnquiryResponse> calls = enquiryResponseRepository.findCallsToSettle(actorUserId, propertyId);
        if (calls.isEmpty()) {
            return List.of();
        }

        Map<UUID, Enquiry> enquiries = enquiryRepository
                .findAllById(calls.stream().map(EnquiryResponse::getEnquiryId).toList())
                .stream()
                .collect(Collectors.toMap(Enquiry::getId, Function.identity()));

        Set<UUID> userIds = new LinkedHashSet<>();
        for (EnquiryResponse call : calls) {
            userIds.add(call.getRespondedByUserId());
        }
        for (Enquiry enquiry : enquiries.values()) {
            userIds.add(enquiry.getEnquirerUserId());
        }
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(userIds);

        List<EnquiryCallToSettleResponse> toSettle = new ArrayList<>();
        for (EnquiryResponse call : calls) {
            Enquiry enquiry = enquiries.get(call.getEnquiryId());
            if (enquiry == null) {
                continue;
            }
            toSettle.add(new EnquiryCallToSettleResponse(
                    call.getId(),
                    enquiry.getId(),
                    nameOf(users, enquiry.getEnquirerUserId()),
                    call.getRespondedByUserId(),
                    nameOf(users, call.getRespondedByUserId()),
                    call.getCreatedAt(),
                    call.getNote(),
                    enquiry.getVersion()));
        }
        return toSettle;
    }

    // ---- Management side: acting -----------------------------------------

    /**
     * Starts reaching out to the enquirer.
     *
     * <p><b>A call</b> records an open attempt and nothing else. The dialer
     * opens on the phone, and the app cannot know whether anyone picked up, so
     * the enquiry stays unanswered until {@link #settleAttempt} says so. One
     * open call per enquiry: a second is refused until the first is settled.
     *
     * <p><b>Chat</b> only opens the conversation. Nothing has been said yet, so
     * there is no attempt to record. The first message is the attempt, and it
     * arrives through {@link #onChatMessage}.
     */
    @Transactional
    public EnquiryDetailResponse respond(UUID actorUserId, UUID enquiryId, RespondToEnquiryRequest request) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        Viewer viewer = viewerOf(actorUserId, enquiry.getPropertyId());
        VersionGuard.claim(enquiry);

        // Refused server-side as well as greyed out in the UI. The card can be
        // stale — it was rendered before the sweep ran — and an expired enquiry
        // is one the enquirer has been freed to re-raise, so answering it now
        // would be answering a question that has already been withdrawn.
        if (enquiry.isExpired()) {
            throw new ValidationException("This enquiry has expired. The enquirer can raise a new one.");
        }
        handlerService.ensureMayAct(actorUserId, enquiry, viewer.ownerUserId(), viewer.mode());

        // Said plainly, ahead of the reachability check, which would otherwise
        // answer with "cannot be reached" and leave an old screen guessing why.
        if (request.channel() == EnquiryResponseChannel.EMAIL) {
            throw new ValidationException("Email is no longer a way to respond. Use chat or a call.");
        }

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        // The snapshot, not today's setting. What the property was told it could
        // use when the question arrived is what it may use to answer it.
        ensureChannelIsReachable(request.channel(), enquirer, enquiry.getSharedChannels());

        Instant now = Instant.now();
        if (request.channel() == EnquiryResponseChannel.CHAT) {
            // Idempotent on the enquiry id, so opening it twice lands in the
            // same thread.
            enquiry.attachChatThread(chatModule.openEnquiryThread(
                    enquiry.getPropertyId(), enquiry.getId(), enquiry.getEnquirerUserId(), actorUserId));
        } else {
            if (enquiryResponseRepository
                    .findByEnquiryIdAndChannelAndOutcome(
                            enquiryId, EnquiryResponseChannel.CALL_BACK, EnquiryAttemptOutcome.OPEN)
                    .isPresent()) {
                throw new ValidationException("Say whether they responded to the last call first.");
            }
            enquiryResponseRepository.save(
                    EnquiryResponse.attempt(enquiryId, request.channel(), actorUserId).withNote(request.note()));
            handlerService.takeOnFirstAttempt(enquiry, actorUserId, viewer.ownerUserId(), viewer.mode(), now);
        }

        log.info(
                "Enquiry attempt started enquiryId={} channel={} byUserId={}",
                enquiry.getId(), request.channel(), actorUserId);

        return describeOne(enquiry, enquirer, viewer);
    }

    /**
     * The answer to "Did they respond?" about a call.
     *
     * <p>Allowed after the enquiry's date has passed, as long as the sweep has
     * not closed the call yet: the call was made in time, and saying how it went
     * a little late does not change that.
     */
    @Transactional
    public EnquiryDetailResponse settleAttempt(
            UUID actorUserId, UUID enquiryId, UUID attemptId, SettleEnquiryAttemptRequest request) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        Viewer viewer = viewerOf(actorUserId, enquiry.getPropertyId());
        VersionGuard.claim(enquiry);

        EnquiryResponse attempt = enquiryResponseRepository.findById(attemptId)
                .filter(found -> found.getEnquiryId().equals(enquiryId))
                .orElseThrow(() -> new NotFoundException("Enquiry attempt", attemptId));

        if (attempt.getChannel() != EnquiryResponseChannel.CALL_BACK) {
            throw new ValidationException("A chat is settled by their reply, not by hand.");
        }
        if (!maySettle(actorUserId, attempt, enquiry, viewer.ownerUserId())) {
            throw new ValidationException("Only the person who called, the handler or the owner can say how it went.");
        }

        Instant now = Instant.now();
        attempt.settle(request.outcome(), request.note(), now);
        if (attempt.succeeded()) {
            recordSuccess(enquiry, EnquiryResponseChannel.CALL_BACK, now);
        }

        log.info(
                "Enquiry call settled enquiryId={} attemptId={} outcome={} byUserId={}",
                enquiryId, attemptId, attempt.getOutcome(), actorUserId);

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        return describeOne(enquiry, enquirer, viewer);
    }

    /**
     * The owner gives an enquiry to themselves or to a manager.
     *
     * <p>Works in every mode, and on an enquiry that already has a handler: that
     * is what reassigning is.
     */
    @Transactional
    public EnquiryDetailResponse assign(UUID actorUserId, UUID enquiryId, AssignEnquiryHandlerRequest request) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        propertyModule.ensureOwner(actorUserId, enquiry.getPropertyId());
        PropertyResponse property = propertyModule.getActiveProperty(enquiry.getPropertyId());
        Viewer viewer = new Viewer(actorUserId, property.ownerId(), handlerService.modeOf(property.id()));
        VersionGuard.claim(enquiry);

        if (enquiry.isExpired()) {
            throw new ValidationException("This enquiry has expired. The enquirer can raise a new one.");
        }
        UUID handlerUserId = request.handlerUserId();
        if (!handlerUserId.equals(property.ownerId())
                && !propertyModule.findActiveManagerUserIds(property.id()).contains(handlerUserId)) {
            throw new ValidationException("Choose yourself or a manager of this property.");
        }

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        if (!enquiry.isHandledBy(handlerUserId)) {
            handlerService.assignByOwner(enquiry, handlerUserId, actorUserId, Instant.now());
            // The owner giving it to themselves needs no notice about it.
            if (!handlerUserId.equals(actorUserId)) {
                tellHandlerOfAssignment(
                        handlerUserId, property, enquiry,
                        "You now handle " + whoAsked(enquirer) + "'s enquiry for " + property.name() + ".");
            }
        }

        return describeOne(enquiry, enquirer, viewer);
    }

    /**
     * What the handler makes of the enquirer: interested or not.
     *
     * <p>Only once the enquirer has been reached. Before that there is nothing
     * to read a sentiment from. It can be set again to change it.
     */
    @Transactional
    public EnquiryDetailResponse setSentiment(
            UUID actorUserId, UUID enquiryId, SetEnquirySentimentRequest request) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        Viewer viewer = viewerOf(actorUserId, enquiry.getPropertyId());
        VersionGuard.claim(enquiry);

        if (enquiry.isExpired()) {
            throw new ValidationException("This conversation has ended.");
        }
        handlerService.ensureMayAct(actorUserId, enquiry, viewer.ownerUserId(), viewer.mode());
        if (enquiry.getRespondedAt() == null) {
            throw new ValidationException("They have not replied yet.");
        }

        enquiry.setSentiment(request.sentiment(), actorUserId, Instant.now());
        log.info("Enquiry sentiment set enquiryId={} sentiment={} byUserId={}",
                enquiryId, request.sentiment(), actorUserId);

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        return describeOne(enquiry, enquirer, viewer);
    }

    /**
     * Takes the handler's reading back to undecided ("Not decided", 2026-10-02).
     *
     * <p>The chat's actions follow from the sentiment, so clearing it also
     * withdraws the Schedule visit or End conversation it had offered. Same
     * gate as setting one; clearing what is already clear changes nothing.
     */
    @Transactional
    public EnquiryDetailResponse clearSentiment(UUID actorUserId, UUID enquiryId) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        Viewer viewer = viewerOf(actorUserId, enquiry.getPropertyId());
        VersionGuard.claim(enquiry);

        if (enquiry.isExpired()) {
            throw new ValidationException("This conversation has ended.");
        }
        handlerService.ensureMayAct(actorUserId, enquiry, viewer.ownerUserId(), viewer.mode());

        enquiry.clearSentiment();
        log.info("Enquiry sentiment cleared enquiryId={} byUserId={}", enquiryId, actorUserId);

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        return describeOne(enquiry, enquirer, viewer);
    }

    /**
     * The handler ends the conversation.
     *
     * <p>Closes the chat for both sides and ends the enquiry's window now.
     * Whatever attempt was still open ends as failed, as it would at expiry.
     * Doing it twice is harmless.
     */
    @Transactional
    public EnquiryDetailResponse endConversation(UUID actorUserId, UUID enquiryId) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId)
                .orElseThrow(() -> new NotFoundException("Enquiry", enquiryId));

        Viewer viewer = viewerOf(actorUserId, enquiry.getPropertyId());
        VersionGuard.claim(enquiry);
        handlerService.ensureMayAct(actorUserId, enquiry, viewer.ownerUserId(), viewer.mode());

        Instant now = Instant.now();
        if (enquiry.end(actorUserId, now)) {
            for (EnquiryResponse attempt : enquiryResponseRepository.findByEnquiryIdAndOutcome(
                    enquiryId, EnquiryAttemptOutcome.OPEN)) {
                attempt.settle(EnquiryAttemptOutcome.FAILED, null, now);
            }
            closeChatOf(enquiry, now);
            eventPublisher.publishEvent(new EnquiryEndedEvent(
                    enquiryId, enquiry.getPropertyId(), enquiry.getEnquirerUserId(), now));
            log.info("Enquiry conversation ended enquiryId={} byUserId={}", enquiryId, actorUserId);
        }

        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);
        return describeOne(enquiry, enquirer, viewer);
    }

    /**
     * Closes the chat of an enquiry whose date has passed. Called by the sweep,
     * one enquiry per transaction.
     *
     * @return true when a chat was closed
     */
    @Transactional
    public boolean closeChatOfExpired(UUID enquiryId) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId).orElse(null);
        if (enquiry == null || !enquiry.hasOpenChat() || !enquiry.isExpired()) {
            return false;
        }
        closeChatOf(enquiry, Instant.now());
        return true;
    }

    private void closeChatOf(Enquiry enquiry, Instant now) {
        if (enquiry.hasOpenChat()) {
            chatModule.closeEnquiryThread(enquiry.getId());
            enquiry.markChatClosed(now);
        }
    }

    /**
     * What someone is to an enquiry, for a module that lets both sides act on
     * it (the leads pipeline, when either books a visit).
     */
    @Transactional(readOnly = true)
    public EnquiryParty partyOf(UUID enquiryId, UUID actorUserId) {
        Enquiry enquiry = enquiryRepository.findById(enquiryId).orElse(null);
        if (enquiry == null) {
            return EnquiryParty.OUTSIDER;
        }
        if (actorUserId.equals(enquiry.getEnquirerUserId())) {
            return EnquiryParty.ENQUIRER;
        }
        PropertyResponse property;
        try {
            property = propertyModule.getActiveProperty(enquiry.getPropertyId());
        } catch (NotFoundException gone) {
            return EnquiryParty.OUTSIDER;
        }
        if (!managesProperty(actorUserId, property)) {
            return EnquiryParty.OUTSIDER;
        }
        return EnquiryHandlerService.mayAct(
                        actorUserId, enquiry, property.ownerId(), handlerService.modeOf(property.id()))
                ? EnquiryParty.ACTING_MANAGEMENT
                : EnquiryParty.OTHER_MANAGEMENT;
    }

    // ---- What other modules tell us --------------------------------------

    /**
     * A message was sent in a conversation. Chat attempts are read off these.
     *
     * <p>From management, on an enquiry still unanswered: the first message is
     * the attempt. It takes the handler role if nobody has it, and stays open
     * until the enquirer writes back. Further messages change nothing.
     *
     * <p>From the enquirer: their first reply after an attempt settles it as
     * successful, and the enquiry is answered.
     *
     * <p>Arrives at least once and not always in order. The enquiry is locked,
     * a repeat finds nothing left to do, and a message told about after the
     * reply that followed it asks the chat module whether that reply exists.
     */
    @Transactional
    public void onChatMessage(ChatMessageSentEvent event) {
        if (event.origin() != ChatThreadOrigin.ENQUIRY || event.originId() == null) {
            return;
        }
        Enquiry enquiry = enquiryRepository.findByIdForUpdate(event.originId()).orElse(null);
        if (enquiry == null) {
            return;
        }
        Instant sentAt = event.sentAt() != null ? event.sentAt() : Instant.now();
        Optional<EnquiryResponse> openChat = enquiryResponseRepository.findByEnquiryIdAndChannelAndOutcome(
                enquiry.getId(), EnquiryResponseChannel.CHAT, EnquiryAttemptOutcome.OPEN);

        if (event.senderUserId().equals(enquiry.getEnquirerUserId())) {
            // With no open attempt this is the enquirer writing before anyone
            // wrote to them, or writing again. Neither is a response.
            openChat.ifPresent(attempt -> {
                attempt.settle(EnquiryAttemptOutcome.SUCCEEDED, null, sentAt);
                recordSuccess(enquiry, EnquiryResponseChannel.CHAT, sentAt);
                tellHandlerOfChatReply(enquiry, attempt, event.threadId());
                log.info("Enquiry answered in chat enquiryId={} attemptId={}", enquiry.getId(), attempt.getId());
            });
            return;
        }

        // Only an unanswered, unexpired enquiry takes an attempt. Past that,
        // messages are just the conversation carrying on.
        if (openChat.isPresent() || !enquiry.isOpen() || enquiry.isExpired()) {
            return;
        }
        PropertyResponse property;
        try {
            property = propertyModule.getActiveProperty(enquiry.getPropertyId());
        } catch (NotFoundException gone) {
            return;
        }
        UUID sender = event.senderUserId();
        if (!managesProperty(sender, property)) {
            return;
        }
        EnquiryHandlerMode mode = handlerService.modeOf(property.id());
        if (!EnquiryHandlerService.mayAct(sender, enquiry, property.ownerId(), mode)) {
            // They can write in the thread. It is not theirs to answer.
            return;
        }

        enquiry.attachChatThread(event.threadId());
        handlerService.takeOnFirstAttempt(enquiry, sender, property.ownerId(), mode, sentAt);

        EnquiryResponse attempt = EnquiryResponse.attempt(enquiry.getId(), EnquiryResponseChannel.CHAT, sender);
        // Told about this message after the reply to it was already handled:
        // that reply found nothing to settle, so settle it here.
        if (chatModule.hasWrittenSince(event.threadId(), enquiry.getEnquirerUserId(), sentAt)) {
            Instant now = Instant.now();
            attempt.settle(EnquiryAttemptOutcome.SUCCEEDED, null, now);
            recordSuccess(enquiry, EnquiryResponseChannel.CHAT, now);
            tellHandlerOfChatReply(enquiry, attempt, event.threadId());
        }
        enquiryResponseRepository.save(attempt);

        log.info("Enquiry chat attempt recorded enquiryId={} byUserId={} outcome={}",
                enquiry.getId(), sender, attempt.getOutcome());
    }

    /**
     * A manager left the property. Their enquiries go back to the owner, who is
     * told once, with how many.
     */
    @Transactional
    public void onManagerRemoved(UUID propertyId, UUID managerUserId) {
        PropertyResponse property;
        try {
            property = propertyModule.getActiveProperty(propertyId);
        } catch (NotFoundException gone) {
            return;
        }

        int returned = handlerService.returnToOwner(propertyId, managerUserId, property.ownerId());
        if (returned == 0) {
            return;
        }
        notificationModule.notifyUser(
                property.ownerId(),
                "Enquiries are back with you",
                returned == 1
                        ? "A manager left " + property.name() + ". Their 1 enquiry is now yours to handle."
                        : "A manager left " + property.name() + ". Their " + returned
                                + " enquiries are now yours to handle.",
                NotificationCategory.ENQUIRY,
                NotificationPriority.NORMAL,
                NotificationSubtype.ENQUIRY_ASSIGNED,
                propertyId,
                Map.of("propertyId", propertyId.toString()),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    // ---- Rules -----------------------------------------------------------

    /**
     * The channels this person can actually be reached on.
     *
     * <p>Two conditions, both required. The channel has to <em>work</em>: a
     * verified phone is a precondition of having an account. And the enquirer
     * has to have <em>agreed</em> to it — a working number they never offered is
     * not a channel, it is a detail nobody asked to hand over.
     *
     * <p>Management is shown only what comes out of here. Not the closed
     * channels greyed out with an explanation: a channel someone declined is not
     * management's business, and showing it invites working around it.
     *
     * <p><b>Email is never offered</b> (2026-10-02), whatever was consented to
     * and whatever an older enquiry's snapshot holds. A sent email cannot be
     * tracked, so nobody could ever say whether it reached anyone.
     */
    static List<ReachableChannelResponse> reachableChannels(
            UserSummaryResponse user,
            Set<EnquiryResponseChannel> consented) {
        List<ReachableChannelResponse> channels = new ArrayList<>();
        if (user == null) {
            return channels;
        }
        if (consented.contains(EnquiryResponseChannel.CALL_BACK)
                && user.phone() != null && !user.phone().isBlank()) {
            channels.add(new ReachableChannelResponse(EnquiryResponseChannel.CALL_BACK, user.phone()));
        }
        // Always, and with no value beside it. Chat is the one channel that
        // hands the responder nothing they could keep: a number can be saved and
        // reused past anything this app can revoke, a conversation cannot. That
        // is why it needs no consent to appear and why it is never stored as
        // one — there is nothing to agree to and nothing to withdraw.
        channels.add(new ReachableChannelResponse(EnquiryResponseChannel.CHAT, null));
        return channels;
    }

    /**
     * Distinguishes "no email" from "email not verified".
     *
     * <p>Still sent on the receipt and the consent screen for the app versions
     * that read it. It no longer opens a channel: email was removed as one on
     * 2026-10-02.
     */
    static EmailChannelState emailChannelState(UserSummaryResponse user) {
        if (user == null || user.email() == null || user.email().isBlank()) {
            return EmailChannelState.NOT_REGISTERED;
        }
        return user.emailVerified() ? EmailChannelState.AVAILABLE : EmailChannelState.UNVERIFIED;
    }

    /**
     * Who may say how a call went: the person who made it, whoever handles the
     * enquiry now, and the owner.
     */
    static boolean maySettle(UUID actorUserId, EnquiryResponse attempt, Enquiry enquiry, UUID ownerUserId) {
        return actorUserId.equals(attempt.getRespondedByUserId())
                || enquiry.isHandledBy(actorUserId)
                || actorUserId.equals(ownerUserId);
    }

    private void ensureChannelIsReachable(
            EnquiryResponseChannel channel,
            UserSummaryResponse enquirer,
            Set<EnquiryResponseChannel> consented) {
        // Never refused, and deliberately ahead of the snapshot check. The
        // frozen set holds what the enquirer SHARED, and chat shares nothing —
        // so it is absent from every enquiry raised before this landed, and
        // asking the snapshot about it would refuse the one channel that has no
        // consent to be missing.
        if (channel == EnquiryResponseChannel.CHAT) {
            return;
        }
        boolean reachable = reachableChannels(enquirer, consented).stream()
                .anyMatch(option -> option.channel() == channel);
        if (!reachable) {
            // One message for both halves of the rule on purpose. Telling a
            // responder WHICH condition failed would tell them the enquirer
            // declined this channel, and that is a fact about the enquirer that
            // the responder has no claim on.
            throw new ValidationException("This person cannot be reached on that channel.");
        }
    }

    /**
     * An attempt succeeded. The first one answers the enquiry and is announced
     * to other modules. Later ones change nothing: the enquiry is answered once.
     */
    private void recordSuccess(Enquiry enquiry, EnquiryResponseChannel channel, Instant now) {
        if (enquiry.markResponded(now)) {
            eventPublisher.publishEvent(new EnquiryRespondedEvent(
                    enquiry.getId(), enquiry.getPropertyId(), enquiry.getEnquirerUserId(), channel, now));
        }
    }

    private boolean managesProperty(UUID actorUserId, PropertyResponse property) {
        return actorUserId.equals(property.ownerId())
                || propertyModule.findActiveManagerUserIds(property.id()).contains(actorUserId);
    }

    // ---- Plumbing --------------------------------------------------------

    /** Checks the person is in the property's management, and reads what they may do there. */
    private Viewer viewerOf(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        return new Viewer(actorUserId, property.ownerId(), handlerService.modeOf(propertyId));
    }

    /**
     * An expired enquiry stays on the list, greyed out, for a day past its date.
     * This is the date before which it has dropped off.
     */
    private static Instant hiddenBefore() {
        return Instant.now().minus(Enquiry.VISIBLE_AFTER_EXPIRY);
    }

    /**
     * Cards for a list of enquiries, with the same number of queries whether
     * the list holds one or fifty: every attempt in one read, every name in
     * another.
     */
    private List<EnquiryDetailResponse> describe(List<Enquiry> enquiries, Viewer viewer) {
        if (enquiries.isEmpty()) {
            return List.of();
        }

        // Every attempt, grouped — this is the action log. The query already
        // orders newest first, and groupingBy preserves encounter order, so each
        // list arrives in the order the log wants to show it.
        Map<UUID, List<EnquiryResponse>> attemptsByEnquiry = enquiryResponseRepository
                .findByEnquiryIdInOrderByCreatedAtDesc(enquiries.stream().map(Enquiry::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(EnquiryResponse::getEnquiryId));

        Set<UUID> userIds = new LinkedHashSet<>();
        for (Enquiry enquiry : enquiries) {
            userIds.add(enquiry.getEnquirerUserId());
            if (enquiry.hasHandler()) {
                userIds.add(enquiry.getHandlerUserId());
            }
        }
        attemptsByEnquiry.values().stream()
                .flatMap(List::stream)
                .forEach(attempt -> userIds.add(attempt.getRespondedByUserId()));
        Map<UUID, UserSummaryResponse> users = authModule.findByIds(userIds);

        // No consent lookup here. Each enquiry carries the set it was raised
        // with, which is both the correct answer and one fewer query per page
        // than asking the consent table for every enquirer on it.
        return enquiries.stream()
                .map(enquiry -> toDetail(
                        enquiry,
                        users.get(enquiry.getEnquirerUserId()),
                        attemptsByEnquiry.getOrDefault(enquiry.getId(), List.of()),
                        users,
                        viewer))
                .toList();
    }

    /**
     * One card, after an action on it.
     *
     * <p>Re-reads the whole log rather than returning just the new row: the
     * card that receives this renders the log from it, and handing back a
     * one-entry list would make the history look like it had been erased.
     */
    private EnquiryDetailResponse describeOne(Enquiry enquiry, UserSummaryResponse enquirer, Viewer viewer) {
        List<EnquiryResponse> attempts =
                enquiryResponseRepository.findByEnquiryIdInOrderByCreatedAtDesc(List.of(enquiry.getId()));

        Set<UUID> userIds = new LinkedHashSet<>();
        attempts.forEach(attempt -> userIds.add(attempt.getRespondedByUserId()));
        if (enquiry.hasHandler()) {
            userIds.add(enquiry.getHandlerUserId());
        }
        return toDetail(enquiry, enquirer, attempts, authModule.findByIds(userIds), viewer);
    }

    private EnquiryDetailResponse toDetail(
            Enquiry enquiry,
            UserSummaryResponse enquirer,
            List<EnquiryResponse> attempts,
            Map<UUID, UserSummaryResponse> users,
            Viewer viewer) {
        // The contact detail is read off the reachable list rather than off the
        // user, so there is exactly one place where "may management see this"
        // is decided. Phone used to be sent unconditionally, which is how a
        // responder ended up keeping a number the enquirer never offered.
        List<ReachableChannelResponse> reachable = reachableChannels(enquirer, enquiry.getSharedChannels());

        EnquiryResponse callToSettle = attempts.stream()
                .filter(attempt -> attempt.getChannel() == EnquiryResponseChannel.CALL_BACK && attempt.isOpen())
                .findFirst()
                .orElse(null);

        return new EnquiryDetailResponse(
                enquiry.getId(),
                enquiry.getPropertyId(),
                enquiry.getMessage(),
                enquiry.getStatus(),
                enquiry.askedAt(),
                enquiry.getExpiresAt(),
                enquiry.getEnquirerUserId(),
                enquirer != null ? enquirer.fullName() : null,
                targetOf(reachable, EnquiryResponseChannel.CALL_BACK),
                targetOf(reachable, EnquiryResponseChannel.EMAIL),
                reachable,
                enquiry.getChatThreadId(),
                attempts.stream()
                        .map(attempt -> EnquiryResponseView.of(attempt, nameOf(users, attempt.getRespondedByUserId())))
                        .toList(),
                enquiry.getHandlerUserId(),
                enquiry.hasHandler() ? nameOf(users, enquiry.getHandlerUserId()) : null,
                enquiry.getHandlerAssignedBy(),
                enquiry.getHandlerAssignedAt(),
                enquiry.getRespondedAt(),
                EnquiryHandlerService.mayAct(viewer.userId(), enquiry, viewer.ownerUserId(), viewer.mode()),
                callToSettle != null ? callToSettle.getId() : null,
                callToSettle != null
                        && maySettle(viewer.userId(), callToSettle, enquiry, viewer.ownerUserId()),
                enquiry.getSentiment(),
                enquiry.getEndedAt(),
                enquiry.getVersion());
    }

    private static String targetOf(List<ReachableChannelResponse> reachable, EnquiryResponseChannel channel) {
        return reachable.stream()
                .filter(option -> option.channel() == channel)
                .map(ReachableChannelResponse::target)
                .findFirst()
                .orElse(null);
    }

    /**
     * Tells the right people a new enquiry arrived. Who that is depends on how
     * the property chooses its handler:
     * <ul>
     * <li>first to respond: everyone, because anyone may take it;</li>
     * <li>system turns: the one it was given to, told the system chose them;</li>
     * <li>owner assigns: the owner, who has to give it to someone.</li>
     * </ul>
     */
    private void tellManagementOfNewEnquiry(
            PropertyResponse property, Enquiry enquiry, UserSummaryResponse enquirer, EnquiryHandlerMode mode) {
        String who = whoAsked(enquirer);

        if (enquiry.hasHandler()) {
            tellHandlerOfAssignment(
                    enquiry.getHandlerUserId(), property, enquiry,
                    who + " asked about " + property.name() + ". The system gave this enquiry to you.");
            return;
        }

        Set<UUID> recipients = new LinkedHashSet<>();
        recipients.add(property.ownerId());
        if (mode != EnquiryHandlerMode.OWNER_ASSIGNS) {
            recipients.addAll(propertyModule.findActiveManagerUserIds(property.id()));
        }

        notificationModule.notifyUsers(
                recipients,
                "New enquiry for " + property.name(),
                who + ": " + enquiry.getMessage(),
                NotificationCategory.ENQUIRY,
                NotificationPriority.NORMAL,
                NotificationSubtype.ENQUIRY_RECEIVED,
                enquiry.getId(),
                enquiryData(property, enquiry),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private void tellHandlerOfAssignment(
            UUID handlerUserId, PropertyResponse property, Enquiry enquiry, String body) {
        notificationModule.notifyUser(
                handlerUserId,
                "Enquiry assigned to you",
                body,
                NotificationCategory.ENQUIRY,
                NotificationPriority.NORMAL,
                NotificationSubtype.ENQUIRY_ASSIGNED,
                enquiry.getId(),
                enquiryData(property, enquiry),
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    /**
     * The chat the handler was waiting on has been answered. Push and in-app,
     * to the handler alone (owner's rule, 2026-10-03).
     *
     * <p>Sent when the pending chat becomes successful, which happens once per
     * attempt. The chat module sends its own notice for the message itself.
     * This one says what the message means: the enquiry is answered.
     */
    private void tellHandlerOfChatReply(Enquiry enquiry, EnquiryResponse attempt, UUID threadId) {
        // A chat attempt always leaves a handler behind. The author is the
        // fallback for a row that somehow has none.
        UUID handlerUserId = enquiry.hasHandler() ? enquiry.getHandlerUserId() : attempt.getRespondedByUserId();
        UserSummaryResponse enquirer = authModule.findById(enquiry.getEnquirerUserId()).orElse(null);

        Map<String, String> data = new LinkedHashMap<>();
        data.put("enquiryId", enquiry.getId().toString());
        data.put("propertyId", enquiry.getPropertyId().toString());
        if (threadId != null) {
            data.put("threadId", threadId.toString());
        }

        notificationModule.notifyUser(
                handlerUserId,
                "Enquiry answered",
                whoAsked(enquirer) + " has responded over enquiry chat.",
                NotificationCategory.ENQUIRY,
                NotificationPriority.HIGH,
                NotificationSubtype.ENQUIRY_CHAT_REPLIED,
                enquiry.getId(),
                data,
                NotificationDeliveryMode.IN_APP_AND_PUSH);
    }

    private static Map<String, String> enquiryData(PropertyResponse property, Enquiry enquiry) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("enquiryId", enquiry.getId().toString());
        data.put("propertyId", property.id().toString());
        return data;
    }

    private static String whoAsked(UserSummaryResponse enquirer) {
        return enquirer != null && enquirer.fullName() != null ? enquirer.fullName() : "Someone";
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> users, UUID userId) {
        return Optional.ofNullable(users.get(userId)).map(UserSummaryResponse::fullName).orElse(null);
    }
}
