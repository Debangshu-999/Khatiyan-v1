package com.khatiyan.d_modules.lead.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.lead.model.Lead;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.model.LeadStage;
import com.khatiyan.d_modules.lead.model.LeadState;

@Repository
public interface LeadRepository extends JpaRepository<Lead, UUID> {

    /** The open lead of someone recorded outside the app, at one property (2026-10-19). */
    java.util.Optional<Lead> findFirstByPropertyIdAndExternalProspectIdAndState(
            UUID propertyId, UUID externalProspectId, com.khatiyan.d_modules.lead.model.LeadState state);

    /** Their latest lead there, open or not, for a booking event that arrives after it closed. */
    java.util.Optional<Lead> findFirstByPropertyIdAndExternalProspectIdOrderByCreatedAtDesc(
            UUID propertyId, UUID externalProspectId);

    /**
     * What a record is to the owner, as {@code LeadKind.of} reads it, written
     * once more for the database: the list is filtered by it and the counts
     * grouped by it. The two are held together by a test.
     */
    String KIND = """
            CASE
                WHEN record.state = com.khatiyan.d_modules.lead.model.LeadState.OPEN
                    AND record.stage = com.khatiyan.d_modules.lead.model.LeadStage.ENQUIRED THEN 'ENQUIRY'
                WHEN record.state = com.khatiyan.d_modules.lead.model.LeadState.OPEN
                    AND record.stage = com.khatiyan.d_modules.lead.model.LeadStage.EARLY_LEAD THEN 'EARLY_LEAD'
                WHEN record.state = com.khatiyan.d_modules.lead.model.LeadState.OPEN
                    AND record.stage = com.khatiyan.d_modules.lead.model.LeadStage.ADVANCED_LEAD THEN 'ADVANCED_LEAD'
                WHEN record.state = com.khatiyan.d_modules.lead.model.LeadState.OPEN THEN 'BOOKED'
                WHEN record.closeReason = com.khatiyan.d_modules.lead.model.LeadCloseReason.CONVERTED THEN 'CONVERTED'
                WHEN record.becameLeadAt IS NOT NULL THEN 'DEAD'
                ELSE 'LOST_ENQUIRY'
            END""";

    /** The record still in play for one person at one property. At most one, by a partial unique index. */
    Optional<Lead> findByPropertyIdAndProspectUserIdAndState(UUID propertyId, UUID prospectUserId, LeadState state);

    /**
     * Duplicate, potential spam or neither, as {@code LeadRepeatFlag.of} reads
     * the count fixed on the record when it opened.
     */
    String REPEAT = """
            CASE
                WHEN record.earlierWalkaways >= """ + LeadRepeatFlag.POTENTIAL_SPAM_FROM + """
             THEN 'POTENTIAL_SPAM'
                WHEN record.earlierWalkaways > 0 THEN 'DUPLICATE'
                ELSE 'NONE'
            END""";

    /**
     * The person's ended records at this property, newest first. A new record
     * counts the ones since they last moved in: those that ended for their own
     * reason make it a repeat, else it resumes the latest. A person has a
     * handful here at most.
     */
    List<Lead> findByPropertyIdAndProspectUserIdAndStateOrderByClosedAtDesc(
            UUID propertyId, UUID prospectUserId, LeadState state);

    /** The record a person opened after this one ended, where they came back. */
    Optional<Lead> findFirstByResumedFromLeadIdOrderByCreatedAtAsc(UUID resumedFromLeadId);

