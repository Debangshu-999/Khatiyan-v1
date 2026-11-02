package com.khatiyan.c_shared.money;

/**
 * Value object representing rupee amounts as paise (integer).
 *
 * <p>All monetary math in the application goes through this type
 * to avoid the rounding errors and silent precision loss that come
 * with floating-point arithmetic on currency values.
 */
public record Money(long paise) {

    public static Money ofPaise(long paise) {
        return new Money(paise);
    }

    public static Money ofRupees(long rupees) {
        return new Money(rupees * 100);
    }

    public Money add(Money other) {
        return new Money(this.paise + other.paise);
    }

    public Money subtract(Money other) {
        return new Money(this.paise - other.paise);
    }

    /**
     * Computes a percentage of this amount, expressed in basis points
     * (1 basis point = 0.01%). Using basis points keeps the API
     * integer-only and avoids float arithmetic.
     *
     * <p>Example: {@code amount.percentOf(500)} returns 5% of the amount.
     */
    public Money percentOf(int basisPoints) {
        return new Money(Math.round((double) this.paise * basisPoints / 10000));
    }

    public boolean isPositive() {
        return paise > 0;
    }

    public boolean isZero() {
        return paise == 0;
    }

    public String formatRupees() {
        long rupees = paise / 100;
        long fractional = Math.abs(paise % 100);
        return "Rs. %s.%02d".formatted(indianGrouped(rupees), fractional);
    }

    /**
     * A whole number grouped the Indian way: 1,18,610, never 118,610 (user,
     * 2026-11-01). Written by hand because Java cannot do it: {@code %,d} and
     * {@code NumberFormat} group in threes even for the en-IN locale.
     */
    public static String indianGrouped(long number) {
        String digits = Long.toString(Math.abs(number));
        String sign = number < 0 ? "-" : "";
        if (digits.length() <= 3) {
            return sign + digits;
        }
        String head = digits.substring(0, digits.length() - 3);
        StringBuilder grouped = new StringBuilder(sign);
        for (int i = 0; i < head.length(); i++) {
            if (i > 0 && (head.length() - i) % 2 == 0) {
                grouped.append(',');
            }
            grouped.append(head.charAt(i));
        }
        return grouped.append(',').append(digits.substring(digits.length() - 3)).toString();
    }
}
