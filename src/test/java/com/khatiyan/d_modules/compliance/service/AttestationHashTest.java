package com.khatiyan.d_modules.compliance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.khatiyan.d_modules.compliance.model.Attestation;
import com.khatiyan.d_modules.compliance.model.AttestationKind;
import com.khatiyan.d_modules.compliance.model.DeviceFingerprint;
import com.khatiyan.d_modules.compliance.model.LegalStatement;
import com.khatiyan.d_modules.compliance.repository.AttestationRepository;

/**
 * The hash is the argument these records make. If it does not round-trip, or if
 * two different declarations can produce the same value, the argument fails at
 * the one moment it is needed — so it is checked here rather than assumed.
 */
@ExtendWith(MockitoExtension.class)
class AttestationHashTest {

    private static final UUID SUBJECT = UUID.randomUUID();
    private static final UUID ACTOR = UUID.randomUUID();
    private static final Instant WHEN = Instant.parse("2026-08-28T10:15:30Z");

    @Mock
    private AttestationRepository attestationRepository;

    private AttestationService attestationService;

    @BeforeEach
    void setUp() {
        attestationService = new AttestationService(attestationRepository);
    }

    @Test
    void aRecordedDeclarationVerifiesAgainstItsOwnHash() {
        when(attestationRepository.save(any(Attestation.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Attestation saved = attestationService.record(declaration(Map.of("idLastFour", "4417")));

        assertThat(saved.getRecordHash()).isNotBlank();
        assertThat(attestationService.isIntact(saved)).isTrue();
    }

    @Test
    void twoDetailMapsThatDifferOnlyInWhereAFieldBoundaryFallsFlattenDifferently() {
        // The collision an ordinary delimiter would allow: "ab"/"c" and
        // "a"/"b=c" join to the same string under "key=value". A separator that
        // cannot occur in the values is what rules it out, and this is the test
        // that fails if someone simplifies it to a comma or an equals sign.
        assertThat(AttestationService.canonicalDetails(Map.of("ab", "c")))
                .isNotEqualTo(AttestationService.canonicalDetails(Map.of("a", "b=c")));
    }

    @Test
    void detailOrderDoesNotChangeTheFlattenedForm() {
        // A map's iteration order is not part of what was declared, so the same
        // particulars must flatten the same way however the map was built.
        assertThat(AttestationService.canonicalDetails(
                        new LinkedHashMap<>(Map.of("idDocumentType", "PASSPORT", "idLastFour", "4417"))))
                .isEqualTo(AttestationService.canonicalDetails(
                        new LinkedHashMap<>(Map.of("idLastFour", "4417", "idDocumentType", "PASSPORT"))));
    }

    @Test
    void anAbsentDetailIsNotTheSameAsAnEmptyOne() {
        assertThat(AttestationService.canonicalDetails(Map.of()))
                .isNotEqualTo(AttestationService.canonicalDetails(Map.of("idLastFour", "")));
    }

    @Test
    void aRecordIsSealedOnceAndOnce() {
        Attestation attestation = declaration(Map.of());
        attestation.seal("first");

        assertThatThrownBy(() -> attestation.seal("second"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sealed once");
    }

    private static Attestation declaration(Map<String, String> details) {
        return Attestation.builder()
                .kind(AttestationKind.TENANT_ID_DECLARATION)
                .subjectId(SUBJECT)
                .actorUserId(ACTOR)
                .occurredAt(WHEN)
                .clientIp("203.0.113.7")
                .device(new DeviceFingerprint("Google", "Pixel 8", "14", "UP1A", "1.2.0", "install-1", "phone"))
                .statement(LegalStatement.TENANT_ID_DECLARATION)
                .details(details)
                .build();
    }
}
