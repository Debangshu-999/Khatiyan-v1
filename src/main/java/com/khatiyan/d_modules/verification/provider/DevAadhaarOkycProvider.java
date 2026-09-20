package com.khatiyan.d_modules.verification.provider;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.khatiyan.c_shared.exception.BusinessException;

/**
 * A provider that answers without anybody being billed.
 *
 * <p>The default until a vendor contract exists, and the one every test runs
 * against. It is not a mock: it enforces the same shapes the real provider
 * does — twelve digits in, six digits back, a ten-minute window — so the code
 * above it is exercised properly rather than merely satisfied.
 *
 * <p><b>Fixed rules, so a developer can steer it.</b> The code is always
 * {@code 123456}. An Aadhaar number ending {@code 0000} is treated as having no
 * linked mobile, which is the commonest real-world refusal and otherwise
 * impossible to reproduce. Everything else passes and comes back as the name
 * the tenancy already holds, so a happy path stays a happy path.
 */
public class DevAadhaarOkycProvider implements AadhaarOkycProvider {

    private static final Logger log = LoggerFactory.getLogger(DevAadhaarOkycProvider.class);

    /** The only code this provider accepts. */
    public static final String FIXED_OTP = "123456";

    /** Matches the ten-minute window the real providers document. */
    private static final int OTP_MINUTES = 10;

    /**
     * How many challenges to remember at once.
     *
     * <p>Small on purpose. This is a stub for one developer at a time, and an
     * unbounded map in a long-running process is a leak however dev-only it is.
     */
    private static final int REMEMBERED_CHALLENGES = 64;

    private final Clock clock;
    private final String name;

    /**
     * The last four digits of whatever number each challenge was started with.
     *
     * <p>Needed because the second call carries only the reference and the
     * code, never the number again — exactly like the real providers, who
     * return their own reference instead. Answering with a fixed fragment
     * looked harmless and was not: it stored a document fragment on the
     * tenancy that belonged to no document anybody had entered.
     */
    private final Map<String, String> lastFourByReference =
            Collections.synchronizedMap(new LinkedHashMap<>() {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
                    return size() > REMEMBERED_CHALLENGES;
                }
            });

    public DevAadhaarOkycProvider(Clock clock, String name) {
        this.clock = clock;
        this.name = name;
    }

    @Override
    public OtpChallenge startOtp(StartOtpCommand command) {
        requireTwelveDigits(command.aadhaarNumber());
        if (command.aadhaarNumber().endsWith("0000")) {
            // The commonest real refusal, and one no amount of correct code can
            // produce on demand against a live provider.
            throw new BusinessException(
                    "VERIFICATION_NO_LINKED_MOBILE",
                    "There is no mobile number linked to this Aadhaar. Update it at an Aadhaar centre and try again.");
        }

        lastFourByReference.put(
                command.reference(), command.aadhaarNumber().substring(command.aadhaarNumber().length() - 4));

        log.info("Dev OKYC challenge issued reference={} otp={}", command.reference(), FIXED_OTP);
        return new OtpChallenge(
                "dev_" + UUID.randomUUID(),
                command.aadhaarNumber().substring(8, 11),
                Instant.now(clock).plus(OTP_MINUTES, ChronoUnit.MINUTES));
    }

    @Override
    public OkycOutcome submitOtp(SubmitOtpCommand command) {
        if (!FIXED_OTP.equals(command.otp())) {
            return OkycOutcome.rejected("That code is not right. Check the message and try again.");
        }
        // The name is configurable so the PASSING path can be exercised
        // without naming a test tenant "DEV TEST USER". Whether it agrees with
        // the tenancy is still the caller's business, which is the behaviour
        // under test.
        //
        // No mobile hash. Producing one would mean knowing the share code and
        // the tenant's number, and a fake that always matched would hide the
        // one bug this check exists to catch.
        return OkycOutcome.verified(
                name,
                LocalDate.of(1995, 6, 15),
                lastFourByReference.remove(command.reference()),
                "12 Dev Street, Test Locality, Kolkata",
                "700001",
                null);
    }

    @Override
    public String name() {
        return "DEV";
    }

    private static void requireTwelveDigits(String aadhaarNumber) {
        if (aadhaarNumber == null || !aadhaarNumber.matches("^[0-9]{12}$")) {
            throw new BusinessException(
                    "VERIFICATION_BAD_AADHAAR", "Enter the 12 digits on your Aadhaar card.");
        }
    }
}
