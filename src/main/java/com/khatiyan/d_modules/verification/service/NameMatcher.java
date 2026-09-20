package com.khatiyan.d_modules.verification.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Whether the name we hold is the name on the government record.
 *
 * <p><b>Strict, on purpose.</b> The whole value of a verified tenancy is that
 * its details are the ones on the tenant's ID — a record saying "Rajesh Kumar"
 * backed by an Aadhaar saying "Rajesh Kumar Sharma" is not a verified tenant,
 * it is a tenant whose real name we never wrote down. A middle name is part of
 * the name, not an optional flourish, and an agreement, a police verification
 * or a deposit dispute all turn on the full one.
 *
 * <p>So the only differences forgiven are ways of typing the same characters:
 * case, extra spaces, and the punctuation of "R.K." against "R K". A dropped
 * name, an added name, or an initial standing in for a word is a different
 * name and is refused.
 *
 * <p>This means onboarding has to capture the name AS PRINTED on the Aadhaar.
 * The flow says so before a check is started, because discovering it afterwards
 * costs the owner an attempt.
 *
 * <p>{@link #score} still reports how close a refused name came. That is for a
 * human reading a failure — "one token out of three" and "two out of three" are
 * different conversations — and it never softens the verdict.
 */
public final class NameMatcher {

    private NameMatcher() {
    }

    /** Whether these are the same name. Nothing partial counts. */
    public static boolean matches(String tenancyName, String verifiedName) {
        List<String> left = tokens(tenancyName);
        List<String> right = tokens(verifiedName);
        return !left.isEmpty() && left.equals(right);
    }

    /**
     * How much of the name was shared, for a person reading a failure.
     *
     * <p>Diagnostic only. A score of 0.667 is still a refusal — it just tells
     * support that a middle name is missing rather than that a different human
     * turned up.
     */
    public static BigDecimal score(String tenancyName, String verifiedName) {
        Set<String> left = new LinkedHashSet<>(tokens(tenancyName));
        Set<String> right = new LinkedHashSet<>(tokens(verifiedName));
        if (left.isEmpty() || right.isEmpty()) {
            return BigDecimal.ZERO.setScale(3, RoundingMode.HALF_UP);
        }

        Set<String> shared = new LinkedHashSet<>(left);
        shared.retainAll(right);
        int union = left.size() + right.size() - shared.size();
        return BigDecimal.valueOf(shared.size()).divide(BigDecimal.valueOf(union), 3, RoundingMode.HALF_UP);
    }

    /**
     * The same characters, however they were typed.
     *
     * <p>Order is kept — a list, not a set — because "Kumar Rajesh" is not
     * "Rajesh Kumar" on a document, and a set would call them equal.
     */
    private static List<String> tokens(String name) {
        if (name == null || name.isBlank()) {
            return List.of();
        }
        String cleaned = name.toUpperCase().replaceAll("[^A-Z ]", " ").trim();
        if (cleaned.isEmpty()) {
            return List.of();
        }
        return Arrays.stream(cleaned.split("\\s+")).filter(token -> !token.isBlank()).toList();
    }
}
