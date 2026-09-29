package com.khatiyan.d_modules.analytics.tenants;

import java.time.LocalDate;
import java.time.Period;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.function.ToLongFunction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.khatiyan.a_auth.analytics.AuthAnalytics;
import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.AnalyticsDivision;
import com.khatiyan.d_modules.analytics.metric.DivisionAssembler;
import com.khatiyan.d_modules.analytics.metric.MetricGuard;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.metric.MetricRules;
import com.khatiyan.d_modules.analytics.metric.MetricStatus;
import com.khatiyan.d_modules.analytics.metric.Unit;
import com.khatiyan.d_modules.analytics.period.DateRange;
import com.khatiyan.d_modules.analytics.period.ResolvedPeriod;
import com.khatiyan.d_modules.compliance.ComplianceAnalytics;
import com.khatiyan.d_modules.food.FoodModule;
import com.khatiyan.d_modules.food.analytics.FoodAnalytics;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.MonthlyStay;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.StayInterval;
import com.khatiyan.d_modules.verification.analytics.VerificationAnalytics;

/**
 * The Tenants division, spec §5.3, with the Agreements metrics (§5.4) folded in
 * by user decision. Plan: {@code docs/superpowers/plans/2026-09-26-analytics-tenants.md}.
 *
 * <p>People metrics count monthly stays only: daily stays are account-less
 * guest records. Bed metrics (occupancy, empty rooms, stay type) count every
 * stay, because a guest occupies a bed like anyone else.
 *
 * <p><b>A fixed-term stay ends with its agreement</b> (owner's rule). Nothing
 * ends a stay by itself, so one past its checkout date is PENDING_EXIT: still
 * living here, holding its bed, waiting for a person to end it. It stays a
 * fixed-term stay. See docs/superpowers/specs/2026-09-26-pending-exit-design.md.
 */
@Component
public class TenantsAnalyticsAssembler implements DivisionAssembler {

    private static final Logger log = LoggerFactory.getLogger(TenantsAnalyticsAssembler.class);
    private static final int EXIT_WINDOW_DAYS = 30;
    private static final int TOP_PROFILES = 4;
    private static final List<String> GENDERS = List.of("MALE", "FEMALE", "TRANSGENDER", "OTHER", "NOT_GIVEN");
    private static final List<String> AGE_GROUPS = List.of("UNDER_18", "18_24", "25_34", "35_44", "45_PLUS", "NOT_GIVEN");

    private final PropertyAnalytics property;
    private final TenancyAnalytics tenancy;
    private final VerificationAnalytics verification;
    private final ComplianceAnalytics compliance;
    private final FoodModule foodModule;
    private final FoodAnalytics food;
    private final AuthAnalytics auth;

    public TenantsAnalyticsAssembler(PropertyAnalytics property, TenancyAnalytics tenancy, VerificationAnalytics verification,
            ComplianceAnalytics compliance, FoodModule foodModule, FoodAnalytics food, AuthAnalytics auth) {
        this.property = property;
        this.tenancy = tenancy;
        this.verification = verification;
        this.compliance = compliance;
        this.foodModule = foodModule;
        this.food = food;
        this.auth = auth;
    }

    @Override
    public AnalyticsDivision division() {
        return AnalyticsDivision.TENANTS;
    }

