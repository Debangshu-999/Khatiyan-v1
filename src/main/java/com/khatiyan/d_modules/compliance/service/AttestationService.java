package com.khatiyan.d_modules.compliance.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.compliance.model.Attestation;
import com.khatiyan.d_modules.compliance.repository.AttestationRepository;

/**
 * Records declarations, and fingerprints them as it does.
 *
 * <p>The hash is the whole point of this class. A row saying somebody agreed is
 * only as good as the argument that the row has not been edited, and a bare
 * column cannot make that argument. A hash over every field can: recompute it
 * from the stored row, and a mismatch says the row moved after it was written.
 *
 * <p>That is detection, not prevention, and detection alone is answerable — the
 * same access that edits a row can recompute its hash. Two further things close
 * that gap, and only one of them lives here. The table refuses UPDATE and DELETE
 * outright. And these hashes are meant to be chained and published outside this
 * database on a schedule, so that a value which has already left our control
 * pins everything written before it. Until that anchoring exists, this is
 * tamper-EVIDENT and not yet tamper-proof, and it should not be described as
 * more than that.
 */
@Service
public class AttestationService {

    private static final Logger log = LoggerFactory.getLogger(AttestationService.class);

    /**
     * Separates fields inside the hashed string.
     *
     * <p>A unit separator rather than a comma or a newline, because it cannot
     * occur in any of the values. With an ordinary delimiter two different
     * records can serialise to the same bytes — a name ending in a comma and the
     * field after it shifting one place along — and two records with one hash is
     * exactly the ambiguity a forensic examination would seize on.
     */
    private static final char FIELD_SEPARATOR = '\u001F';

    private final AttestationRepository attestationRepository;

    public AttestationService(AttestationRepository attestationRepository) {
        this.attestationRepository = attestationRepository;
    }

    /**
     * Seals a declaration and writes it.
     *
     * <p>The caller builds the record; this computes the hash over what they
     * built and inserts it. There is no path that writes one of these without a
     * hash: {@link Attestation#seal} refuses a second call, the column is not
     * updatable, and this is the only caller.
     */
    @Transactional
    public Attestation record(Attestation attestation) {
        attestation.seal(hash(attestation));
        Attestation saved = attestationRepository.save(attestation);

        log.info("Attestation recorded id={} kind={} subjectId={} actorUserId={} hash={}",
                saved.getId(),
                saved.getKind(),
                saved.getSubjectId(),
                saved.getActorUserId(),
                saved.getRecordHash());

        return saved;
    }

    /**
     * Recomputes a stored record's hash and compares it.
     *
     * <p>The verification half of the pair. Written now rather than when it is
     * first needed: a hashing scheme with no verifier is a scheme nobody has
     * checked round-trips, and the day it matters is not the day to find out.
     */
    public boolean isIntact(Attestation attestation) {
        return hash(attestation).equals(attestation.getRecordHash());
    }

    /**
     * SHA-256 over a canonical rendering of every field.
     *
     * <p>Canonical means the same record always produces the same bytes.
     * Everything is written in a fixed order, nulls are written as an empty
     * field rather than skipped — skipping would let a record with a missing
     * value collide with a different record that has one — and the details map
     * is sorted by key, because a map's iteration order is not part of what was
     * declared.
     *
     * <p>Timestamps go in as epoch milliseconds, not as formatted text. A format
     * is a decision that can be revisited, and revisiting it would invalidate
     * every hash ever computed.
     */
    private String hash(Attestation attestation) {
        StringBuilder canonical = new StringBuilder();

        append(canonical, attestation.getId());
        append(canonical, attestation.getKind());
        append(canonical, attestation.getSubjectId());
        append(canonical, attestation.getActorUserId());
        append(canonical, attestation.getSessionJti());
        append(canonical, attestation.getOccurredAt());
        append(canonical, attestation.getClientIp());

        append(canonical, attestation.getDeviceBrand());
        append(canonical, attestation.getDeviceModel());
        append(canonical, attestation.getDeviceOsVersion());
        append(canonical, attestation.getDeviceOsBuild());
        append(canonical, attestation.getAppVersion());
        append(canonical, attestation.getAppInstallId());
        append(canonical, attestation.getPlatform());

        append(canonical, attestation.getStatementKey());
        append(canonical, String.valueOf(attestation.getStatementVersion()));
        append(canonical, attestation.getStatementText());
        append(canonical, attestation.getSubjectHash());

        canonical.append(canonicalDetails(attestation.getDetails()));

        append(canonical, String.valueOf(attestation.isOtpVerified()));
        append(canonical, attestation.getOtpVerifiedAt());
        append(canonical, attestation.getOtpChannel());
        append(canonical, attestation.getOtpDestination());

        return sha256(canonical.toString());
    }

    /**
     * The details map, flattened so that no two different maps can agree.
     *
     * <p>Its own method because this is where a collision would hide. Sorted by
     * key, since a map's iteration order is not part of what was declared. The
     * size goes in first, and each pair is written as key then value with the
     * field separator between — writing "key=value" instead would let
     * {@code {"ab":"c"}} and {@code {"a":"b=c"}} flatten identically.
     *
     * <p>Package-private so it can be tested on its own. The full record hash
     * cannot be compared across two records — every attestation carries a random
     * id, by design, so that two rows cannot swap identities — which would make
     * a collision test on the whole hash pass for the wrong reason.
     */
    static String canonicalDetails(Map<String, String> details) {
        StringBuilder canonical = new StringBuilder();
        Map<String, String> sorted = new TreeMap<>(details);

        append(canonical, String.valueOf(sorted.size()));
        sorted.forEach((key, value) -> {
            append(canonical, key);
            append(canonical, value);
        });

        return canonical.toString();
    }

    private static void append(StringBuilder canonical, Object value) {
        if (value instanceof Instant instant) {
            canonical.append(instant.toEpochMilli());
        } else if (value instanceof UUID id) {
            canonical.append(id);
        } else if (value != null) {
            canonical.append(value);
        }
        canonical.append(FIELD_SEPARATOR);
    }

    private static String sha256(String canonical) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            // Every JVM ships SHA-256; the checked exception is a formality.
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }
}
