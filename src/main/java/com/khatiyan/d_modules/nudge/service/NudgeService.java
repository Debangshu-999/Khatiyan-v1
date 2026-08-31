package com.khatiyan.d_modules.nudge.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.nudge.api.dto.NudgeCandidateResponse;
import com.khatiyan.d_modules.nudge.api.dto.NudgeResponse;
import com.khatiyan.d_modules.nudge.api.dto.SendNudgeRequest;
import com.khatiyan.d_modules.nudge.model.Nudge;
import com.khatiyan.d_modules.nudge.repository.NudgeRepository;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.tenancy.TenancyModule;
import com.khatiyan.d_modules.tenancy.api.dto.TenancyResponse;
import com.khatiyan.d_modules.tenancy.model.TenancyStatus;

import lombok.extern.slf4j.Slf4j;

/**
 * Sending and reading nudges.
 *
 * <p>Permission runs through {@link PropertyModule#ensureCanManageProperty},
 * the single chokepoint every new module uses, so managers can nudge today and
 * a per-resource gate can be dropped in later without touching call sites.
 */
@Slf4j
@Service
public class NudgeService {

    /**
     * Both screens window to a week. Older nudges are not deleted — they simply
     * stop being shown, the same way the notification feed treats its own
     * seven-day bucket.
     */
    private static final Duration VISIBLE_WINDOW = Duration.ofDays(7);

    private final NudgeRepository nudgeRepository;
    private final TenancyModule tenancyModule;
    private final PropertyModule propertyModule;
    private final AuthModule authModule;
    private final NotificationModule notificationModule;
    private final Clock clock;

    public NudgeService(
            NudgeRepository nudgeRepository,
            TenancyModule tenancyModule,
            PropertyModule propertyModule,
            AuthModule authModule,
            NotificationModule notificationModule,
            Clock clock) {
        this.nudgeRepository = nudgeRepository;
        this.tenancyModule = tenancyModule;
        this.propertyModule = propertyModule;
        this.authModule = authModule;
        this.notificationModule = notificationModule;
        this.clock = clock;
    }

    // ---- Management side -------------------------------------------------

    /**
     * Every active tenant of the property, with their cooldown state.
     *
     * <p>Tenants on notice are included: they still live there, and a notice
     * period is when a reminder about the last month's rent matters most.
     */
    @Transactional(readOnly = true)
    public List<NudgeCandidateResponse> listCandidates(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        // Guest stays cannot be nudged. A nudge is a push notification to the
        // tenant's app, and a daily guest holds no account to receive one — a
        // row for them would be a button that can never do anything.
        List<TenancyResponse> tenancies = tenancyModule.findActiveByPropertyId(propertyId).stream()
                .filter(tenancy -> tenancy.userId() != null)
                .toList();
        if (tenancies.isEmpty()) {
            return List.of();
        }

        Map<UUID, UserSummaryResponse> users = authModule.findByIds(
                tenancies.stream().map(TenancyResponse::userId).toList());
        Map<UUID, RoomResponse> rooms = propertyModule.findRoomsForDisplay(
                propertyId, tenancies.stream().map(TenancyResponse::roomId).toList());
        Map<UUID, Nudge> latestByTenancy = nudgeRepository
                .findLatestPerTenancy(tenancies.stream().map(TenancyResponse::id).toList())
                .stream()
                .collect(Collectors.toMap(Nudge::getTenancyId, Function.identity(), (a, b) -> a));

        Instant now = clock.instant();

        return tenancies.stream()
                .map(tenancy -> {
                    UserSummaryResponse user = users.get(tenancy.userId());
                    RoomResponse room = rooms.get(tenancy.roomId());
                    Nudge latest = latestByTenancy.get(tenancy.id());
                    boolean cooling = latest != null && latest.isInCooldownAt(now);
                    return new NudgeCandidateResponse(
                            tenancy.id(),
                            tenancy.userId(),
                            user != null ? user.fullName() : null,
                            room != null ? room.roomNumber() : null,
                            latest != null ? latest.getSentAt() : null,
                            cooling ? latest.cooldownEndsAt() : null,
                            !cooling);
                })
                // Whoever can be nudged first, so the owner is not scrolling past
                // rows they cannot act on.
                .sorted(Comparator
                        .comparing(NudgeCandidateResponse::canNudge).reversed()
                        .thenComparing(candidate -> candidate.tenantName() == null ? "" : candidate.tenantName()))
                .toList();
    }