    @Override
    public List<MetricResult> assemble(AnalyticsContext context) {
        UUID p = context.propertyId();
        LocalDate today = context.today();
        ResolvedPeriod period = context.period();
        // One query each, shared: the people metrics read the current stays, the
        // occupancy and stay-type histories read the stays' nights.
        Supplier<List<MonthlyStay>> stays = memo(() -> tenancy.currentMonthlyStays(p));
        Supplier<List<MonthlyStay>> live = memo(() -> stays.get().stream().filter(MonthlyStay::live).toList());
        Supplier<List<StayInterval>> nights = memo(() -> tenancy.stayIntervals(p, period.range().from(), period.range().to()));
        Supplier<List<StayInterval>> nightsBefore = memo(() -> period.hasComparison()
                ? tenancy.stayIntervals(p, period.comparison().from(), period.comparison().to()) : null);
        List<MetricResult> out = new ArrayList<>();

        MetricGuard.add(out, context, MetricKey.TENANTS_OCCUPANCY, () -> occupancy(p, period, nights.get(), nightsBefore.get()));
        MetricGuard.add(out, context, MetricKey.TENANTS_ROOM_VACANCY, () -> roomVacancy(p, today, period.dataSince()));
        MetricGuard.add(out, context, MetricKey.TENANTS_STAY_TYPE, () -> stayType(p, period, nights.get(), nightsBefore.get()));
        MetricGuard.add(out, context, MetricKey.TENANTS_MOVES, () -> moves(p, period));
        MetricGuard.add(out, context, MetricKey.TENANTS_UPCOMING_EXITS, () -> upcomingExits(live.get(), today));
        MetricGuard.add(out, context, MetricKey.TENANTS_TENURE, () -> tenure(live.get(), today, period.dataSince()));
        MetricGuard.add(out, context, MetricKey.TENANTS_PROFILE, () -> profile(live.get(), today));
        MetricGuard.add(out, context, MetricKey.TENANTS_ID_VERIFICATION, () -> idVerification(p, live.get()));
        MetricGuard.add(out, context, MetricKey.TENANTS_AGREEMENT_STATUS, () -> agreementStatus(p, stays.get()));
        MetricGuard.add(out, context, MetricKey.TENANTS_AGREEMENT_TERMS, () -> agreementTerms(live.get()));
        MetricGuard.add(out, context, MetricKey.TENANTS_TERMS_ENDING, () -> termsEnding(live.get(), today));
        MetricGuard.add(out, context, MetricKey.TENANTS_TIME_TO_SIGN, () -> timeToSign(p, period));
        // Food off means the food cards are not there at all, rather than empty.
        boolean wantsFood = context.wants(MetricKey.TENANTS_MEAL_PREFERENCES) || context.wants(MetricKey.TENANTS_FOOD_SUBSCRIPTIONS);
        if (wantsFood && foodOn(p)) {
            MetricGuard.add(out, context, MetricKey.TENANTS_MEAL_PREFERENCES, () -> mealPreferences(p, live.get()));
            MetricGuard.add(out, context, MetricKey.TENANTS_FOOD_SUBSCRIPTIONS, () -> foodSubscriptions(p, period));
        }
        return out;
    }

    /** If the setting cannot be read, the cards are shown and fail on their own, rather than vanish silently. */
    private boolean foodOn(UUID p) {
        try {
            return foodModule.isManagementEnabled(p);
        } catch (RuntimeException e) {
            log.warn("Could not read the food setting for property {}; showing the food cards", p, e);
            return true;
        }
    }

    // ---- Occupancy -----------------------------------------------------------

    /**
     * Beds right now, and the occupancy rate over the period. The rate is built
     * from stay records, so it reaches back to the day the property joined:
     * nights beds were occupied over today's beds times the nights. Today's beds,
     * because a room's creation date is no record of when its beds existed: rooms
     * get turned off and re-added, and tenants were found living in May in rooms
     * made in June. Each bucket sends both sums and the app divides.
     */
    private MetricResult occupancy(UUID p, ResolvedPeriod period, List<StayInterval> now, List<StayInterval> before) {
        PropertyAnalytics.BedCounts beds = property.bedCounts(p);
        int bedCount = beds.totalBeds();
        int vacant = Math.max(0, beds.totalBeds() - beds.occupiedBeds() - beds.reservedBeds() - beds.unavailableBeds());
        long bedNights = bedNights(bedCount, period.range());
        Long bedNightsBefore = before == null ? null : bedNights(bedCount, period.comparison());
        boolean comparable = bedNightsBefore != null && bedNightsBefore > 0;
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_OCCUPANCY)
                .status(beds.totalBeds() > 0 ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(beds.totalBeds())
                .partUnit(Unit.COUNT)
                .part("OCCUPIED", null, beds.occupiedBeds(), null)
                .part("RESERVED", null, beds.reservedBeds(), null)
                .part("VACANT", null, vacant, null)
                .part("UNAVAILABLE", null, beds.unavailableBeds(), null)
                .figure("total_beds", Unit.COUNT, beds.totalBeds(), null)
                .figure("occupied_nights", Unit.DAYS, nightsIn(now, period.range(), null),
                        comparable ? nightsIn(before, period.comparison(), null) : null)
                .figure("bed_nights", Unit.DAYS, bedNights, comparable ? bedNightsBefore : null)
                .seriesUnit(Unit.DAYS);
        for (DateRange bucket : period.buckets()) {
            Map<String, Long> values = new LinkedHashMap<>();
            long bucketBeds = bedNights(bedCount, bucket);
            if (bucketBeds > 0) {
                values.put("occupied", nightsIn(now, bucket, null));
                values.put("beds", bucketBeds);
            }
            builder.point(bucket.from(), bucket.to(), values);
        }
        return builder.build();
    }

