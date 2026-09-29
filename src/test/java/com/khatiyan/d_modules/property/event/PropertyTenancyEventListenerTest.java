package com.khatiyan.d_modules.property.event;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.property.PropertyModule;
import com.khatiyan.d_modules.tenancy.event.FutureBookingOccupancyEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyEndedEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyRoomTransferredEvent;
import com.khatiyan.d_modules.tenancy.event.TenancyStartedEvent;

@ExtendWith(MockitoExtension.class)
class PropertyTenancyEventListenerTest {

    @Mock private PropertyModule propertyModule;

    @Test
    void futureBookingDoesNotOccupyItsBedAtCreation() {
        UUID propertyId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        PropertyTenancyEventListener listener = new PropertyTenancyEventListener(propertyModule);

        listener.onTenancyStarted(new TenancyStartedEvent(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), propertyId, roomId,
                LocalDate.now(), true, true));

        verify(propertyModule, never()).handleTenancyStarted(propertyId, roomId);
    }

    @Test
    void outgoingTransferHoldsOldBedThenBookingTakesIt() {
        UUID propertyId = UUID.randomUUID();
        UUID oldRoomId = UUID.randomUUID();
        UUID newRoomId = UUID.randomUUID();
        PropertyTenancyEventListener listener = new PropertyTenancyEventListener(propertyModule);

        listener.onTenancyRoomTransferred(new TenancyRoomTransferredEvent(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), propertyId,
                oldRoomId, newRoomId, LocalDate.now(), 12_000_00L, true));
        listener.onFutureBookingOccupancy(new FutureBookingOccupancyEvent(propertyId, oldRoomId));

        InOrder order = inOrder(propertyModule);
        order.verify(propertyModule).handleTenancyRoomTransferred(propertyId, oldRoomId, newRoomId);
        order.verify(propertyModule).reserveRoomSlot(propertyId, oldRoomId);
        order.verify(propertyModule).releaseRoomSlotReservation(propertyId, oldRoomId);
        order.verify(propertyModule).handleTenancyStarted(propertyId, oldRoomId);
    }

    @Test
    void endedStayWithABookingHoldsItsBedThenBookingTakesIt() {
        UUID propertyId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        PropertyTenancyEventListener listener = new PropertyTenancyEventListener(propertyModule);

        listener.onTenancyEnded(new TenancyEndedEvent(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), propertyId, roomId, LocalDate.now(), true));
        listener.onFutureBookingOccupancy(new FutureBookingOccupancyEvent(propertyId, roomId));

        InOrder order = inOrder(propertyModule);
        order.verify(propertyModule).handleTenancyEnded(propertyId, roomId);
        order.verify(propertyModule).reserveRoomSlot(propertyId, roomId);
        order.verify(propertyModule).releaseRoomSlotReservation(propertyId, roomId);
        order.verify(propertyModule).handleTenancyStarted(propertyId, roomId);
    }

    @Test
    void endedStayWithNoBookingJustFreesItsBed() {
        UUID propertyId = UUID.randomUUID();
        UUID roomId = UUID.randomUUID();
        PropertyTenancyEventListener listener = new PropertyTenancyEventListener(propertyModule);

        listener.onTenancyEnded(new TenancyEndedEvent(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), propertyId, roomId, LocalDate.now()));

        verify(propertyModule).handleTenancyEnded(propertyId, roomId);
        verify(propertyModule, never()).reserveRoomSlot(propertyId, roomId);
    }
}
