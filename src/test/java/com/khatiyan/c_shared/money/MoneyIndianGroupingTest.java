package com.khatiyan.c_shared.money;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MoneyIndianGroupingTest {

    @Test
    void groupsTheIndianWayNeverInThrees() {
        assertThat(Money.indianGrouped(999)).isEqualTo("999");
        assertThat(Money.indianGrouped(1_000)).isEqualTo("1,000");
        assertThat(Money.indianGrouped(21_600)).isEqualTo("21,600");
        assertThat(Money.indianGrouped(118_610)).isEqualTo("1,18,610");
        assertThat(Money.indianGrouped(1_234_567)).isEqualTo("12,34,567");
        assertThat(Money.indianGrouped(10_000_000)).isEqualTo("1,00,00,000");
        assertThat(Money.indianGrouped(-118_610)).isEqualTo("-1,18,610");
    }

    @Test
    void formatRupeesUsesTheSameGrouping() {
        assertThat(Money.ofPaise(11_861_050).formatRupees()).isEqualTo("Rs. 1,18,610.50");
    }
}