    /**
     * Stays now, and stays over the period: how many monthly and daily stays
     * spent at least one night here in each bucket.
     */
    private MetricResult stayType(UUID p, ResolvedPeriod period, List<StayInterval> now, List<StayInterval> before) {
        TenancyAnalytics.ActiveStays current = tenancy.activeStays(p);
        long monthly = staysIn(now, period.range(), false);
        long daily = staysIn(now, period.range(), true);
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_STAY_TYPE)
                .status(current.monthly() + current.daily() + monthly + daily > 0 ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(monthly + daily)
                .partUnit(Unit.COUNT)
                .part("MONTHLY", null, current.monthly(), null)
                .part("DAILY", null, current.daily(), null)
                .figure("monthly", Unit.COUNT, monthly, before == null ? null : staysIn(before, period.comparison(), false))
                .figure("daily", Unit.COUNT, daily, before == null ? null : staysIn(before, period.comparison(), true))
                .seriesUnit(Unit.COUNT);
        for (DateRange bucket : period.buckets()) {
            Map<String, Long> values = new LinkedHashMap<>();
            values.put("monthly", staysIn(now, bucket, false));
            values.put("daily", staysIn(now, bucket, true));
            builder.point(bucket.from(), bucket.to(), values);
        }
        return builder.build();
    }

    /**
     * Rooms with a free bed, fully or partly vacant, by room type and by how
     * long they have been so. That is counted from the room's last move-out, or
     * from when it was added if nobody has left it yet, and never from before
     * the property joined Khatiyan. Keys are {@code STATE.TYPE.BAND}, and a
     * combination with no room is simply absent.
     */
    private MetricResult roomVacancy(UUID p, LocalDate today, LocalDate dataSince) {
        List<PropertyAnalytics.RoomVacancy> rooms = property.roomVacancies(p);
        Map<UUID, List<LocalDate>> moveOuts = rooms.isEmpty() ? Map.of() : tenancy.moveOutDatesByRoom(p);
        Map<String, Long> parts = new LinkedHashMap<>();
        long full = 0;
        for (PropertyAnalytics.RoomVacancy room : rooms) {
            List<LocalDate> dates = moveOuts.getOrDefault(room.roomId(), List.of());
            LocalDate since = dates.isEmpty() ? room.createdOn() : dates.get(0);
            if (since.isBefore(dataSince)) {
                since = dataSince;
            }
            long days = Math.max(0, ChronoUnit.DAYS.between(since, today));
            String band = days < 7 ? "D0_6" : days <= 30 ? "D7_30" : days <= 90 ? "D31_90" : "D90_PLUS";
            String state = room.taken() == 0 ? "FULL" : "PARTIAL";
            if (room.taken() == 0) {
                full++;
            }
            parts.merge(state + "." + Objects.requireNonNullElse(room.roomType(), "OTHER") + "." + band, 1L, Long::sum);
        }
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_ROOM_VACANCY)
                .status(rooms.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(rooms.size())
                .partUnit(Unit.COUNT)
                .figure("fully_vacant_rooms", Unit.COUNT, full, null)
                .figure("partly_vacant_rooms", Unit.COUNT, rooms.size() - full, null);
        parts.forEach((key, value) -> builder.part(key, null, value, null));
        return builder.build();
    }

