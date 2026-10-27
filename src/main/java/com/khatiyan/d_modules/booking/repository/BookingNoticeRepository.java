package com.khatiyan.d_modules.booking.repository;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.booking.model.BookingNotice;

@Repository
public interface BookingNoticeRepository extends JpaRepository<BookingNotice, UUID> {

    boolean existsByRequestIdAndKindAndNoticeDate(UUID requestId, BookingNotice.Kind kind, LocalDate noticeDate);

    /** For a telling that happens once ever, whatever the day. */
    boolean existsByRequestIdAndKind(UUID requestId, BookingNotice.Kind kind);
}
