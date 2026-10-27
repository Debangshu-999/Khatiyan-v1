package com.khatiyan.d_modules.booking.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingToken;

@Repository
public interface BookingTokenRepository extends JpaRepository<BookingToken, UUID> {

    long countByPropertyIdAndStatus(UUID propertyId, com.khatiyan.d_modules.booking.model.BookingTokenStatus status);

    /**
     * A booking's token. Every write to it first holds the booking's own row,
     * so this needs no lock of its own.
     */
    Optional<BookingToken> findByRequestId(UUID requestId);

    /**
     * A page of the tokens a property has received, newest first, each with
     * its booking. Narrowed here, so the count and the pages are of what was
     * asked for and never of one fetched page.
     *
     * @param statuses what became of the token. Never empty: every status a
     *                 received token can have, where no one status is asked for
     * @param search   {@code ''} for no search, else a lower-case LIKE pattern
     *                 for the token's own code and its booking's
     */
    @Query(value = """
            SELECT token, request FROM BookingToken token
            JOIN BookingRequest request ON request.id = token.requestId
            WHERE token.propertyId = :propertyId AND token.receivedAt IS NOT NULL
              AND token.status IN :statuses
              AND (:search = '' OR lower(token.receiptCode) LIKE :search
                   OR lower(request.referenceCode) LIKE :search)
            ORDER BY token.receivedAt DESC, token.id DESC
            """,
            countQuery = """
            SELECT count(token) FROM BookingToken token
            JOIN BookingRequest request ON request.id = token.requestId
            WHERE token.propertyId = :propertyId AND token.receivedAt IS NOT NULL
              AND token.status IN :statuses
              AND (:search = '' OR lower(token.receiptCode) LIKE :search
                   OR lower(request.referenceCode) LIKE :search)
            """)
    org.springframework.data.domain.Page<Object[]> pageReceivedForProperty(
            @Param("propertyId") UUID propertyId,
            @Param("statuses") java.util.Collection<com.khatiyan.d_modules.booking.model.BookingTokenStatus> statuses,
            @Param("search") String search, org.springframework.data.domain.Pageable pageable);

    /** How many tokens a property has received and how much, by what became of them. */
    @Query("""
            SELECT token.status, count(token), sum(token.amountPaise) FROM BookingToken token
            WHERE token.propertyId = :propertyId AND token.receivedAt IS NOT NULL
            GROUP BY token.status
            """)
    java.util.List<Object[]> sumReceivedByStatus(@Param("propertyId") UUID propertyId);
}
