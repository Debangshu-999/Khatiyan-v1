package com.khatiyan.d_modules.notice.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.notice.model.RecurringNoticeAttachment;

@Repository
public interface RecurringNoticeAttachmentRepository extends JpaRepository<RecurringNoticeAttachment, UUID> {

    List<RecurringNoticeAttachment> findByRecurringNoticeIdOrderBySortOrderAsc(UUID recurringNoticeId);

    /**
     * Used when a template's files are replaced wholesale.
     *
     * <p>Editing a template is a save of the whole form, so the simplest correct
     * thing is to clear and rewrite rather than diff. Days already generated keep
     * their copies either way.
     */
    void deleteByRecurringNoticeId(UUID recurringNoticeId);
}