    // ---- Tenants -------------------------------------------------------------

    private MetricResult moves(UUID p, ResolvedPeriod period) {
        List<TenancyAnalytics.DayMoves> now = tenancy.monthlyMoves(p, period.range().from(), period.range().to());
        List<TenancyAnalytics.DayMoves> before = period.hasComparison()
                ? tenancy.monthlyMoves(p, period.comparison().from(), period.comparison().to()) : null;
        return dayCounts(MetricKey.TENANTS_MOVES, period, now, before, TenancyAnalytics.DayMoves::day,
                "move_ins", TenancyAnalytics.DayMoves::moveIns, "move_outs", TenancyAnalytics.DayMoves::moveOuts);
    }

    /**
     * Checkouts due within 30 days, by how the stay is leaving, plus every stay
     * already past its date as PENDING_EXIT (nothing ends a stay by itself, so
     * it waits for a person). A stay past its date the nightly sweep has not
     * reached yet is counted there too, so the card never disagrees with it.
     */
    private MetricResult upcomingExits(List<MonthlyStay> live, LocalDate today) {
        LocalDate limit = today.plusDays(EXIT_WINDOW_DAYS);
        Map<String, Long> parts = zeroed("NOTICE", "PREMATURE", "TERM_END", "PENDING_EXIT");
        for (MonthlyStay stay : live) {
            if ("PENDING_EXIT".equals(stay.status()) || (stay.exitOn() != null && stay.exitOn().isBefore(today))) {
                parts.merge("PENDING_EXIT", 1L, Long::sum);
                continue;
            }
            if (stay.exitOn() == null || stay.exitOn().isAfter(limit)) {
                continue;
            }
            String key = switch (stay.status()) {
                case "ON_NOTICE" -> "NOTICE";
                case "ON_PREMATURE_NOTICE" -> "PREMATURE";
                default -> "TERM_END";
            };
            parts.merge(key, 1L, Long::sum);
        }
        long total = parts.values().stream().mapToLong(Long::longValue).sum();
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_UPCOMING_EXITS)
                .status(total > 0 ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(total)
                .partUnit(Unit.COUNT)
                .figure("total", Unit.COUNT, total, null);
        parts.forEach((key, value) -> builder.part(key, null, value, null));
        return builder.build();
    }

    /** Time since each live stay began in Khatiyan: a start before the property joined counts from the day it joined. */
    private MetricResult tenure(List<MonthlyStay> live, LocalDate today, LocalDate dataSince) {
        Map<String, Long> parts = zeroed("M0_3", "M3_6", "M6_12", "Y1_2", "Y2_PLUS");
        List<Long> days = new ArrayList<>();
        for (MonthlyStay stay : live) {
            LocalDate since = stay.startDate().isBefore(dataSince) ? dataSince : stay.startDate();
            if (since.isAfter(today)) {
                since = today;
            }
            long months = Period.between(since, today).toTotalMonths();
            parts.merge(months < 3 ? "M0_3" : months < 6 ? "M3_6" : months < 12 ? "M6_12" : months < 24 ? "Y1_2" : "Y2_PLUS", 1L, Long::sum);
            days.add(ChronoUnit.DAYS.between(since, today));
        }
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_TENURE)
                .status(live.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(live.size())
                .partUnit(Unit.COUNT)
                .figure("stays", Unit.COUNT, live.size(), null);
        if (days.size() >= MetricRules.MIN_SAMPLE) {
            builder.figure("median_days", Unit.DAYS, median(days), null);
        }
        parts.forEach((key, value) -> builder.part(key, null, value, null));
        return builder.build();
    }

