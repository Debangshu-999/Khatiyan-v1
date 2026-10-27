package com.khatiyan.d_modules.booking.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingRequestAction;

@Repository
public interface BookingRequestActionRepository extends JpaRepository<BookingRequestAction, UUID> {

    /**
     * One request's history, oldest first. Two things done in one step carry
     * the same time, such as a request sent and given its turn, so the order
     * the database numbered them in breaks the tie.
     */
    List<BookingRequestAction> findByRequestIdOrderByOccurredAtAscSeqAsc(UUID requestId);
}
