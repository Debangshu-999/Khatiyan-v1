package com.khatiyan.d_modules.verification.provider;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.TreeSet;

import com.khatiyan.a_auth.model.Gender;

import tools.jackson.databind.JsonNode;

/**
 * Reads an Aadhaar App result in the shape Decentro documents.
 *
 * <p><b>Verified against their published example only.</b> The attributes are
 * known ({@code residentName}, {@code dob} as dd/MM/yyyy, {@code gender},
 * {@code address}, {@code maskedMobile}, {@code ageAbove18}); the envelope
 * around them is not. So the attributes are found wherever they sit rather than
 * at one fixed path, and the date and gender accept the formats their other
 * APIs use too. Tighten once a staging run shows a real body.
 *
 * <p><b>Only a final result is an outcome.</b> Decentro also posts a status
 * callback when a session is created (seen 2026-09-27, one second after
 * opening, before our own call had returned). Read as a result it failed the
 * attempt on the spot. Now: identity attributes present is a result, a clear
 * failure is a decline, and anything else (session created, expired, pending)
 * is not a result and changes nothing. An expired session is left to our own
 * expiry, which gives the tenant the attempt back.
 *
 * <p>Never reads the photograph ({@code residentImage}, a link), the address
 * (not part of verification, owner's decision 2026-09-27) or the enrolment
 * number: none is kept, so none is parsed.
 */
public final class AadhaarCredentialParser {

    private static final List<DateTimeFormatter> DOB_FORMATS = List.of(
            DateTimeFormatter.ofPattern("dd/MM/yyyy"),
            DateTimeFormatter.ofPattern("dd-MM-yyyy"),
            DateTimeFormatter.ISO_LOCAL_DATE);

    private AadhaarCredentialParser() {
    }

    /** Status words that end a session without a credential. EXPIRED is not one: our expiry handles that. */
    private static final List<String> FAILURE_STATUSES = List.of("FAILURE", "FAILED", "ERROR", "REJECTED", "DECLINED");
    private static final List<String> FAILURE_KEY_WORDS = List.of("fail", "error", "denied", "declin", "reject", "cancel");

    /** The result a callback carries, or empty when it is not a result (a status update). */
    public static Optional<CredentialOutcome> parse(JsonNode body) {
        String referenceId = firstText(body, "reference_id", "referenceId", "referenceID");
        JsonNode resident = findObjectWith(body, "residentName");

        if (resident == null) {
            return isFailure(body) ? Optional.of(CredentialOutcome.declined(referenceId, declineReason(body)))
                    : Optional.empty();
        }

        String name = text(resident, "residentName");
        if (referenceId == null) {
            referenceId = firstText(resident, "reference_id", "referenceId");
        }
        return Optional.of(new CredentialOutcome(
                name != null && !name.isBlank(),
                referenceId,
                name == null ? null : name.trim(),
                parseDob(text(resident, "dob")),
                parseGender(text(resident, "gender")),
                text(resident, "maskedMobile"),
                lastFour(resident),
                yesNo(firstText(resident, "ageAbove18", "age_above_18")),
                faceMatched(body),
                name == null || name.isBlank() ? "The Aadhaar App did not share a name" : null));
    }

    private static boolean isFailure(JsonNode body) {
        for (String status : allTexts(body, "status")) {
            if (FAILURE_STATUSES.contains(status.trim().toUpperCase(Locale.ROOT))) {
                return true;
            }
        }
        String key = firstText(body, "responseKey", "response_key");
        if (key != null) {
            String lower = key.toLowerCase(Locale.ROOT);
            return FAILURE_KEY_WORDS.stream().anyMatch(lower::contains);
        }
        return false;
    }

    /**
     * What a callback looked like, for the log: its field names and status
     * words, never a value that could be about a person.
     */
    public static String shapeOf(JsonNode body) {
        if (body == null || !body.isObject()) {
            return "not an object";
        }
        TreeSet<String> keys = new TreeSet<>(body.propertyNames());
        JsonNode data = body.get("data");
        if (data != null && data.isObject()) {
            data.propertyNames().forEach(key -> keys.add("data." + key));
        }
        return "keys=" + keys
                + " status=" + allTexts(body, "status")
                + " responseKey=" + firstText(body, "responseKey", "response_key")
                + " responseCode=" + firstText(body, "responseCode", "response_code");
    }