    /** Counts only, and only from 5 tenants up: below that a split could point at one person. */
    private MetricResult profile(List<MonthlyStay> live, LocalDate today) {
        List<UUID> users = live.stream().map(MonthlyStay::userId).filter(Objects::nonNull).distinct().toList();
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_PROFILE)
                .status(MetricRules.statusForSample(users.size()))
                .sampleSize(users.size())
                .partUnit(Unit.COUNT);
        if (users.size() < MetricRules.MIN_SAMPLE) {
            return builder.build();
        }
        AuthAnalytics.ProfileCounts counts = auth.profileCounts(users, today);
        for (String gender : GENDERS) {
            builder.part("GENDER_" + gender, null, counts.gender().getOrDefault(gender, 0), null);
        }
        for (String group : AGE_GROUPS) {
            builder.part("AGE_" + group, null, counts.ageBands().getOrDefault(group, 0), null);
        }
        return builder.build();
    }

    /** e-KYC beats the owner's own ID check: a stay is counted once, by the strongest check it has. */
    private MetricResult idVerification(UUID p, List<MonthlyStay> live) {
        Set<UUID> verified = live.isEmpty() ? Set.of() : verification.verifiedTenancyIds(p);
        Map<String, Long> parts = zeroed("EKYC", "MANUAL", "NONE");
        for (MonthlyStay stay : live) {
            parts.merge(verified.contains(stay.tenancyId()) ? "EKYC" : Boolean.TRUE.equals(stay.idCheckConfirmed()) ? "MANUAL" : "NONE", 1L, Long::sum);
        }
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_ID_VERIFICATION)
                .status(live.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(live.size())
                .partUnit(Unit.COUNT);
        parts.forEach((key, value) -> builder.part(key, null, value, null));
        return builder.build();
    }

    // ---- Agreements ------------------------------------------------------------

    /**
     * Stays living here or still waiting on the tenant, by their agreement. A
     * waiting stay is where "awaiting signature" really lives, since every
     * monthly stay is agreement-backed now. No agreement, or a cancelled one, is
     * NONE: stays from before agreements were required.
     */
    private MetricResult agreementStatus(UUID p, List<MonthlyStay> stays) {
        Map<UUID, String> statuses = stays.isEmpty() ? Map.of() : compliance.agreementStatusByTenancy(p);
        Map<String, Long> parts = zeroed("SIGNED", "AWAITING", "DRAFT", "NONE");
        for (MonthlyStay stay : stays) {
            String key = switch (Objects.requireNonNullElse(statuses.get(stay.tenancyId()), "")) {
                case "ACCEPTED" -> "SIGNED";
                case "PENDING_ACCEPTANCE" -> "AWAITING";
                case "DRAFT" -> "DRAFT";
                default -> "NONE";
            };
            parts.merge(key, 1L, Long::sum);
        }
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_AGREEMENT_STATUS)
                .status(stays.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(stays.size())
                .partUnit(Unit.COUNT);
        parts.forEach((key, value) -> builder.part(key, null, value, null));
        return builder.build();
    }

    /** A fixed term has an agreement end date, stamped when the stay began. One past it is still a fixed-term stay, waiting to be ended. */
    private MetricResult agreementTerms(List<MonthlyStay> live) {
        long fixed = live.stream().filter(stay -> stay.agreementEndDate() != null).count();
        return MetricResult.of(MetricKey.TENANTS_AGREEMENT_TERMS)
                .status(live.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(live.size())
                .partUnit(Unit.COUNT)
                .part("FIXED", null, fixed, null)
                .part("INDEFINITE", null, live.size() - fixed, null)
                .build();
    }

    /**
     * Fixed terms ending in 0–30, 31–60 and 61–90 days. One whose date has
     * already passed has ENDED: it is not in the bands, and is counted as
     * {@code ended_open}, waiting for a person to end the stay.
     */
    private MetricResult termsEnding(List<MonthlyStay> live, LocalDate today) {
        Map<String, Long> parts = zeroed("D0_30", "D31_60", "D61_90");
        long fixed = 0;
        long endedOpen = 0;
        for (MonthlyStay stay : live) {
            if (stay.agreementEndDate() == null) {
                continue;
            }
            fixed++;
            long days = ChronoUnit.DAYS.between(today, stay.agreementEndDate());
            if (days < 0) {
                endedOpen++;
            } else if (days <= 30) {
                parts.merge("D0_30", 1L, Long::sum);
            } else if (days <= 60) {
                parts.merge("D31_60", 1L, Long::sum);
            } else if (days <= 90) {
                parts.merge("D61_90", 1L, Long::sum);
            }
        }
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_TERMS_ENDING)
                .status(fixed > 0 ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(fixed)
                .partUnit(Unit.COUNT)
                .figure("fixed_terms", Unit.COUNT, fixed, null)
                .figure("ended_open", Unit.COUNT, endedOpen, null);
        parts.forEach((key, value) -> builder.part(key, null, value, null));
        return builder.build();
    }

    /** The median needs 5 signed agreements; below that only the count is sent. */
    private MetricResult timeToSign(UUID p, ResolvedPeriod period) {
        ComplianceAnalytics.SigningTimes now = compliance.signingTimes(p, period.range().from(), period.range().to());
        ComplianceAnalytics.SigningTimes before = period.hasComparison()
                ? compliance.signingTimes(p, period.comparison().from(), period.comparison().to()) : null;
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_TIME_TO_SIGN)
                .status(MetricRules.statusForSample(now.signed()))
                .sampleSize(now.signed())
                .figure("signed", Unit.COUNT, now.signed(), before == null ? null : (long) before.signed());
        if (now.signed() >= MetricRules.MIN_SAMPLE && now.medianMinutes() != null) {
            Long previous = before == null ? null : MetricRules.previousIfComparable(before.medianMinutes(), before.signed());
            builder.figure("median_minutes", Unit.MINUTES, now.medianMinutes(), previous);
        }
        return builder.build();
    }

    // ---- Food ----------------------------------------------------------------

    /** Live stays by the food profile they eat on: the top four by name, the rest as OTHER, plus those not subscribed. */
    private MetricResult mealPreferences(UUID p, List<MonthlyStay> live) {
        Set<UUID> liveIds = new HashSet<>();
        live.forEach(stay -> liveIds.add(stay.tenancyId()));
        // Keyed by profile id, or HYBRID for a mixed week (2026-09-29).
        Map<String, String> names = new LinkedHashMap<>();
        Map<String, Long> counts = new LinkedHashMap<>();
        Set<UUID> subscribed = new HashSet<>();
        for (FoodAnalytics.ActiveSubscription sub : live.isEmpty() ? List.<FoodAnalytics.ActiveSubscription>of() : food.activeSubscriptions(p)) {
            if (liveIds.contains(sub.tenancyId()) && subscribed.add(sub.tenancyId())) {
                String key = sub.profileId() == null ? "HYBRID" : sub.profileId().toString();
                names.put(key, sub.profileName());
                counts.merge(key, 1L, Long::sum);
            }
        }
        List<String> ranked = new ArrayList<>(counts.keySet());
        ranked.sort(Comparator.comparing((String id) -> counts.get(id)).reversed().thenComparing(names::get));
        MetricResult.Builder builder = MetricResult.of(MetricKey.TENANTS_MEAL_PREFERENCES)
                .status(live.isEmpty() ? MetricStatus.NO_DATA : MetricStatus.OK)
                .sampleSize(live.size())
                .partUnit(Unit.COUNT);
        long other = 0;
        for (int i = 0; i < ranked.size(); i++) {
            String id = ranked.get(i);
            if (i < TOP_PROFILES) {
                builder.part(id, names.get(id), counts.get(id), null);
            } else {
                other += counts.get(id);
            }
        }
        if (ranked.size() > TOP_PROFILES) {
            builder.part("OTHER", null, other, null);
        }
        builder.part("NOT_SUBSCRIBED", null, live.size() - subscribed.size(), null);
        return builder.build();
    }

    private MetricResult foodSubscriptions(UUID p, ResolvedPeriod period) {
        List<FoodAnalytics.DaySubscriptions> now = food.subscriptionMoves(p, period.range().from(), period.range().to());
        List<FoodAnalytics.DaySubscriptions> before = period.hasComparison()
                ? food.subscriptionMoves(p, period.comparison().from(), period.comparison().to()) : null;
        return dayCounts(MetricKey.TENANTS_FOOD_SUBSCRIPTIONS, period, now, before, FoodAnalytics.DaySubscriptions::day,
                "started", FoodAnalytics.DaySubscriptions::started, "ended", FoodAnalytics.DaySubscriptions::ended);
    }

    // ---- Helpers -----------------------------------------------------------------

    /**
     * Two counts per day, summed per bucket and over the range, with the
     * comparison window's totals as previous. Zero is a real count here, so the
     * card is empty only when neither window saw anything.
     */
    private <T> MetricResult dayCounts(MetricKey key, ResolvedPeriod period, List<T> now, List<T> before,
            Function<T, LocalDate> day, String firstKey, ToLongFunction<T> first, String secondKey, ToLongFunction<T> second) {
        long a = now.stream().mapToLong(first).sum();
        long b = now.stream().mapToLong(second).sum();
        Long previousA = before == null ? null : before.stream().mapToLong(first).sum();
        Long previousB = before == null ? null : before.stream().mapToLong(second).sum();
        boolean any = a + b > 0 || (previousA != null && previousA + previousB > 0);
        MetricResult.Builder builder = MetricResult.of(key)
                .status(any ? MetricStatus.OK : MetricStatus.NO_DATA)
                .sampleSize(a + b)
                .figure(firstKey, Unit.COUNT, a, previousA)
                .figure(secondKey, Unit.COUNT, b, previousB)
                .seriesUnit(Unit.COUNT);
        for (DateRange bucket : period.buckets()) {
            List<T> rows = now.stream().filter(row -> inside(day.apply(row), bucket)).toList();
            Map<String, Long> values = new LinkedHashMap<>();
            values.put(firstKey, rows.stream().mapToLong(first).sum());
            values.put(secondKey, rows.stream().mapToLong(second).sum());
            builder.point(bucket.from(), bucket.to(), values);
        }
        return builder.build();
    }

    /** Nights stays spent inside a range; {@code daily} null counts every stay. */
    private static long nightsIn(List<StayInterval> stays, DateRange range, Boolean daily) {
        long nights = 0;
        for (StayInterval stay : stays) {
            if (daily == null || stay.daily() == daily) {
                nights += overlap(stay.start(), stay.end(), range);
            }
        }
        return nights;
    }

    /** Stays of one type that spent at least one night inside a range. */
    private static long staysIn(List<StayInterval> stays, DateRange range, boolean daily) {
        return stays.stream().filter(stay -> stay.daily() == daily && overlap(stay.start(), stay.end(), range) > 0).count();
    }

    /** Today's beds times the nights in a range. */
    private static long bedNights(int beds, DateRange range) {
        return beds * (ChronoUnit.DAYS.between(range.from(), range.to()) + 1);
    }

    private static long overlap(LocalDate start, LocalDate end, DateRange range) {
        LocalDate from = start.isAfter(range.from()) ? start : range.from();
        LocalDate to = end.isBefore(range.to()) ? end : range.to();
        return from.isAfter(to) ? 0 : ChronoUnit.DAYS.between(from, to) + 1;
    }

    private static boolean inside(LocalDate day, DateRange range) {
        return !day.isBefore(range.from()) && !day.isAfter(range.to());
    }

    /** Parts in a fixed order, every one present even at zero. */
    private static Map<String, Long> zeroed(String... keys) {
        Map<String, Long> parts = new LinkedHashMap<>();
        for (String key : keys) {
            parts.put(key, 0L);
        }
        return parts;
    }

    private static long median(List<Long> values) {
        List<Long> sorted = values.stream().sorted().toList();
        int mid = sorted.size() / 2;
        return sorted.size() % 2 == 1 ? sorted.get(mid) : Math.round((sorted.get(mid - 1) + sorted.get(mid)) / 2.0);
    }

    private static <T> Supplier<T> memo(Supplier<T> source) {
        return new Supplier<>() {
            private boolean done;
            private T value;

            @Override
            public T get() {
                if (!done) {
                    value = source.get();
                    done = true;
                }
                return value;
            }
        };
    }
}
