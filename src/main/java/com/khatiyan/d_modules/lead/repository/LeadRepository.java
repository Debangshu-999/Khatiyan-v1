package com.khatiyan.d_modules.lead.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;

@Repository
public interface LeadRepository extends JpaRepository<Lead, UUID> {

    /** The record still in play for one person at one property. At most one, by a partial unique index. */
    Optional<Lead> findByPropertyIdAndProspectUserIdAndState(UUID propertyId, UUID prospectUserId, LeadState state);

    // The property's list, with each optional filter as its own query. One
    // query with "or the filter is null" would hand the database an untyped
    // null, and would stop it using the (property, state, stage) index.

    Page<Lead> findByPropertyId(UUID propertyId, Pageable pageable);

    Page<Lead> findByPropertyIdAndState(UUID propertyId, LeadState state, Pageable pageable);

    Page<Lead> findByPropertyIdAndStage(UUID propertyId, LeadStage stage, Pageable pageable);

    Page<Lead> findByPropertyIdAndStateAndStage(UUID propertyId, LeadState state, LeadStage stage, Pageable pageable);

    /** Every count the pipeline's header shows, in one grouped query. */
    @Query("""
            SELECT record.stage AS stage, record.state AS state, COUNT(record) AS total
            FROM Lead record
            WHERE record.propertyId = :propertyId
            GROUP BY record.stage, record.state
            """)
    List<StageCount> countByStageAndState(UUID propertyId);

    /** How many records sit at one stage in one state, for {@link #countByStageAndState}. */
    interface StageCount {
        LeadStage getStage();

        LeadState getState();

        long getTotal();
    }
}
