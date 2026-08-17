package com.khatiyan.d_modules.notice.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notice.model.NoticeAttachment;

@Repository
public interface NoticeAttachmentRepository extends JpaRepository<NoticeAttachment, UUID> {

    List<NoticeAttachment> findByNoticeIdOrderBySortOrderAsc(UUID noticeId);

    Optional<NoticeAttachment> findByIdAndNoticeId(UUID id, UUID noticeId);

    int countByNoticeId(UUID noticeId);

    /**
     * Attachments for several notices at once.
     *
     * <p>A notice list renders every row's attachments; fetching them per notice
     * is the N+1 this avoids.
     */
    @Query("""
            select attachment
            from NoticeAttachment attachment
            where attachment.noticeId in :noticeIds
            order by attachment.noticeId, attachment.sortOrder asc
            """)
    List<NoticeAttachment> findAllByNoticeIds(@Param("noticeIds") Collection<UUID> noticeIds);
}
