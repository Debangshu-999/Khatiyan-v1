package com.khatiyan.d_modules.tenancy.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.api.dto.RoomResponse;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.tenancy.api.dto.AddRollCallWifiRequest;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallCheckInRequest;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallNightResponse;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallSettingsResponse;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallTodayResponse;
import com.khatiyan.d_modules.tenancy.api.dto.SaveRollCallSettingsRequest;
import com.khatiyan.d_modules.tenancy.api.dto.SetRollCallMarkRequest;
import com.khatiyan.d_modules.tenancy.model.RollCallMark;
import com.khatiyan.d_modules.tenancy.model.RollCallMethod;
import com.khatiyan.d_modules.tenancy.model.RollCallSetting;
import com.khatiyan.d_modules.tenancy.model.RollCallStatus;
import com.khatiyan.d_modules.tenancy.model.RollCallWifi;
import com.khatiyan.d_modules.tenancy.model.RollCallWindow;
import com.khatiyan.d_modules.tenancy.model.StayOut;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.RollCallMarkRepository;
import com.khatiyan.d_modules.tenancy.repository.RollCallSettingRepository;
import com.khatiyan.d_modules.tenancy.repository.RollCallWifiRepository;
import com.khatiyan.d_modules.tenancy.repository.StayOutRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

/**
 * The nightly roll call (user, 2026-11-08, 2026-11-09 and 2026-11-15). Spec:
 * {@code docs/superpowers/specs/2026-11-15-roll-call-design.md}.
 *
 * <p>Tenants of current monthly stays at PGs and hostels mark themselves present
 * while the owner's window is open. With automatic check-in on, the app sends
 * the router it is on and where it is: a registered router, or within 100 m of
 * the property's pin with no fake location, marks them present as verified.
 * A failed check records nothing. Without it, or when it fails, Mark present
 * records a self-mark. Declared stay outs read Away (declared). Nobody becomes
 * Absent on their own: the unmarked stay Not marked for the warden, whose mark
 * wins over everything.
 */
