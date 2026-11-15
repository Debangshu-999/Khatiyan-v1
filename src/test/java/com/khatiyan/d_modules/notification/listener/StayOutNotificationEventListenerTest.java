package com.khatiyan.d_modules.notification.listener;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.c_shared.billing.BillingCollectionTiming;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationAudience;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;
import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.property.api.dto.PropertyResponse;
import com.khatiyan.d_modules.property.model.BathroomType;
import com.khatiyan.d_modules.property.model.MealType;
import com.khatiyan.d_modules.property.model.NoticePeriod;
import com.khatiyan.d_modules.property.model.PgFor;
import com.khatiyan.d_modules.property.model.PreferredTenantType;
import com.khatiyan.d_modules.property.model.PropertyType;
import com.khatiyan.d_modules.tenancy.event.StayOutChangedEvent;

/** Management hears about stay outs, in the app only (user, 2026-11-08). */
@ExtendWith(MockitoExtension.class)
class StayOutNotificationEventListenerTest {

    private static final UUID PROPERTY = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    private static final UUID MANAGER = UUID.randomUUID();

    @Mock private NotificationModule notificationModule;
    @Mock private PropertyModule propertyModule;

    @Test
    void aDeclaredStayOutTellsTheOwnerAndManagers() {
        when(propertyModule.getActiveProperty(PROPERTY)).thenReturn(property());
        when(propertyModule.findActiveManagerUserIds(PROPERTY)).thenReturn(List.of(MANAGER));
        UUID stayOut = UUID.randomUUID();

        new StayOutNotificationEventListener(notificationModule, propertyModule).onStayOutChanged(new StayOutChangedEvent(
                StayOutChangedEvent.Kind.DECLARED, stayOut, UUID.randomUUID(), "TEN-2026-000033", UUID.randomUUID(),
                "Rohan Das", PROPERTY, LocalDate.of(2026, 11, 13), MealType.BREAKFAST, LocalDate.of(2026, 11, 15), null,
                "Going home"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> data = ArgumentCaptor.forClass((Class<Map<String, String>>) (Class<?>) Map.class);
        verify(notificationModule).notifyUsers(eq(List.of(OWNER, MANAGER)), eq("Rohan Das is staying out"),
                eq("Away from Fri 13 Nov to Sun 15 Nov."), eq(NotificationCategory.TENANCY), eq(NotificationPriority.LOW),
                eq(NotificationSubtype.TENANCY_STAY_OUT_DECLARED), eq(stayOut), data.capture(),
                eq(NotificationDeliveryMode.IN_APP_ONLY), eq(NotificationAudience.MANAGEMENT));
        // The card's table (user, 2026-11-09): when, from which meal to which, and why.
        assertThat(data.getValue())
                .containsEntry("leaving", "Fri 13 Nov, after breakfast")
                .containsEntry("back", "Sun 15 Nov, after dinner")
                .containsEntry("reason", "Going home")
                .containsEntry("tenancyReferenceCode", "TEN-2026-000033");
    }

    @Test
    void stayOutNoticesBelongToTheManagementWorkspace() {
        for (NotificationSubtype subtype : Set.of(NotificationSubtype.TENANCY_STAY_OUT_DECLARED,
                NotificationSubtype.TENANCY_STAY_OUT_CHANGED, NotificationSubtype.TENANCY_STAY_OUT_CANCELLED)) {
            assertThat(NotificationAudience.forSubtype(subtype)).as(subtype.name()).isEqualTo(NotificationAudience.MANAGEMENT);
        }
    }

    private static PropertyResponse property() {
        return new PropertyResponse(
                PROPERTY, "PROP-TEST", OWNER, "Sky PG", "Address", "Area", "City", "State", "700001",
                null, null, PropertyType.PG, PgFor.ANYONE, PreferredTenantType.ANYONE, true,
                Set.of(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER), false,
                BathroomType.COMMON, Set.of(), Set.of(), Set.of(), null, null, 0L, BillingCollectionTiming.CYCLE_START,
                0, 0L, NoticePeriod.ONE_MONTH, 0, null, null, false, true, 0L);
    }
}
