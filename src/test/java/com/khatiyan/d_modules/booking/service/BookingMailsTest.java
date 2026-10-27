package com.khatiyan.d_modules.booking.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Money in the tenant's mails, written the Indian way (2026-10-18). */
class BookingMailsTest {

    @Test
    void rupeesAreGroupedInLakhsAndThousands() {
        assertThat(BookingMails.rupees(0)).isEqualTo("₹0");
        assertThat(BookingMails.rupees(99_900)).isEqualTo("₹999");
        assertThat(BookingMails.rupees(2_160_000)).isEqualTo("₹21,600");
        assertThat(BookingMails.rupees(12_500_000)).isEqualTo("₹1,25,000");
        assertThat(BookingMails.rupees(1_000_000_000)).isEqualTo("₹1,00,00,000");
        assertThat(BookingMails.rupees(150_050)).isEqualTo("₹1,500.50");
    }
}