    /**
     * A page of the property's records of the kinds asked for.
     *
     * @param kinds           {@code LeadKind} names. Every kind, for the whole list
     * @param resumedOnly     only records whose person came back
     * @param fewestWalkaways with at least this many earlier walkaways. Zero for every record
     * @param mostWalkaways   with at most this many. {@code Integer.MAX_VALUE} for every record
     * @param search          a lower-case LIKE pattern over the name and the
     *                        short code. Empty for every record
     * @param mineOnly        only the records the reader handles
     * @param readerId        who is reading, for {@code mineOnly}
     */
    @Query("""
            SELECT record
            FROM Lead record
            WHERE record.propertyId = :propertyId
              AND (""" + KIND + """
            ) IN :kinds
              AND (:resumedOnly = FALSE OR record.resumedFromLeadId IS NOT NULL OR record.reopenedAt IS NOT NULL)
              AND record.earlierWalkaways BETWEEN :fewestWalkaways AND :mostWalkaways
              AND (:search = '' OR lower(record.prospectName) LIKE :search
                   OR lower(record.referenceCode) LIKE :search)
              AND (:mineOnly = FALSE OR record.handlerUserId = :readerId)
            """)
    Page<Lead> pageByKinds(
            UUID propertyId, Collection<String> kinds, boolean resumedOnly, int fewestWalkaways, int mostWalkaways,
            String search, boolean mineOnly, UUID readerId, Pageable pageable);

    /** Every open lead of the property at these stages. What going cold is worked out over. */
    List<Lead> findByPropertyIdAndStateAndStageIn(UUID propertyId, LeadState state, Collection<LeadStage> stages);

    /** Every count the pipeline's header shows, in one grouped query. */
    @Query("""
            SELECT (""" + KIND + """
            ) AS kind,
                   CASE WHEN record.resumedFromLeadId IS NOT NULL OR record.reopenedAt IS NOT NULL
                        THEN TRUE ELSE FALSE END AS resumed,
                   (""" + REPEAT + """
            ) AS repeatFlag,
                   COUNT(record) AS total
            FROM Lead record
            WHERE record.propertyId = :propertyId
            GROUP BY 1, 2, 3
            """)
    List<KindCount> countByKind(UUID propertyId);

    /**
     * The leads that are in play: open, and past Enquired. What the hourly
     * sweep brings level. Ids only, so each is read afresh in its own turn.
     */
    @Query("""
            SELECT record.id AS id, record.enquiryId AS enquiryId, record.propertyId AS propertyId,
                   record.prospectUserId AS prospectUserId
            FROM Lead record
            WHERE record.state = com.khatiyan.d_modules.lead.model.LeadState.OPEN
              AND record.stage <> com.khatiyan.d_modules.lead.model.LeadStage.ENQUIRED
              AND record.enquiryId IS NOT NULL
            ORDER BY record.createdAt
            """)
    List<LeadToLevel> findOpenLeadsToLevel();

    /**
     * The records of these enquiries that are a duplicate or potential spam,
     * with how many earlier walkaways made them one. For the Enquiries screen.
     */
    @Query("""
            SELECT link.enquiryId AS enquiryId, record.earlierWalkaways AS walkaways
            FROM LeadEnquiry link
            JOIN Lead record ON record.id = link.leadId
            WHERE link.enquiryId IN :enquiryIds
              AND record.earlierWalkaways > 0
            """)
    List<EnquiryWalkaways> findRepeatsByEnquiryIds(Collection<UUID> enquiryIds);

    /** An enquiry and the earlier walkaways counted on its record, for {@link #findRepeatsByEnquiryIds}. */
    interface EnquiryWalkaways {
        UUID getEnquiryId();

        int getWalkaways();
    }

    /** What the sweep needs to prompt one lead: which enquiry, at which property, for whom. */
    interface LeadToLevel {
        UUID getId();

        UUID getEnquiryId();

        UUID getPropertyId();

        UUID getProspectUserId();
    }

    /**
     * How many records are of one kind, split by whether their person came
     * back and by their repeat mark, for {@link #countByKind}.
     */
    interface KindCount {
        String getKind();

        boolean getResumed();

        /** {@code LeadRepeatFlag} name, or {@code NONE}. */
        String getRepeatFlag();

        long getTotal();
    }
}
