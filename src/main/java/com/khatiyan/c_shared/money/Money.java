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
        return "Rs. %,d.%02d".formatted(rupees, fractional);
    }
}