    /** Every text value under this key, depth first. */
    private static List<String> allTexts(JsonNode node, String key) {
        List<String> found = new ArrayList<>();
        collectTexts(node, key, found);
        return found;
    }

    private static void collectTexts(JsonNode node, String key, List<String> found) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return;
        }
        if (node.isObject()) {
            String value = text(node, key);
            if (value != null && !value.isBlank()) {
                found.add(value);
            }
        }
        for (JsonNode child : node) {
            collectTexts(child, key, found);
        }
    }

    static LocalDate parseDob(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        for (DateTimeFormatter format : DOB_FORMATS) {
            try {
                return LocalDate.parse(value.trim(), format);
            } catch (DateTimeParseException ignored) {
                // Try the next. A year alone (someone enrolled without a birth
                // certificate) parses to nothing, so the 18+ check fails
                // honestly instead of on a guessed day.
            }
        }
        return null;
    }

    static Gender parseGender(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return switch (value.trim().toUpperCase(Locale.ROOT)) {
            case "M", "MALE" -> Gender.MALE;
            case "F", "FEMALE" -> Gender.FEMALE;
            case "T", "TRANSGENDER", "THIRD GENDER" -> Gender.TRANSGENDER;
            default -> Gender.OTHER;
        };
    }

    private static String lastFour(JsonNode resident) {
        String masked = firstText(resident, "maskedAadhaar", "maskedAadhaarNumber", "aadhaarLastFour", "lastFourDigits");
        if (masked == null) {
            return null;
        }
        String digits = masked.replaceAll("[^0-9]", "");
        return digits.length() >= 4 ? digits.substring(digits.length() - 4) : null;
    }

    private static Boolean faceMatched(JsonNode body) {
        for (String key : List.of("faceMatch", "faceMatched", "faceAuthentication", "faceAuthenticationStatus",
                "face_authentication", "faceMatchResult")) {
            JsonNode holder = findObjectWith(body, key);
            if (holder != null) {
                Boolean value = yesNo(holder.get(key).asString(""));
                if (value != null) {
                    return value;
                }
            }
        }
        return null;
    }

    private static Boolean yesNo(String value) {
        if (value == null) {
            return null;
        }
        return switch (value.trim().toUpperCase(Locale.ROOT)) {
            case "YES", "Y", "TRUE", "SUCCESS", "PASS", "PASSED", "MATCH", "MATCHED" -> true;
            case "NO", "N", "FALSE", "FAILURE", "FAIL", "FAILED", "MISMATCH", "NOT_MATCHED" -> false;
            default -> null;
        };
    }

    private static String declineReason(JsonNode body) {
        String key = firstText(body, "responseKey", "response_key");
        if (key != null && key.toLowerCase(Locale.ROOT).contains("consent")) {
            return "You did not give consent in the Aadhaar App";
        }
        if (key != null && key.toLowerCase(Locale.ROOT).contains("face")) {
            return "The face check in the Aadhaar App did not pass";
        }
        return "The Aadhaar App did not share your details";
    }

    /** The first object, depth first, that has this key. */
    private static JsonNode findObjectWith(JsonNode node, String key) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        if (node.isObject() && node.has(key)) {
            return node;
        }
        for (JsonNode child : node) {
            JsonNode found = findObjectWith(child, key);
            if (found != null) {
                return found;
            }
        }
        return null;
    }

    private static String firstText(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode holder = findObjectWith(node, key);
            if (holder != null) {
                String value = text(holder, key);
                if (value != null && !value.isBlank()) {
                    return value;
                }
            }
        }
        return null;
    }

    private static String text(JsonNode node, String key) {
        JsonNode value = node == null ? null : node.get(key);
        if (value == null || value.isNull() || value.isMissingNode() || value.isContainer()) {
            return null;
        }
        return value.asString("");
    }
}
