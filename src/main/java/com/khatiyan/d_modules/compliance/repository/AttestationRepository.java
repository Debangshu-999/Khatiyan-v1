package com.khatiyan.d_modules.compliance.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.compliance.model.Attestation;

/**
 * Reads and inserts. There is no update path, and adding one would be defeated
 * by the table's own trigger — see V6103.
 */
@Repository
public interface AttestationRepository extends JpaRepository<Attestation, UUID> {

    /** Every declaration made about one tenancy, newest first. */
    List<Attestation> findBySubjectIdOrderByOccurredAtDesc(UUID subjectId);

    List<Attestation> findBySubjectIdAndKindOrderByOccurredAtDesc(UUID subjectId, String kind);
}
