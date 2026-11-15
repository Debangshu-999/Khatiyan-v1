package com.khatiyan.d_modules.tenancy.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.khatiyan.a_auth.AuthModule;
import com.khatiyan.a_auth.api.dto.UserSummaryResponse;
import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.StaleVersionException;
import com.khatiyan.c_shared.exception.ValidationException;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.tenancy.api.dto.AddRollCallWifiRequest;
import com.khatiyan.d_modules.tenancy.api.dto.SaveRollCallSettingsRequest;
import com.khatiyan.d_modules.tenancy.api.dto.SetRollCallMarkRequest;
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

/** The warden's side of the roll call (user, 2026-11-15): the night's list, marks, settings and WiFi. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RollCallServiceManagementTest {

    /** 21:30 in India on 15 Nov. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-15T16:00:00Z"), ZoneOffset.UTC);
    private static final LocalDate NIGHT = LocalDate.of(2026, 11, 15);
    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID PROPERTY = UUID.randomUUID();
    private static final Instant EARLIER = Instant.parse("2026-11-15T15:45:00Z");

    @Mock private RollCallSettingRepository settings;
    @Mock private RollCallWifiRepository wifi;
    @Mock private RollCallMarkRepository marks;
    @Mock private TenancyRepository tenancies;
    @Mock private StayOutRepository stayOuts;
    @Mock private PropertyModule propertyModule;
    @Mock private TenancyAccessPolicy access;
    @Mock private AuthModule authModule;

    private RollCallService service;
    private RollCallSetting setting;

    @BeforeEach
    void setUp() {
        service = new RollCallService(settings, wifi, marks, tenancies, stayOuts, propertyModule, access, authModule, CLOCK);
        setting = RollCallSetting.offFor(PROPERTY);
        setting.update(true, true, 21 * 60, 60);
        when(settings.findById(PROPERTY)).thenReturn(Optional.of(setting));
        when(settings.saveAndFlush(any(RollCallSetting.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(propertyModule.getActiveProperty(PROPERTY)).thenReturn(property());
        when(marks.save(any(RollCallMark.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void theNightListsEveryCurrentMonthlyStayWithItsState() {
        Tenancy wifiOne = stay();
        Tenancy selfOne = stay();
        Tenancy awayOne = stay();
        Tenancy absentOne = stay();
        Tenancy unmarked = stay();
        when(tenancies.findByPropertyIdAndActiveTrue(PROPERTY)).thenReturn(List.of(wifiOne, selfOne, awayOne, absentOne, unmarked));
        when(marks.findByPropertyIdAndNight(PROPERTY, NIGHT)).thenReturn(List.of(
                mark(wifiOne, RollCallStatus.PRESENT, RollCallMethod.WIFI),
                mark(selfOne, RollCallStatus.PRESENT, RollCallMethod.SELF),
                mark(absentOne, RollCallStatus.ABSENT, RollCallMethod.WARDEN)));
        when(stayOuts.findLiveAtProperty(PROPERTY, NIGHT, NIGHT)).thenReturn(List.of(
                StayOut.declare(awayOne.getId(), PROPERTY, awayOne.getUserId(), NIGHT, null, NIGHT.plusDays(1), null, null)));
        when(authModule.findByIds(anyCollection())).thenReturn(Map.of(unmarked.getUserId(), person(unmarked.getUserId(), "Priya Saha")));

        var night = service.night(OWNER, PROPERTY, null);

        assertThat(night.night()).isEqualTo(NIGHT);
        assertThat(night.tonight()).isEqualTo(NIGHT);
        assertThat(night.counts().present()).isEqualTo(2);
        assertThat(night.counts().presentVerified()).isEqualTo(1);
        assertThat(night.counts().presentSelf()).isEqualTo(1);
        assertThat(night.counts().away()).isEqualTo(1);
        assertThat(night.counts().absent()).isEqualTo(1);
        assertThat(night.counts().notMarked()).isEqualTo(1);
        // Not marked first.
        assertThat(night.entries().get(0).state()).isEqualTo("NOT_MARKED");
        assertThat(night.entries().get(0).tenantName()).isEqualTo("Priya Saha");
        verify(access).ensureCanViewCurrentStays(OWNER, PROPERTY);
    }

    @Test
    void aNightAfterTonightReadsTonight() {
        when(tenancies.findByPropertyIdAndActiveTrue(PROPERTY)).thenReturn(List.of());

        assertThat(service.night(OWNER, PROPERTY, NIGHT.plusDays(3)).night()).isEqualTo(NIGHT);
    }

    @Test
    void aWardenMarkAndClear() {
        Tenancy tenancy = stay();
        when(tenancies.findById(tenancy.getId())).thenReturn(Optional.of(tenancy));
        when(tenancies.findByPropertyIdAndActiveTrue(PROPERTY)).thenReturn(List.of(tenancy));

        service.setMark(OWNER, PROPERTY, tenancy.getId(), new SetRollCallMarkRequest(NIGHT, RollCallStatus.ABSENT));

        ArgumentCaptor<RollCallMark> saved = ArgumentCaptor.forClass(RollCallMark.class);
        verify(marks).save(saved.capture());
        assertThat(saved.getValue().getMethod()).isEqualTo(RollCallMethod.WARDEN);
        assertThat(saved.getValue().getStatus()).isEqualTo(RollCallStatus.ABSENT);
        verify(access).ensureCanManageStays(OWNER, PROPERTY);

        RollCallMark existing = mark(tenancy, RollCallStatus.ABSENT, RollCallMethod.WARDEN);
        when(marks.findByTenancyIdAndNight(tenancy.getId(), NIGHT)).thenReturn(Optional.of(existing));
        service.setMark(OWNER, PROPERTY, tenancy.getId(), new SetRollCallMarkRequest(NIGHT, null));
        verify(marks).delete(existing);
    }

    @Test
    void aMarkForATenancyElsewhereIsRefused() {
        Tenancy elsewhere = Tenancy.start(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), OWNER, 800000, 100000, LocalDate.of(2026, 8, 1));
        when(tenancies.findById(elsewhere.getId())).thenReturn(Optional.of(elsewhere));

        assertThatThrownBy(() -> service.setMark(OWNER, PROPERTY, elsewhere.getId(), new SetRollCallMarkRequest(NIGHT, RollCallStatus.PRESENT)))
                .isInstanceOf(com.khatiyan.c_shared.exception.NotFoundException.class);
    }

    @Test
    void enablingNeedsAWindow() {
        assertThatThrownBy(() -> service.saveSettings(OWNER, PROPERTY, new SaveRollCallSettingsRequest(true, false, null, null, null)))
                .isInstanceOf(ValidationException.class)
                .hasMessage("Set the window first.");
        assertThatThrownBy(() -> service.saveSettings(OWNER, PROPERTY, new SaveRollCallSettingsRequest(false, false, 600, 600, null)))
                .isInstanceOf(ValidationException.class);

        var saved = service.saveSettings(OWNER, PROPERTY, new SaveRollCallSettingsRequest(true, false, 20 * 60, 23 * 60, null));
        assertThat(saved.enabled()).isTrue();
        assertThat(saved.autoCheckIn()).isFalse();
        assertThat(saved.radiusMeters()).isEqualTo(100);
        verify(access, org.mockito.Mockito.atLeastOnce()).ensureCanManageRollCall(OWNER, PROPERTY);
    }

    @Test
    void aStaleVersionIsRefused() {
        assertThatThrownBy(() -> service.saveSettings(OWNER, PROPERTY, new SaveRollCallSettingsRequest(true, true, 21 * 60, 60, 7L)))
                .isInstanceOf(StaleVersionException.class);
    }

    @Test
    void wifiIsAddedOnceAndRemoved() {
        service.addWifi(OWNER, PROPERTY, new AddRollCallWifiRequest("AA:BB:CC:DD:EE:FF", "SkyLux"));
        ArgumentCaptor<RollCallWifi> added = ArgumentCaptor.forClass(RollCallWifi.class);
        verify(wifi).save(added.capture());
        assertThat(added.getValue().getBssid()).isEqualTo("aa:bb:cc:dd:ee:ff");

        when(wifi.existsByPropertyIdAndBssid(PROPERTY, "aa:bb:cc:dd:ee:ff")).thenReturn(true);
        assertThatThrownBy(() -> service.addWifi(OWNER, PROPERTY, new AddRollCallWifiRequest("aa:bb:cc:dd:ee:ff", null)))
                .hasMessage("This WiFi is already added.");
        assertThatThrownBy(() -> service.addWifi(OWNER, PROPERTY, new AddRollCallWifiRequest("02:00:00:00:00:00", null)))
                .hasMessage("Connect to the property's WiFi first.");

        RollCallWifi router = added.getValue();
        when(wifi.findById(router.getId())).thenReturn(Optional.of(router));
        service.removeWifi(OWNER, PROPERTY, router.getId());
        verify(wifi).delete(router);
    }

    @Test
    void aManagerWithoutTenancyRulesCannotChangeSettings() {
        UUID manager = UUID.randomUUID();
        doThrow(new ForbiddenException("No access")).when(access).ensureCanManageRollCall(manager, PROPERTY);

        assertThatThrownBy(() -> service.saveSettings(manager, PROPERTY, new SaveRollCallSettingsRequest(false, false, null, null, null)))
                .isInstanceOf(ForbiddenException.class);
        verify(settings, never()).saveAndFlush(any());
        verify(wifi, never()).save(eq(null));
    }

    private static Tenancy stay() {
        Tenancy tenancy = Tenancy.start(UUID.randomUUID(), PROPERTY, UUID.randomUUID(), OWNER, 800000, 100000, LocalDate.of(2026, 8, 1));
        return tenancy;
    }

    private static RollCallMark mark(Tenancy tenancy, RollCallStatus status, RollCallMethod method) {
        return RollCallMark.of(PROPERTY, tenancy.getId(), NIGHT, status, method, EARLIER, tenancy.getUserId());
    }

    private static UserSummaryResponse person(UUID id, String name) {
        return new UserSummaryResponse(id, "9876543210", null, name, null, null, true, true, true, false, true);
    }

    private static PropertyResponse property() {
        return new PropertyResponse(
                PROPERTY, "PROP-TEST", OWNER, "Sky PG", "Address", "Area", "City", "State", "700001",
                null, null, PropertyType.HOSTEL, PgFor.ANYONE, PreferredTenantType.ANYONE, true, Set.of(MealType.DINNER), false, BathroomType.COMMON,
                Set.of(), Set.of(), Set.of(), null, null, 0L, BillingCollectionTiming.CYCLE_START, 0, 0L,
                NoticePeriod.ONE_MONTH, 0, null, null, false, true, 0L);
    }
}
