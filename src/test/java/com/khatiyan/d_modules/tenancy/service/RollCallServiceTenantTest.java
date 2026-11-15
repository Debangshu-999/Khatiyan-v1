package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.tenancy.api.dto.RollCallCheckInRequest;
import com.khatiyan.d_modules.tenancy.model.RollCallMark;
import com.khatiyan.d_modules.tenancy.model.RollCallMethod;
import com.khatiyan.d_modules.tenancy.model.RollCallSetting;
import com.khatiyan.d_modules.tenancy.model.RollCallStatus;
import com.khatiyan.d_modules.tenancy.model.RollCallWifi;
import com.khatiyan.d_modules.tenancy.model.StayOut;
import com.khatiyan.d_modules.tenancy.model.Tenancy;
import com.khatiyan.d_modules.tenancy.repository.RollCallMarkRepository;
import com.khatiyan.d_modules.tenancy.repository.RollCallSettingRepository;
import com.khatiyan.d_modules.tenancy.repository.RollCallWifiRepository;
import com.khatiyan.d_modules.tenancy.repository.StayOutRepository;
import com.khatiyan.d_modules.tenancy.repository.TenancyRepository;

/**
 * The tenant's side of the roll call (user, 2026-11-09 and 2026-11-15): WiFi or
 * within 100 m when automatic check-in is on, Mark present otherwise, a failed
 * check recording nothing, a warden's mark final.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RollCallServiceTenantTest {

    /** 21:30 in India on 15 Nov. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-15T16:00:00Z"), ZoneOffset.UTC);
    private static final LocalDate NIGHT = LocalDate.of(2026, 11, 15);
    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final BigDecimal LAT = new BigDecimal("22.5726");
    private static final BigDecimal LNG = new BigDecimal("88.3639");
    private static final String ROUTER = "aa:bb:cc:dd:ee:ff";

    @Mock private RollCallSettingRepository settings;
    @Mock private RollCallWifiRepository wifi;
    @Mock private RollCallMarkRepository marks;
    @Mock private TenancyRepository tenancies;
    @Mock private StayOutRepository stayOuts;
    @Mock private PropertyModule propertyModule;
    @Mock private TenancyAccessPolicy access;
    @Mock private AuthModule authModule;

    private RollCallService service;
    private Tenancy tenancy;
    private RollCallSetting setting;

    @BeforeEach
    void setUp() {
        service = new RollCallService(settings, wifi, marks, tenancies, stayOuts, propertyModule, access, authModule, CLOCK);
        tenancy = Tenancy.start(TENANT, UUID.randomUUID(), UUID.randomUUID(), OWNER, 800000, 100000, LocalDate.of(2026, 8, 1));
        when(tenancies.findByUserIdAndActiveTrue(TENANT)).thenReturn(Optional.of(tenancy));
        when(tenancies.findByUserIdAndActiveTrueForUpdate(TENANT)).thenReturn(Optional.of(tenancy));
        at(PropertyType.PG, LAT, LNG);
        setting = RollCallSetting.offFor(tenancy.getPropertyId());
        setting.update(true, true, 21 * 60, 60);
        when(settings.findById(tenancy.getPropertyId())).thenReturn(Optional.of(setting));
        when(wifi.findByPropertyIdOrderByCreatedAtAsc(tenancy.getPropertyId()))
                .thenReturn(List.of(RollCallWifi.add(tenancy.getPropertyId(), ROUTER, "SkyLux", OWNER)));
        when(marks.save(any(RollCallMark.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void offOrNoWindowIsNotAvailable() {
        setting.update(false, true, 21 * 60, 60);
        assertThat(service.mine(TENANT).available()).isFalse();

        setting.update(true, true, null, null);
        assertThat(service.mine(TENANT).available()).isFalse();
    }

    @Test
    void aHouseIsNotAvailable() {
        at(PropertyType.APARTMENT, LAT, LNG);
        assertThat(service.mine(TENANT).available()).isFalse();
    }

    @Test
    void openTonightAndNotMarkedYet() {
        var today = service.mine(TENANT);

        assertThat(today.available()).isTrue();
        assertThat(today.open()).isTrue();
        assertThat(today.night()).isEqualTo(NIGHT);
        assertThat(today.state()).isEqualTo("NOT_MARKED");
        assertThat(today.autoCheckIn()).isTrue();
    }

    @Test
    void aDeclaredStayOutReadsAwayDeclared() {
        when(stayOuts.findLiveAtProperty(tenancy.getPropertyId(), NIGHT, NIGHT)).thenReturn(List.of(
                StayOut.declare(tenancy.getId(), tenancy.getPropertyId(), TENANT, NIGHT, null, NIGHT.plusDays(2), null, null)));

        assertThat(service.mine(TENANT).state()).isEqualTo("AWAY_DECLARED");
    }

    @Test
    void aMatchingRouterMarksPresentByWifi() {
        var today = service.checkIn(TENANT, new RollCallCheckInRequest("AA:BB:CC:DD:EE:FF", null, null, null, null));

        assertThat(today.state()).isEqualTo("PRESENT");
        assertThat(today.method()).isEqualTo(RollCallMethod.WIFI);
        assertThat(today.markedAt()).isNotNull();
    }

    @Test
    void theBlankAndroidBssidNeverMatches() {
        when(wifi.findByPropertyIdOrderByCreatedAtAsc(tenancy.getPropertyId()))
                .thenReturn(List.of(RollCallWifi.add(tenancy.getPropertyId(), "02:00:00:00:00:00", null, OWNER)));

        var today = service.checkIn(TENANT, new RollCallCheckInRequest("02:00:00:00:00:00", null, null, null, null));

        assertThat(today.state()).isEqualTo("NOT_MARKED");
        verify(marks, never()).save(any());
    }

    @Test
    void withinOneHundredMetresMarksPresentByLocation() {
        // About 90 m north of the pin.
        var near = service.checkIn(TENANT, new RollCallCheckInRequest(null, new BigDecimal("22.5734"), LNG, 20.0, false));
        assertThat(near.state()).isEqualTo("PRESENT");
        assertThat(near.method()).isEqualTo(RollCallMethod.LOCATION);
    }

    @Test
    void beyondOneHundredMetresMarksNothing() {
        // About 120 m north of the pin.
        var far = service.checkIn(TENANT, new RollCallCheckInRequest(null, new BigDecimal("22.57368"), LNG, 20.0, false));

        assertThat(far.state()).isEqualTo("NOT_MARKED");
        verify(marks, never()).save(any());
    }

    @Test
    void aMockedPositionIsRefused() {
        var today = service.checkIn(TENANT, new RollCallCheckInRequest(null, LAT, LNG, 5.0, true));

        assertThat(today.state()).isEqualTo("NOT_MARKED");
        verify(marks, never()).save(any());
    }

    @Test
    void noPinSkipsLocation() {
        at(PropertyType.PG, null, null);

        var today = service.checkIn(TENANT, new RollCallCheckInRequest(null, LAT, LNG, 5.0, false));

        assertThat(today.state()).isEqualTo("NOT_MARKED");
    }

    @Test
    void automaticCheckInOffVerifiesNothing() {
        setting.update(true, false, 21 * 60, 60);

        var today = service.checkIn(TENANT, new RollCallCheckInRequest(ROUTER, LAT, LNG, 5.0, false));

        assertThat(today.state()).isEqualTo("NOT_MARKED");
        verify(marks, never()).save(any());
    }

    @Test
    void markPresentRecordsASelfMark() {
        var today = service.markPresent(TENANT);

        assertThat(today.state()).isEqualTo("PRESENT");
        assertThat(today.method()).isEqualTo(RollCallMethod.SELF);
    }

    @Test
    void aVerifiedMarkIsNotReplacedBySelf() {
        RollCallMark verified = RollCallMark.of(tenancy.getPropertyId(), tenancy.getId(), NIGHT,
                RollCallStatus.PRESENT, RollCallMethod.WIFI, Instant.parse("2026-11-15T15:45:00Z"), TENANT);
        when(marks.findByTenancyIdAndNight(tenancy.getId(), NIGHT)).thenReturn(Optional.of(verified));

        var today = service.markPresent(TENANT);

        assertThat(today.method()).isEqualTo(RollCallMethod.WIFI);
        verify(marks, never()).save(any());
    }

    @Test
    void aWardensMarkIsNotChangedByTheTenant() {
        RollCallMark warden = RollCallMark.of(tenancy.getPropertyId(), tenancy.getId(), NIGHT,
                RollCallStatus.ABSENT, RollCallMethod.WARDEN, Instant.parse("2026-11-15T15:45:00Z"), OWNER);
        when(marks.findByTenancyIdAndNight(tenancy.getId(), NIGHT)).thenReturn(Optional.of(warden));

        var today = service.checkIn(TENANT, new RollCallCheckInRequest(ROUTER, null, null, null, null));

        assertThat(today.state()).isEqualTo("ABSENT");
        assertThat(today.method()).isEqualTo(RollCallMethod.WARDEN);
        verify(marks, never()).save(any());
    }

    @Test
    void outsideTheWindowIsRefused() {
        setting.update(true, true, 6 * 60, 7 * 60);

        assertThatThrownBy(() -> service.markPresent(TENANT))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Roll call is not open now.");
        assertThatThrownBy(() -> service.checkIn(TENANT, new RollCallCheckInRequest(ROUTER, null, null, null, null)))
                .isInstanceOf(ValidationException.class);
    }

    private void at(PropertyType type, BigDecimal lat, BigDecimal lng) {
        when(propertyModule.getActiveProperty(tenancy.getPropertyId())).thenReturn(new PropertyResponse(
                tenancy.getPropertyId(), "PROP-TEST", OWNER, "Sky PG", "Address", "Area", "City", "State", "700001",
                lat, lng, type, PgFor.ANYONE, PreferredTenantType.ANYONE, true, Set.of(MealType.DINNER), false, BathroomType.COMMON,
                Set.of(), Set.of(), Set.of(), null, null, 0L, BillingCollectionTiming.CYCLE_START, 0, 0L,
                NoticePeriod.ONE_MONTH, 0, null, null, false, true, 0L));
    }
}
