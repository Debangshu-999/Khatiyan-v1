package com.khatiyan.d_modules.analytics.tenants;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.analytics.AuthAnalytics;
import com.khatiyan.d_modules.analytics.metric.AnalyticsContext;
import com.khatiyan.d_modules.analytics.metric.Figure;
import com.khatiyan.d_modules.analytics.metric.MetricKey;
import com.khatiyan.d_modules.analytics.metric.MetricResult;
import com.khatiyan.d_modules.analytics.metric.MetricStatus;
import com.khatiyan.d_modules.analytics.metric.Part;
import com.khatiyan.d_modules.analytics.period.AnalyticsPeriodResolver;
import com.khatiyan.d_modules.analytics.period.PeriodPreset;
import com.khatiyan.d_modules.compliance.ComplianceAnalytics;
import com.khatiyan.d_modules.food.FoodModule;
import com.khatiyan.d_modules.food.analytics.FoodAnalytics;
import com.khatiyan.d_modules.property.analytics.PropertyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.DayMoves;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.MonthlyStay;
import com.khatiyan.d_modules.tenancy.analytics.TenancyAnalytics.StayInterval;
import com.khatiyan.d_modules.verification.analytics.VerificationAnalytics;

class TenantsAnalyticsAssemblerTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 26);
    private static final LocalDate LONG_AGO = LocalDate.of(2025, 1, 1);
    private final UUID property = UUID.randomUUID();

    private PropertyAnalytics properties;
    private TenancyAnalytics tenancy;
    private VerificationAnalytics verification;
    private ComplianceAnalytics compliance;
    private FoodModule foodModule;
    private FoodAnalytics food;
    private AuthAnalytics auth;
    private TenantsAnalyticsAssembler assembler;

    @BeforeEach
    void setUp() {
        properties = mock(PropertyAnalytics.class);
        tenancy = mock(TenancyAnalytics.class);
        verification = mock(VerificationAnalytics.class);
        compliance = mock(ComplianceAnalytics.class);
        foodModule = mock(FoodModule.class);
        food = mock(FoodAnalytics.class);
        auth = mock(AuthAnalytics.class);
        assembler = new TenantsAnalyticsAssembler(properties, tenancy, verification, compliance, foodModule, food, auth);
        when(foodModule.isManagementEnabled(property)).thenReturn(true);
    }

    private AnalyticsContext context(PeriodPreset preset, LocalDate dataSince, MetricKey... keys) {
        return new AnalyticsContext(property, AnalyticsPeriodResolver.resolve(preset, null, null, TODAY, dataSince), TODAY,
                EnumSet.of(keys[0], keys));
    }

    private MetricResult only(List<MetricResult> results) {
        assertThat(results).hasSize(1);
        return results.get(0);
    }

    private static Figure figure(MetricResult metric, String key) {
        return metric.figures().stream().filter(f -> f.key().equals(key)).findFirst().orElseThrow();
    }

    private static boolean hasFigure(MetricResult metric, String key) {
        return metric.figures().stream().anyMatch(f -> f.key().equals(key));
    }

    private static long part(MetricResult metric, String key) {
        return metric.parts().stream().filter(p -> p.key().equals(key)).findFirst().orElseThrow().value();
    }

    private static MonthlyStay stay(String status, LocalDate start, LocalDate exitOn, LocalDate agreementEnd, Boolean idCheck) {
        return new MonthlyStay(UUID.randomUUID(), UUID.randomUUID(), status, start, exitOn, agreementEnd, idCheck);
    }

    private static MonthlyStay live(LocalDate start) {
        return stay("ACTIVE", start, null, null, null);
    }

    @Test
    void emptyRoomsCountFromTheirLastMoveOutByStateAndTypeNeverBeforeJoining() {
        UUID emptied = UUID.randomUUID();
        UUID partly = UUID.randomUUID();
        UUID longEmpty = UUID.randomUUID();
        when(properties.roomVacancies(property)).thenReturn(List.of(
                new PropertyAnalytics.RoomVacancy(emptied, "DOUBLE", 2, 0, LocalDate.of(2026, 6, 1)),
                new PropertyAnalytics.RoomVacancy(partly, "TRIPLE", 3, 1, LocalDate.of(2026, 6, 1)),
                new PropertyAnalytics.RoomVacancy(longEmpty, "SINGLE", 1, 0, LocalDate.of(2025, 1, 1))));
        when(tenancy.moveOutDatesByRoom(property)).thenReturn(Map.of(
                emptied, List.of(LocalDate.of(2026, 9, 24), LocalDate.of(2026, 7, 1)),
                longEmpty, List.of(LocalDate.of(2026, 7, 1))));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LocalDate.of(2026, 8, 1), MetricKey.TENANTS_ROOM_VACANCY)));
        // Emptied 2 days ago. Nobody has left the triple, so it counts from when it was added, clamped to
        // 1 Aug, when the property joined: 56 days. The single room's July move-out is clamped the same way.
        assertThat(result.parts()).extracting(Part::key).containsExactly("FULL.DOUBLE.D0_6", "PARTIAL.TRIPLE.D31_90", "FULL.SINGLE.D31_90");
        assertThat(figure(result, "fully_vacant_rooms").value()).isEqualTo(2);
        assertThat(figure(result, "partly_vacant_rooms").value()).isEqualTo(1);
    }

    @Test
    void occupancyNowIsTheBedsAndOverThePeriodIsNightsOccupiedOverBedNights() {
        when(properties.bedCounts(property)).thenReturn(new PropertyAnalytics.BedCounts(28, 5, 1, 2));
        when(tenancy.stayIntervals(property, LocalDate.of(2026, 7, 1), TODAY)).thenReturn(List.of(
                new StayInterval(false, LocalDate.of(2026, 6, 1), TODAY)));
        when(tenancy.stayIntervals(property, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 6, 26))).thenReturn(List.of(
                new StayInterval(false, LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 26))));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_3_MONTHS, LONG_AGO, MetricKey.TENANTS_OCCUPANCY)));
        assertThat(part(result, "VACANT")).isEqualTo(20);
        // 1 Jul to 26 Sep is 88 nights. 1 Apr to 26 Jun is 87, of which the stay covers 26.
        assertThat(figure(result, "occupied_nights").value()).isEqualTo(88);
        assertThat(figure(result, "bed_nights").value()).isEqualTo(28 * 88);
        assertThat(figure(result, "occupied_nights").previous()).isEqualTo(26);
        assertThat(figure(result, "bed_nights").previous()).isEqualTo(28 * 87);
        assertThat(result.series().get(0).values()).containsEntry("occupied", 31L).containsEntry("beds", 28L * 31);
    }

    @Test
    void stayTypeCountsStaysNowAndStaysThatSpentANightInEachBucket() {
        when(tenancy.activeStays(property)).thenReturn(new TenancyAnalytics.ActiveStays(4, 1));
        when(tenancy.stayIntervals(property, LocalDate.of(2026, 7, 1), TODAY)).thenReturn(List.of(
                new StayInterval(false, LocalDate.of(2026, 6, 1), TODAY),
                new StayInterval(true, LocalDate.of(2026, 8, 5), LocalDate.of(2026, 8, 6)),
                new StayInterval(true, LocalDate.of(2026, 9, 10), LocalDate.of(2026, 9, 12))));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_3_MONTHS, LONG_AGO, MetricKey.TENANTS_STAY_TYPE)));
        assertThat(part(result, "MONTHLY")).isEqualTo(4);
        assertThat(part(result, "DAILY")).isEqualTo(1);
        assertThat(figure(result, "monthly").value()).isEqualTo(1);
        assertThat(figure(result, "daily").value()).isEqualTo(2);
        assertThat(result.series().get(0).values()).containsEntry("monthly", 1L).containsEntry("daily", 0L);
        assertThat(result.series().get(1).values()).containsEntry("daily", 1L);
    }

    @Test
    void upcomingExitsSplitByHowTheyLeaveAndCountStaysPastTheirDateAsPendingExit() {
        when(tenancy.currentMonthlyStays(property)).thenReturn(List.of(
                stay("ON_NOTICE", LONG_AGO, LocalDate.of(2026, 10, 5), null, null),
                // Both past their date and waiting to be ended: one already flipped, one the sweep has not reached.
                stay("PENDING_EXIT", LONG_AGO, LocalDate.of(2026, 9, 18), LocalDate.of(2026, 9, 18), null),
                stay("ON_PREMATURE_NOTICE", LONG_AGO, LocalDate.of(2026, 9, 20), null, null),
                stay("ACTIVE", LONG_AGO, LocalDate.of(2026, 10, 20), LocalDate.of(2026, 10, 20), null),
                stay("ACTIVE", LONG_AGO, LocalDate.of(2026, 12, 1), LocalDate.of(2026, 12, 1), null),
                stay("ACTIVE", LONG_AGO, null, null, null),
                stay("PENDING_ACCEPTANCE", TODAY, LocalDate.of(2026, 10, 1), null, null)));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_UPCOMING_EXITS)));
        assertThat(result.parts()).extracting(Part::key).containsExactly("NOTICE", "PREMATURE", "TERM_END", "PENDING_EXIT");
        assertThat(result.parts()).extracting(Part::value).containsExactly(1L, 0L, 1L, 2L);
        assertThat(figure(result, "total").value()).isEqualTo(4);
    }

    @Test
    void agreementsEndingBandTermsStillToComeAndCountEndedOnesSeparately() {
        when(tenancy.currentMonthlyStays(property)).thenReturn(List.of(
                stay("ACTIVE", LONG_AGO, null, LocalDate.of(2026, 9, 20), null),
                stay("ACTIVE", LONG_AGO, null, LocalDate.of(2026, 10, 10), null),
                stay("ACTIVE", LONG_AGO, null, LocalDate.of(2026, 11, 10), null),
                stay("ACTIVE", LONG_AGO, null, LocalDate.of(2026, 12, 20), null),
                stay("ACTIVE", LONG_AGO, null, LocalDate.of(2027, 6, 1), null),
                live(LONG_AGO)));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_TERMS_ENDING)));
        assertThat(result.parts()).extracting(Part::value).containsExactly(1L, 1L, 1L);
        // The term that ended on the 20th has ended, not "ending": it waits for someone to end the stay.
        assertThat(figure(result, "ended_open").value()).isEqualTo(1);
        assertThat(figure(result, "fixed_terms").value()).isEqualTo(5);
    }

    @Test
    void tenureCountsFromJoiningAndShowsAMedianOnlyFromFiveStays() {
        List<MonthlyStay> four = new ArrayList<>(List.of(
                live(LocalDate.of(2026, 9, 1)), live(LocalDate.of(2026, 5, 1)),
                live(LocalDate.of(2025, 12, 1)), live(LocalDate.of(2024, 1, 1))));
        when(tenancy.currentMonthlyStays(property)).thenReturn(four);
        // The 2024 start counts from 1 Jan 2025, when the property joined: 1–2 years, not 2+.
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_TENURE)));
        assertThat(result.parts()).extracting(Part::value).containsExactly(1L, 1L, 1L, 1L, 0L);
        assertThat(hasFigure(result, "median_days")).isFalse();

        four.add(live(LocalDate.of(2026, 9, 16)));
        MetricResult five = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_TENURE)));
        assertThat(figure(five, "median_days").value()).isEqualTo(148);
    }

    @Test
    void agreementStatusIncludesStaysAwaitingSignatureAndTermsSplitFixedFromIndefinite() {
        MonthlyStay signed = stay("ACTIVE", LONG_AGO, null, LocalDate.of(2027, 1, 1), null);
        MonthlyStay waiting = stay("PENDING_ACCEPTANCE", TODAY, null, null, null);
        MonthlyStay legacy = live(LONG_AGO);
        MonthlyStay cancelled = stay("ACTIVE", LONG_AGO, null, LocalDate.of(2026, 9, 20), null);
        when(tenancy.currentMonthlyStays(property)).thenReturn(List.of(signed, waiting, legacy, cancelled));
        when(compliance.agreementStatusByTenancy(property)).thenReturn(Map.of(
                signed.tenancyId(), "ACCEPTED", waiting.tenancyId(), "PENDING_ACCEPTANCE", cancelled.tenancyId(), "CANCELLED"));
        List<MetricResult> results = assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO,
                MetricKey.TENANTS_AGREEMENT_STATUS, MetricKey.TENANTS_AGREEMENT_TERMS));
        MetricResult status = results.get(0);
        assertThat(status.parts()).extracting(Part::key).containsExactly("SIGNED", "AWAITING", "DRAFT", "NONE");
        assertThat(status.parts()).extracting(Part::value).containsExactly(1L, 1L, 0L, 2L);
        // Terms count the three living here, not the stay still waiting. One past its end is still a fixed term.
        MetricResult terms = results.get(1);
        assertThat(part(terms, "FIXED")).isEqualTo(2);
        assertThat(part(terms, "INDEFINITE")).isEqualTo(1);
    }

    @Test
    void idVerificationCountsEachStayOnceByItsStrongestCheck() {
        MonthlyStay ekyc = stay("ACTIVE", LONG_AGO, null, null, true);
        MonthlyStay manual = stay("ACTIVE", LONG_AGO, null, null, true);
        MonthlyStay none = stay("ACTIVE", LONG_AGO, null, null, null);
        when(tenancy.currentMonthlyStays(property)).thenReturn(List.of(ekyc, manual, none));
        when(verification.verifiedTenancyIds(property)).thenReturn(Set.of(ekyc.tenancyId()));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_ID_VERIFICATION)));
        assertThat(result.parts()).extracting(Part::value).containsExactly(1L, 1L, 1L);
    }

    @Test
    void theProfileNeedsFiveTenantsAndNeverAsksAuthBelowThat() {
        when(tenancy.currentMonthlyStays(property)).thenReturn(List.of(live(LONG_AGO), live(LONG_AGO), live(LONG_AGO), live(LONG_AGO)));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_PROFILE)));
        assertThat(result.status()).isEqualTo(MetricStatus.TOO_FEW);
        assertThat(result.parts()).isEmpty();
        verify(auth, never()).profileCounts(anyCollection(), any());
    }

    @Test
    void theProfileSendsEveryGenderAndAgeGroupForItsTwoDonuts() {
        when(tenancy.currentMonthlyStays(property)).thenReturn(List.of(live(LONG_AGO), live(LONG_AGO), live(LONG_AGO), live(LONG_AGO), live(LONG_AGO)));
        when(auth.profileCounts(anyCollection(), eq(TODAY))).thenReturn(new AuthAnalytics.ProfileCounts(
                Map.of("MALE", 3, "NOT_GIVEN", 2), Map.of("18_24", 4, "NOT_GIVEN", 1)));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_PROFILE)));
        assertThat(result.parts()).extracting(Part::key).containsExactly(
                "GENDER_MALE", "GENDER_FEMALE", "GENDER_TRANSGENDER", "GENDER_OTHER", "GENDER_NOT_GIVEN",
                "AGE_UNDER_18", "AGE_18_24", "AGE_25_34", "AGE_35_44", "AGE_45_PLUS", "AGE_NOT_GIVEN");
        assertThat(part(result, "AGE_18_24")).isEqualTo(4);
        assertThat(part(result, "GENDER_FEMALE")).isZero();
    }

    @Test
    void mealPreferencesFoldPastFourProfilesAndCountThoseNotSubscribed() {
        List<MonthlyStay> stays = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            stays.add(live(LONG_AGO));
        }
        when(tenancy.currentMonthlyStays(property)).thenReturn(stays);
        List<FoodAnalytics.ActiveSubscription> subs = new ArrayList<>();
        String[] names = {"Veg", "Veg", "Jain", "Egg", "Non-veg", "Vegan"};
        UUID[] ids = {UUID.randomUUID(), null, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()};
        ids[1] = ids[0];
        for (int i = 0; i < names.length; i++) {
            subs.add(new FoodAnalytics.ActiveSubscription(stays.get(i).tenancyId(), ids[i], names[i]));
        }
        // A subscription for a stay no longer living here is ignored.
        subs.add(new FoodAnalytics.ActiveSubscription(UUID.randomUUID(), ids[0], "Veg"));
        when(food.activeSubscriptions(property)).thenReturn(subs);
        MetricResult result = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_MEAL_PREFERENCES)));
        assertThat(result.parts().get(0).label()).isEqualTo("Veg");
        assertThat(result.parts().get(0).value()).isEqualTo(2);
        assertThat(part(result, "OTHER")).isEqualTo(1);
        assertThat(part(result, "NOT_SUBSCRIBED")).isEqualTo(1);
    }

    @Test
    void foodOffLeavesBothFoodCardsOutOfTheResponse() {
        when(foodModule.isManagementEnabled(property)).thenReturn(false);
        List<MetricResult> results = assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO,
                MetricKey.TENANTS_MEAL_PREFERENCES, MetricKey.TENANTS_FOOD_SUBSCRIPTIONS));
        assertThat(results).isEmpty();
    }

    @Test
    void movesSumEachBucketAndCompareWithTheWindowBefore() {
        when(tenancy.monthlyMoves(property, LocalDate.of(2026, 7, 1), TODAY)).thenReturn(List.of(
                new DayMoves(LocalDate.of(2026, 7, 3), 2, 0),
                new DayMoves(LocalDate.of(2026, 9, 10), 1, 1)));
        when(tenancy.monthlyMoves(property, LocalDate.of(2026, 4, 1), LocalDate.of(2026, 6, 26))).thenReturn(List.of(
                new DayMoves(LocalDate.of(2026, 5, 3), 1, 2)));
        MetricResult result = only(assembler.assemble(context(PeriodPreset.LAST_3_MONTHS, LONG_AGO, MetricKey.TENANTS_MOVES)));
        assertThat(figure(result, "move_ins").value()).isEqualTo(3);
        assertThat(figure(result, "move_ins").previous()).isEqualTo(1);
        assertThat(figure(result, "move_outs").previous()).isEqualTo(2);
        assertThat(result.series()).hasSize(3);
        assertThat(result.series().get(1).values()).containsEntry("move_ins", 0L);
        assertThat(result.series().get(2).values()).containsEntry("move_ins", 1L).containsEntry("move_outs", 1L);
    }

    @Test
    void timeToSignShowsItsMedianOnlyFromFiveSignedAgreements() {
        when(compliance.signingTimes(property, LocalDate.of(2026, 9, 1), TODAY)).thenReturn(new ComplianceAnalytics.SigningTimes(4, 90L));
        when(compliance.signingTimes(property, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 26))).thenReturn(new ComplianceAnalytics.SigningTimes(6, 120L));
        MetricResult few = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_TIME_TO_SIGN)));
        assertThat(few.status()).isEqualTo(MetricStatus.TOO_FEW);
        assertThat(hasFigure(few, "median_minutes")).isFalse();

        when(compliance.signingTimes(property, LocalDate.of(2026, 9, 1), TODAY)).thenReturn(new ComplianceAnalytics.SigningTimes(5, 90L));
        MetricResult enough = only(assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO, MetricKey.TENANTS_TIME_TO_SIGN)));
        assertThat(figure(enough, "median_minutes").value()).isEqualTo(90);
        assertThat(figure(enough, "median_minutes").previous()).isEqualTo(120);
    }

    @Test
    void oneFailingQueryTakesOnlyItsOwnCardDown() {
        when(properties.roomVacancies(property)).thenThrow(new IllegalStateException("boom"));
        when(properties.bedCounts(property)).thenReturn(new PropertyAnalytics.BedCounts(28, 5, 1, 2));
        List<MetricResult> results = assembler.assemble(context(PeriodPreset.THIS_MONTH, LONG_AGO,
                MetricKey.TENANTS_OCCUPANCY, MetricKey.TENANTS_ROOM_VACANCY));
        assertThat(results).extracting(MetricResult::status).containsExactly(MetricStatus.OK, MetricStatus.UNAVAILABLE);
        assertThat(part(results.get(0), "VACANT")).isEqualTo(20);
    }
}