@Service
public class RollCallService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final Set<PropertyType> FOR = Set.of(PropertyType.PG, PropertyType.HOSTEL);
    private static final Pattern BSSID = Pattern.compile("^([0-9a-f]{2}:){5}[0-9a-f]{2}$");
    /** What Android reports for the router when the app may not read it. */
    private static final String HIDDEN_BSSID = "02:00:00:00:00:00";
    /** A position vaguer than this proves nothing about being inside. */
    private static final double WORST_ACCURACY_METERS = 100;
    private static final double EARTH_RADIUS_METERS = 6_371_000;
    static final String NOT_OPEN = "Roll call is not open now.";
    static final String CONNECT_FIRST = "Connect to the property's WiFi first.";

    private final RollCallSettingRepository settings;
    private final RollCallWifiRepository wifi;
    private final RollCallMarkRepository marks;
    private final TenancyRepository tenancies;
    private final StayOutRepository stayOuts;
    private final PropertyModule propertyModule;
    private final TenancyAccessPolicy access;
    private final AuthModule authModule;
    private final Clock clock;

    public RollCallService(
            RollCallSettingRepository settings,
            RollCallWifiRepository wifi,
            RollCallMarkRepository marks,
            TenancyRepository tenancies,
            StayOutRepository stayOuts,
            PropertyModule propertyModule,
            TenancyAccessPolicy access,
            AuthModule authModule,
            Clock clock) {
        this.settings = settings;
        this.wifi = wifi;
        this.marks = marks;
        this.tenancies = tenancies;
        this.stayOuts = stayOuts;
        this.propertyModule = propertyModule;
        this.access = access;
        this.authModule = authModule;
        this.clock = clock;
    }

    // ---- The tenant's own -------------------------------------------------

    @Transactional(readOnly = true)
    public RollCallTodayResponse mine(UUID tenantUserId) {
        Tenancy tenancy = tenancies.findByUserIdAndActiveTrue(tenantUserId).orElse(null);
        if (tenancy == null) {
            return unavailable();
        }
        return today(tenancy);
    }

    /**
     * Automatic check-in: marks present when the router or the position matches.
     * Otherwise records nothing and answers the unchanged state.
     */
    @Transactional
    public RollCallTodayResponse checkIn(UUID tenantUserId, RollCallCheckInRequest request) {
        Tenancy tenancy = ownStayForUpdate(tenantUserId);
        Roll roll = requireOpen(tenancy);
        if (roll.setting().isAutoCheckIn()) {
            Optional<RollCallMark> existing = marks.findByTenancyIdAndNight(tenancy.getId(), roll.night());
            boolean settled = existing.isPresent()
                    && (existing.get().getMethod() == RollCallMethod.WARDEN || existing.get().getMethod().isVerified());
            if (!settled && !awayDeclared(tenancy, roll.night())) {
                RollCallMethod matched = matchWifi(tenancy.getPropertyId(), request.bssid())
                        ? RollCallMethod.WIFI
                        : matchLocation(roll.property(), roll.setting(), request) ? RollCallMethod.LOCATION : null;
                if (matched != null) {
                    return today(tenancy, record(tenancy, roll.night(), existing, RollCallStatus.PRESENT, matched, tenantUserId));
                }
            }
        }
        return today(tenancy);
    }

    /** The tenant's own word: a self-mark, unless something firmer is already there. */
    @Transactional
    public RollCallTodayResponse markPresent(UUID tenantUserId) {
        Tenancy tenancy = ownStayForUpdate(tenantUserId);
        Roll roll = requireOpen(tenancy);
        Optional<RollCallMark> existing = marks.findByTenancyIdAndNight(tenancy.getId(), roll.night());
        if (existing.isEmpty()) {
            return today(tenancy, record(tenancy, roll.night(), existing, RollCallStatus.PRESENT, RollCallMethod.SELF, tenantUserId));
        }
        return today(tenancy);
    }

    // ---- Management ---------------------------------------------------------

    /** A night's roll: tonight (or the last night) when none is asked for. */
    @Transactional(readOnly = true)
    public RollCallNightResponse night(UUID actorUserId, UUID propertyId, LocalDate asked) {
        access.ensureCanViewCurrentStays(actorUserId, propertyId);
        PropertyResponse property = propertyModule.getActiveProperty(propertyId);
        RollCallSetting setting = settingOf(propertyId);
        LocalDate tonight = tonight(setting);
        LocalDate night = asked == null || asked.isAfter(tonight) ? tonight : asked;

        List<Tenancy> onRoll = FOR.contains(property.type())
                ? tenancies.findByPropertyIdAndActiveTrue(propertyId).stream().filter(RollCallService::onRoll).toList()
                : List.of();
        Map<UUID, RollCallMark> marked = marks.findByPropertyIdAndNight(propertyId, night).stream()
                .collect(Collectors.toMap(RollCallMark::getTenancyId, Function.identity(), (a, b) -> a));
        Set<UUID> away = stayOuts.findLiveAtProperty(propertyId, night, night).stream()
                .filter(stay -> stay.isAwayOnNightOf(night))
                .map(StayOut::getTenancyId)
                .collect(Collectors.toSet());
        // The tenants, and whoever made a warden's mark, in one read.
        Set<UUID> names = onRoll.stream().map(Tenancy::getUserId).collect(Collectors.toCollection(java.util.HashSet::new));
        marked.values().stream()
                .filter(mark -> mark.getMethod() == RollCallMethod.WARDEN)
                .map(RollCallMark::getMarkedByUserId)
                .forEach(names::add);
        Map<UUID, UserSummaryResponse> people = names.isEmpty() ? Map.of() : authModule.findByIds(names);
        Map<UUID, RoomResponse> rooms = onRoll.isEmpty() ? Map.of()
                : propertyModule.findRoomsForDisplay(propertyId,
                        onRoll.stream().map(Tenancy::getRoomId).filter(Objects::nonNull).collect(Collectors.toSet()));

        List<RollCallNightResponse.Entry> entries = new ArrayList<>();
        int verified = 0;
        int self = 0;
        int awayCount = 0;
        int notMarked = 0;
        int absent = 0;
        for (Tenancy tenancy : onRoll) {
            RollCallMark mark = marked.get(tenancy.getId());
            String state = stateOf(mark, away.contains(tenancy.getId()));
            switch (state) {
                case "PRESENT" -> {
                    if (mark.getMethod() == RollCallMethod.SELF) {
                        self++;
                    } else {
                        verified++;
                    }
                }
                case "AWAY", "AWAY_DECLARED" -> awayCount++;
                case "ABSENT" -> absent++;
                default -> notMarked++;
            }
            UserSummaryResponse person = people.get(tenancy.getUserId());
            RoomResponse room = tenancy.getRoomId() == null ? null : rooms.get(tenancy.getRoomId());
            boolean byWarden = mark != null && mark.getMethod() == RollCallMethod.WARDEN;
            UserSummaryResponse warden = byWarden ? people.get(mark.getMarkedByUserId()) : null;
            entries.add(new RollCallNightResponse.Entry(tenancy.getId(), tenancy.getReferenceCode(),
                    person == null ? null : person.fullName(), room == null ? null : room.roomNumber(),
                    state, mark == null ? null : mark.getMethod(), mark == null ? null : mark.getMarkedAt(),
                    byWarden ? mark.getMarkedByUserId() : null, warden == null ? null : warden.fullName()));
        }
        entries.sort(Comparator
                .comparing((RollCallNightResponse.Entry entry) -> !"NOT_MARKED".equals(entry.state()))
                .thenComparing(entry -> entry.roomNumber() == null ? "" : entry.roomNumber())
                .thenComparing(entry -> entry.tenantName() == null ? "" : entry.tenantName()));
        return new RollCallNightResponse(night, tonight, setting.isOn(), setting.getWindowStartMinute(),
                setting.getWindowEndMinute(),
                new RollCallNightResponse.Counts(verified + self, verified, self, awayCount, notMarked, absent),
                entries);
    }

    /** The warden's mark for a night, or with no status, the mark taken off. */
    @Transactional
    public RollCallNightResponse setMark(UUID actorUserId, UUID propertyId, UUID tenancyId, SetRollCallMarkRequest request) {
        access.ensureCanManageStays(actorUserId, propertyId);
        Tenancy tenancy = tenancies.findById(tenancyId)
                .filter(stay -> stay.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("Tenancy", tenancyId));
        LocalDate tonight = tonight(settingOf(propertyId));
        if (request.night() == null || request.night().isAfter(tonight)) {
            throw new ValidationException("Pick tonight or an earlier night.");
        }
        Optional<RollCallMark> existing = marks.findByTenancyIdAndNight(tenancyId, request.night());
        if (request.status() == null) {
            existing.ifPresent(marks::delete);
        } else {
            record(tenancy, request.night(), existing, request.status(), RollCallMethod.WARDEN, actorUserId);
        }
        return night(actorUserId, propertyId, request.night());
    }

    @Transactional(readOnly = true)
    public RollCallSettingsResponse settingsOf(UUID actorUserId, UUID propertyId) {
        access.ensureCanViewCurrentStays(actorUserId, propertyId);
        return toResponse(settingOf(propertyId));
    }

    @Transactional
    public RollCallSettingsResponse saveSettings(UUID actorUserId, UUID propertyId, SaveRollCallSettingsRequest request) {
        access.ensureCanManageRollCall(actorUserId, propertyId);
        RollCallSetting setting = settings.findById(propertyId).orElseGet(() -> RollCallSetting.offFor(propertyId));
        if (request.version() != null && request.version() != setting.getVersion()) {
            throw new StaleVersionException();
        }
        boolean hasWindow = RollCallWindow.of(request.windowStartMinute(), request.windowEndMinute()) != null;
        // One end may wait while the owner picks the other; both picked must differ and fit the day.
        if (request.windowStartMinute() != null && request.windowEndMinute() != null && !hasWindow) {
            throw new ValidationException("Pick different times for opening and closing.");
        }
        if (request.enabled() && !hasWindow) {
            throw new ValidationException("Set the window first.");
        }
        setting.update(request.enabled(), request.autoCheckIn(), request.windowStartMinute(), request.windowEndMinute());
        return toResponse(settings.saveAndFlush(setting));
    }

    @Transactional
    public RollCallSettingsResponse addWifi(UUID actorUserId, UUID propertyId, AddRollCallWifiRequest request) {
        access.ensureCanManageRollCall(actorUserId, propertyId);
        String bssid = normalised(request.bssid());
        if (bssid == null) {
            throw new ValidationException(CONNECT_FIRST);
        }
        if (wifi.existsByPropertyIdAndBssid(propertyId, bssid)) {
            throw new ValidationException("This WiFi is already added.");
        }
        wifi.save(RollCallWifi.add(propertyId, bssid, request.ssid(), actorUserId));
        return toResponse(settingOf(propertyId));
    }

    @Transactional
    public RollCallSettingsResponse removeWifi(UUID actorUserId, UUID propertyId, UUID wifiId) {
        access.ensureCanManageRollCall(actorUserId, propertyId);
        RollCallWifi router = wifi.findById(wifiId)
                .filter(found -> found.getPropertyId().equals(propertyId))
                .orElseThrow(() -> new NotFoundException("RollCallWifi", wifiId));
        wifi.delete(router);
        return toResponse(settingOf(propertyId));
    }

    // ---- Rules ------------------------------------------------------------

    private record Roll(PropertyResponse property, RollCallSetting setting, LocalDate night) {
    }

    private RollCallTodayResponse today(Tenancy tenancy) {
        return today(tenancy, null);
    }

    /** Tonight's state, with a mark just recorded taken as it is rather than read back. */
    private RollCallTodayResponse today(Tenancy tenancy, RollCallMark recorded) {
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.getPropertyId());
        RollCallSetting setting = settingOf(tenancy.getPropertyId());
        if (!setting.isOn() || !FOR.contains(property.type()) || !onRoll(tenancy)) {
            return unavailable();
        }
        LocalDateTime now = now();
        RollCallWindow window = setting.window();
        LocalDate night = window.nightOf(now);
        RollCallMark mark = recorded != null && recorded.getNight().equals(night)
                ? recorded
                : marks.findByTenancyIdAndNight(tenancy.getId(), night).orElse(null);
        return new RollCallTodayResponse(true, setting.isAutoCheckIn(), setting.getWindowStartMinute(),
                setting.getWindowEndMinute(), window.isOpen(now), night,
                stateOf(mark, awayDeclared(tenancy, night)),
                mark == null ? null : mark.getMethod(), mark == null ? null : mark.getMarkedAt());
    }

    private Roll requireOpen(Tenancy tenancy) {
        PropertyResponse property = propertyModule.getActiveProperty(tenancy.getPropertyId());
        RollCallSetting setting = settingOf(tenancy.getPropertyId());
        LocalDateTime now = now();
        if (!setting.isOn() || !FOR.contains(property.type()) || !onRoll(tenancy) || !setting.window().isOpen(now)) {
            throw new ValidationException(NOT_OPEN);
        }
        return new Roll(property, setting, setting.window().nightOf(now));
    }

    private RollCallMark record(Tenancy tenancy, LocalDate night, Optional<RollCallMark> existing,
            RollCallStatus status, RollCallMethod method, UUID by) {
        Instant at = clock.instant();
        if (existing.isPresent()) {
            existing.get().replaceBy(status, method, at, by);
            marks.save(existing.get());
            return existing.get();
        }
        RollCallMark mark = RollCallMark.of(tenancy.getPropertyId(), tenancy.getId(), night, status, method, at, by);
        marks.save(mark);
        return mark;
    }

    /** A warden's mark first, then a stay out, then the tenant's own mark. */
    private static String stateOf(RollCallMark mark, boolean awayDeclared) {
        if (mark != null && mark.getMethod() == RollCallMethod.WARDEN) {
            return mark.getStatus().name();
        }
        if (awayDeclared) {
            return "AWAY_DECLARED";
        }
        return mark == null ? "NOT_MARKED" : mark.getStatus().name();
    }

    private boolean awayDeclared(Tenancy tenancy, LocalDate night) {
        return stayOuts.findLiveAtProperty(tenancy.getPropertyId(), night, night).stream()
                .anyMatch(stay -> stay.getTenancyId().equals(tenancy.getId()) && stay.isAwayOnNightOf(night));
    }

    private boolean matchWifi(UUID propertyId, String sent) {
        String bssid = normalised(sent);
        return bssid != null && wifi.findByPropertyIdOrderByCreatedAtAsc(propertyId).stream()
                .anyMatch(router -> router.getBssid().equals(bssid));
    }

    private static boolean matchLocation(PropertyResponse property, RollCallSetting setting, RollCallCheckInRequest request) {
        if (property.latitude() == null || property.longitude() == null
                || request.latitude() == null || request.longitude() == null
                || Boolean.TRUE.equals(request.mocked())
                || (request.accuracyMeters() != null && request.accuracyMeters() > WORST_ACCURACY_METERS)) {
            return false;
        }
        return metresBetween(property.latitude(), property.longitude(), request.latitude(), request.longitude())
                <= setting.getRadiusMeters();
    }

    static double metresBetween(BigDecimal lat1, BigDecimal lng1, BigDecimal lat2, BigDecimal lng2) {
        double dLat = Math.toRadians(lat2.doubleValue() - lat1.doubleValue());
        double dLng = Math.toRadians(lng2.doubleValue() - lng1.doubleValue());
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1.doubleValue())) * Math.cos(Math.toRadians(lat2.doubleValue()))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** Lower case and colon separated, or null for anything that is not a real router. */
    private static String normalised(String bssid) {
        if (bssid == null) {
            return null;
        }
        String clean = bssid.strip().toLowerCase(Locale.ROOT).replace('-', ':');
        return BSSID.matcher(clean).matches() && !HIDDEN_BSSID.equals(clean) ? clean : null;
    }

    private static boolean onRoll(Tenancy tenancy) {
        return tenancy.isMonthly() && tenancy.isCurrentlyActive();
    }

    private Tenancy ownStayForUpdate(UUID tenantUserId) {
        return tenancies.findByUserIdAndActiveTrueForUpdate(tenantUserId)
                .orElseThrow(() -> new NotFoundException("ActiveTenancy", tenantUserId));
    }

    private RollCallSetting settingOf(UUID propertyId) {
        return settings.findById(propertyId).orElseGet(() -> RollCallSetting.offFor(propertyId));
    }

    private LocalDate tonight(RollCallSetting setting) {
        RollCallWindow window = setting.window();
        LocalDateTime now = now();
        return window == null ? now.toLocalDate() : window.nightOf(now);
    }

    private RollCallSettingsResponse toResponse(RollCallSetting setting) {
        List<RollCallSettingsResponse.Wifi> routers = wifi.findByPropertyIdOrderByCreatedAtAsc(setting.getPropertyId())
                .stream()
                .map(router -> new RollCallSettingsResponse.Wifi(router.getId(), router.getBssid(), router.getSsid(),
                        router.getCreatedAt()))
                .toList();
        return new RollCallSettingsResponse(setting.isOn(), setting.isAutoCheckIn(), setting.getWindowStartMinute(),
                setting.getWindowEndMinute(), setting.getRadiusMeters(), routers, setting.getVersion());
    }

    private static RollCallTodayResponse unavailable() {
        return new RollCallTodayResponse(false, false, null, null, false, null, "NOT_MARKED", null, null);
    }

    private LocalDateTime now() {
        return LocalDateTime.ofInstant(clock.instant(), IST);
    }
}
