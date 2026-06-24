package com.khatiyan.d_modules.notice.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notice.model.Notice;

/**
 * Persistence access for property notices.
 *
 * <p>Queries are explicit because notice visibility depends on status and
 * time-window rules, not only simple column equality.
 */
@Repository
public interface NoticeRepository extends JpaRepository<Notice, UUID> {

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.id = :id
    """)
    Optional<Notice> findNoticeById(UUID id);

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.propertyId = :propertyId
          AND notice.status = com.khatiyan.d_modules.notice.model.NoticeStatus.PUBLISHED
        ORDER BY notice.publishedAt DESC
    """)
    List<Notice> findPublishedByPropertyId(UUID propertyId);

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.propertyId = :propertyId
          AND notice.status = com.khatiyan.d_modules.notice.model.NoticeStatus.PUBLISHED
          AND notice.id NOT IN (
            SELECT recurring.noticeId
            FROM RecurringNotice recurring
            WHERE recurring.propertyId = :propertyId
              AND recurring.noticeId IS NOT NULL
          )
        ORDER BY notice.publishedAt DESC
    """)
    List<Notice> findPublishedManualByPropertyId(UUID propertyId);

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.propertyId = :propertyId
          AND notice.status = com.khatiyan.d_modules.notice.model.NoticeStatus.PUBLISHED
          AND notice.visibleFrom <= :now
          AND (notice.visibleUntil IS NULL OR notice.visibleUntil >= :now)
        ORDER BY
          CASE notice.priority
            WHEN com.khatiyan.d_modules.notice.model.NoticePriority.EMERGENCY THEN 4
            WHEN com.khatiyan.d_modules.notice.model.NoticePriority.URGENT THEN 3
            WHEN com.khatiyan.d_modules.notice.model.NoticePriority.IMPORTANT THEN 2
            ELSE 1
          END DESC,
          notice.publishedAt DESC
    """)
    List<Notice> findVisibleByPropertyId(UUID propertyId, Instant now);

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.propertyId = :propertyId
          AND notice.status = com.khatiyan.d_modules.notice.model.NoticeStatus.PUBLISHED
          AND notice.id NOT IN (
            SELECT recurring.noticeId
            FROM RecurringNotice recurring
            WHERE recurring.propertyId = :propertyId
              AND recurring.noticeId IS NOT NULL
          )
          AND notice.visibleFrom <= :now
          AND (notice.visibleUntil IS NULL OR notice.visibleUntil >= :now)
        ORDER BY
          CASE notice.priority
            WHEN com.khatiyan.d_modules.notice.model.NoticePriority.EMERGENCY THEN 4
            WHEN com.khatiyan.d_modules.notice.model.NoticePriority.URGENT THEN 3
            WHEN com.khatiyan.d_modules.notice.model.NoticePriority.IMPORTANT THEN 2
            ELSE 1
          END DESC,
          notice.publishedAt DESC
    """)
    List<Notice> findVisibleManualByPropertyId(UUID propertyId, Instant now);

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.propertyId = :propertyId
          AND notice.status = com.khatiyan.d_modules.notice.model.NoticeStatus.ARCHIVED
        ORDER BY notice.archivedAt DESC, notice.updatedAt DESC
    """)
    List<Notice> findArchivedByPropertyId(UUID propertyId);

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.propertyId = :propertyId
          AND notice.status = com.khatiyan.d_modules.notice.model.NoticeStatus.ARCHIVED
          AND notice.id NOT IN (
            SELECT recurring.noticeId
            FROM RecurringNotice recurring
            WHERE recurring.propertyId = :propertyId
              AND recurring.noticeId IS NOT NULL
          )
        ORDER BY notice.archivedAt DESC, notice.updatedAt DESC
    """)
    List<Notice> findArchivedManualByPropertyId(UUID propertyId);

    @Query("""
        SELECT notice
        FROM Notice notice
        WHERE notice.status = com.khatiyan.d_modules.notice.model.NoticeStatus.PUBLISHED
          AND notice.visibleUntil IS NOT NULL
          AND notice.visibleUntil < :now
        ORDER BY notice.visibleUntil ASC
    """)
    List<Notice> findExpiredPublishedNotices(Instant now);
}
