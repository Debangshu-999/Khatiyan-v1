package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.c_shared.exception.ForbiddenException;
import com.khatiyan.c_shared.exception.NotFoundException;
import com.khatiyan.d_modules.booking.BookingFixtures;
import com.khatiyan.d_modules.booking.api.dto.BookingListFilter;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestListItemResponse;
import com.khatiyan.d_modules.booking.api.dto.BookingRequestResponse;
import com.khatiyan.d_modules.booking.api.dto.CreateBookingRequest;
import com.khatiyan.d_modules.booking.api.dto.SaveBookingSettingsRequest;
import com.khatiyan.support.IntegrationTest;

/**
 * The chat about a booking made in the app (user, 2026-10-27): one private
 * conversation between the person who booked and whoever handles the booking,
 * that follows the booking to a new handler and is read-only once it ends.
 */
@IntegrationTest
class BookingChatIntegrationTest {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private BookingRequestService bookings;
    @Autowired private BookingNegotiationService negotiation;
    @Autowired private BookingSettingsService settings;
    @Autowired private BookingChatService chats;

    private BookingFixtures fx;
    private UUID property;
    private UUID owner;
    private UUID room;
    private UUID tenant;
    private LocalDate today;

    @BeforeEach
    void seed() {
        today = LocalDate.now(IST);
        fx = new BookingFixtures(jdbc);
        property = fx.property();
        owner = fx.ownerAccount(property);
        room = fx.room(property, 6, 0);
        fx.paymentDetails(property, true, false);
        settings.create(owner, property, new SaveBookingSettingsRequest(true, 200_000L, true, 21, true));
        tenant = fx.appUser();
    }

    @AfterEach
    void remove() {
        jdbc.update("""
                DELETE FROM chat.chat_thread_members WHERE thread_id IN
                    (SELECT id FROM chat.chat_threads WHERE property_id = ?)""", property);
        jdbc.update("DELETE FROM chat.chat_threads WHERE property_id = ?", property);
        fx.remove();
    }

    @Test
    void theBookerAndTheOwnerShareOneChatWhileNobodyHandlesIt() {
        BookingRequestResponse sent = ask();

        UUID thread = chats.openForBooker(tenant, sent.id());
        assertThat(chats.openForProperty(owner, property, sent.id())).as("one chat per booking").isEqualTo(thread);
        assertThat(members(thread)).containsExactlyInAnyOrder(tenant, owner);
        assertThat(status(thread)).isEqualTo("OPEN");

        // Nobody else's booking.
        UUID stranger = fx.appUser();
        assertThatThrownBy(() -> chats.openForBooker(stranger, sent.id())).isInstanceOf(NotFoundException.class);
        // Both sides' cards offer it.
        assertThat(bookings.pageForTenant(tenant, 0, 20).items())
                .extracting(BookingRequestListItemResponse::canChat).containsOnly(true);
        assertThat(propertyCard(owner, sent.id()).canChat()).isTrue();
    }

    @Test
    void theChatFollowsTheBookingToANewHandlerAndIsReadOnlyOnceItEnds() {
        BookingRequestResponse sent = ask();
        UUID thread = chats.openForBooker(tenant, sent.id());

        UUID manager = fx.manager(property, "Ravi Sen");
        fx.grantBookings(property, manager);
        fx.assign(sent.id(), manager);
        chats.sync(sent.id());

        // The manager takes the owner's place in it, with what was said.
        assertThat(members(thread)).containsExactlyInAnyOrder(tenant, manager);
        assertThat(chats.openForProperty(manager, property, sent.id())).isEqualTo(thread);
        assertThatThrownBy(() -> chats.openForProperty(owner, property, sent.id()))
                .isInstanceOf(ForbiddenException.class);
        assertThat(propertyCard(manager, sent.id()).canChat()).isTrue();
        assertThat(propertyCard(owner, sent.id()).canChat()).isFalse();

        // Cancelled: read-only, kept, by the booking's own change event.
        negotiation.cancelForProperty(owner, property, sent.id(), "The room needs repairs.");
        assertThat(eventuallyReadOnly(thread)).isTrue();
        assertThat(chats.openForBooker(tenant, sent.id())).as("still opens, to read").isEqualTo(thread);
    }

    private BookingRequestListItemResponse propertyCard(UUID reader, UUID requestId) {
        return bookings.pageForProperty(reader, property, BookingListFilter.HISTORY, null, false, false, null, 0, 50)
                .items().stream().filter(item -> item.id().equals(requestId)).findFirst()
                .or(() -> bookings.pageForProperty(reader, property, BookingListFilter.OPEN, null, false, false, null,
                        0, 50).items().stream().filter(item -> item.id().equals(requestId)).findFirst())
                .orElseThrow();
    }

    private BookingRequestResponse ask() {
        UUID enquiry = fx.attendedEnquiry(property, tenant, today.minusDays(1));
        return bookings.create(tenant, new CreateBookingRequest(enquiry, room, null, today.plusDays(5), null, null,
                "Asha Rao", "9007433360", null, Gender.FEMALE, LocalDate.of(2000, 1, 1), UUID.randomUUID().toString()));
    }

    private Set<UUID> members(UUID thread) {
        return Set.copyOf(jdbc.queryForList(
                "SELECT user_id FROM chat.chat_thread_members WHERE thread_id = ?", UUID.class, thread));
    }

    private String status(UUID thread) {
        return jdbc.queryForObject("SELECT status FROM chat.chat_threads WHERE id = ?", String.class, thread);
    }

    private boolean eventuallyReadOnly(UUID thread) {
        for (int waited = 0; waited < 50; waited++) {
            if ("READ_ONLY".equals(status(thread))) {
                return true;
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }
}
