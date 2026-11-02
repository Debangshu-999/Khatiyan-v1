package com.khatiyan.d_modules.notification.listener;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.billing.damage.DamageRecordChangedEvent;
import com.khatiyan.d_modules.notification.NotificationModule;
import com.khatiyan.d_modules.notification.model.NotificationCategory;
import com.khatiyan.d_modules.notification.model.NotificationDeliveryMode;
import com.khatiyan.d_modules.notification.model.NotificationPriority;
import com.khatiyan.d_modules.notification.model.NotificationSubtype;

/** Every tenant a damage record names hears of it, with their own share (2026-10-29). */
class DamageRecordNotificationEventListenerTest {

    @Test
    void eachTenantNamedIsToldTheirShare() {
        NotificationModule notifications = mock(NotificationModule.class);
        UUID asha = UUID.randomUUID();
        UUID ravi = UUID.randomUUID();
        UUID record = UUID.randomUUID();

        new DamageRecordNotificationEventListener(notifications).onDamageRecordChanged(new DamageRecordChangedEvent(
                record, "DMG-0012", UUID.randomUUID(), "Cupboard", "D3", DamageRecordChangedEvent.Kind.CREATED,
                List.of(new DamageRecordChangedEvent.Recipient(asha, UUID.randomUUID(), 120_050L),
                        new DamageRecordChangedEvent.Recipient(ravi, UUID.randomUUID(), 120_000L))));

        verify(notifications).notifyUser(eq(asha), eq("Damage recorded"), contains("Rs. 1200.50"),
                eq(NotificationCategory.PAYMENT), eq(NotificationPriority.NORMAL), eq(NotificationSubtype.DAMAGE_RECORDED),
                eq(record), anyMap(), eq(NotificationDeliveryMode.IN_APP_AND_PUSH));
        verify(notifications).notifyUser(eq(ravi), any(), contains("Rs. 1200 of it"), any(), any(),
                eq(NotificationSubtype.DAMAGE_RECORDED), eq(record), anyMap(), any());
    }

    @Test
    void aRemovedRecordSaysSo() {
        NotificationModule notifications = mock(NotificationModule.class);
        UUID asha = UUID.randomUUID();

        new DamageRecordNotificationEventListener(notifications).onDamageRecordChanged(new DamageRecordChangedEvent(
                UUID.randomUUID(), "DMG-0012", UUID.randomUUID(), "AC", "D2", DamageRecordChangedEvent.Kind.DELETED,
                List.of(new DamageRecordChangedEvent.Recipient(asha, UUID.randomUUID(), 50_000L))));

        verify(notifications, times(1)).notifyUser(eq(asha), eq("Damage record removed"), contains("DMG-0012"),
                any(), any(), eq(NotificationSubtype.DAMAGE_RECORD_REMOVED), any(), anyMap(), any());
    }
}