    @Transactional
    public NudgeResponse send(UUID actorUserId, SendNudgeRequest request) {
        TenancyResponse tenancy = tenancyModule.findById(request.tenancyId())
                .orElseThrow(() -> new NotFoundException("Tenancy", request.tenancyId()));

        propertyModule.ensureCanManageProperty(actorUserId, tenancy.propertyId());
        ensureStillLivingHere(tenancy);

        Instant now = clock.instant();
        ensureCooldownHasPassed(tenancy.id(), now);

        Nudge nudge = nudgeRepository.save(Nudge.send(
                tenancy.propertyId(),
                tenancy.id(),
                tenancy.userId(),
                actorUserId,
                request.message(),
                now));

        String senderName = authModule.findById(actorUserId)
                .map(UserSummaryResponse::fullName)
                .orElse(null);
        pushToTenant(nudge, senderName);

        log.info(
                "Nudge sent nudgeId={} propertyId={} tenancyId={} senderUserId={}",
                nudge.getId(), nudge.getPropertyId(), nudge.getTenancyId(), actorUserId);

        return NudgeResponse.of(
                nudge,
                resolveName(tenancy.userId()),
                resolveRoomNumber(tenancy.propertyId(), tenancy.roomId()),
                senderName,
                true);
    }

    /** The Sent tab: every nudge for the property, whoever sent it. */
    @Transactional(readOnly = true)
    public List<NudgeResponse> listSentForProperty(UUID actorUserId, UUID propertyId) {
        propertyModule.ensureCanManageProperty(actorUserId, propertyId);

        List<Nudge> nudges = nudgeRepository
                .findByPropertyIdAndSentAtGreaterThanEqualOrderBySentAtDesc(propertyId, windowStart());
        if (nudges.isEmpty()) {
            return List.of();
        }

        Map<UUID, UserSummaryResponse> users = authModule.findByIds(nudges.stream()
                .flatMap(nudge -> Stream.of(nudge.getRecipientUserId(), nudge.getSenderUserId()))
                .collect(Collectors.toSet()));
        Map<UUID, String> roomByTenancy = roomNumbersForTenancies(
                propertyId, nudges.stream().map(Nudge::getTenancyId).collect(Collectors.toSet()));

        return nudges.stream()
                .map(nudge -> NudgeResponse.of(
                        nudge,
                        nameOf(users, nudge.getRecipientUserId()),
                        roomByTenancy.get(nudge.getTenancyId()),
                        nameOf(users, nudge.getSenderUserId()),
                        actorUserId.equals(nudge.getSenderUserId())))
                .toList();
    }

    // ---- Tenant side -----------------------------------------------------

    /**
     * The tenant's nudges, and the act of reading them.
     *
     * <p>Opening the screen is the read. The response carries the read state as
     * it was <em>before</em> this open, so unread nudges are still marked on the
     * visit that clears them and the tenant can see which ones were new.
     */
    @Transactional
    public List<NudgeResponse> listReceivedAndMarkRead(UUID userId) {
        List<Nudge> nudges = nudgeRepository
                .findByRecipientUserIdAndSentAtGreaterThanEqualOrderBySentAtDesc(userId, windowStart());

        List<NudgeResponse> responses = toTenantResponses(nudges);

        // Everything unread, not only the visible week: a nudge that aged out of
        // the window can never be read otherwise, and would hold the badge on
        // for ever.
        Instant now = clock.instant();
        List<Nudge> unread = nudgeRepository.findUnreadForRecipient(userId);
        unread.forEach(nudge -> nudge.markRead(now));

        return responses;
    }

    @Transactional(readOnly = true)
    public long countUnread(UUID userId) {
        return nudgeRepository.countByRecipientUserIdAndReadAtIsNull(userId);
    }

    private List<NudgeResponse> toTenantResponses(List<Nudge> nudges) {
        if (nudges.isEmpty()) {
            return List.of();
        }
        Map<UUID, UserSummaryResponse> senders = authModule.findByIds(
                nudges.stream().map(Nudge::getSenderUserId).collect(Collectors.toSet()));

        return nudges.stream()
                // No room number on this side — the tenant knows which room they
                // live in, and resolving it would mean a lookup per property for
                // a line nobody reads.
                .map(nudge -> NudgeResponse.of(nudge, null, null, nameOf(senders, nudge.getSenderUserId()), false))
                .toList();
    }

    // ---- Rules -----------------------------------------------------------

    /**
     * The cooldown, re-checked at send time.
     *
     * <p>The send list already showed who was cooling down, but that snapshot is
     * as old as the screen — an owner who left it open for an hour would
     * otherwise send straight through the timer.
     */
    private void ensureCooldownHasPassed(UUID tenancyId, Instant now) {
        Optional<Nudge> latest = nudgeRepository.findLatestForTenancy(tenancyId);
        if (latest.isEmpty() || !latest.get().isInCooldownAt(now)) {
            return;
        }
        throw new ValidationException(
                "This tenant was nudged recently. You can nudge them again in "
                        + describeRemaining(Duration.between(now, latest.get().cooldownEndsAt()))
                        + ".");
    }

    /**
     * Rendered here rather than on the client because it goes into the error
     * message, and a raw instant in a sentence reads like a bug.
     */
    static String describeRemaining(Duration remaining) {
        long totalMinutes = Math.max(1, (remaining.getSeconds() + 59) / 60);
        long hours = totalMinutes / 60;
        long minutes = totalMinutes % 60;
        if (hours == 0) {
            return minutes + (minutes == 1 ? " minute" : " minutes");
        }
        if (minutes == 0) {
            return hours + (hours == 1 ? " hour" : " hours");
        }
        return hours + "h " + minutes + "m";
    }

    private static final Set<TenancyStatus> LIVING_HERE = Set.of(
            TenancyStatus.ACTIVE,
            TenancyStatus.ON_NOTICE,
            TenancyStatus.ON_PREMATURE_NOTICE);

    /**
     * A nudge is a message to someone living in the property. Pending tenants
     * have not moved in and former ones have left; neither should be reachable
     * from a stale send list.
     */
    private void ensureStillLivingHere(TenancyResponse tenancy) {
        if (!LIVING_HERE.contains(tenancy.status())) {
            throw new ValidationException("This tenant is no longer staying at the property.");
        }
    }

    // ---- Plumbing --------------------------------------------------------

    private Instant windowStart() {
        return clock.instant().minus(VISIBLE_WINDOW);
    }

    /**
     * Push, with no row in the notification queue.
     *
     * <p>The nudge already has a screen and a read state of its own; a queue row
     * would mean the same message read twice, in two places, and marked read in
     * neither reliably.
     */
    private void pushToTenant(Nudge nudge, String senderName) {
        notificationModule.notifyUser(
                nudge.getRecipientUserId(),
                senderName == null || senderName.isBlank() ? "A nudge from your property" : "Nudge from " + senderName,
                nudge.getMessage(),
                NotificationCategory.NUDGE,
                NotificationPriority.NORMAL,
                NotificationSubtype.NUDGE_RECEIVED,
                nudge.getId(),
                Map.of("nudgeId", nudge.getId().toString(), "propertyId", nudge.getPropertyId().toString()),
                NotificationDeliveryMode.PUSH_ONLY);
    }

    private Map<UUID, String> roomNumbersForTenancies(UUID propertyId, Set<UUID> tenancyIds) {
        Map<UUID, TenancyResponse> tenancies = tenancyModule.findByIds(tenancyIds);
        Map<UUID, RoomResponse> rooms = propertyModule.findRoomsForDisplay(
                propertyId, tenancies.values().stream().map(TenancyResponse::roomId).toList());

        return tenancies.values().stream()
                .filter(tenancy -> rooms.containsKey(tenancy.roomId()))
                .collect(Collectors.toMap(
                        TenancyResponse::id,
                        tenancy -> rooms.get(tenancy.roomId()).roomNumber(),
                        (a, b) -> a));
    }

    private String resolveName(UUID userId) {
        return authModule.findById(userId).map(UserSummaryResponse::fullName).orElse(null);
    }

    private String resolveRoomNumber(UUID propertyId, UUID roomId) {
        return propertyModule.findRoomForDisplay(propertyId, roomId)
                .map(RoomResponse::roomNumber)
                .orElse(null);
    }

    private static String nameOf(Map<UUID, UserSummaryResponse> users, UUID userId) {
        UserSummaryResponse user = users.get(userId);
        return user == null ? null : user.fullName();
    }
}
