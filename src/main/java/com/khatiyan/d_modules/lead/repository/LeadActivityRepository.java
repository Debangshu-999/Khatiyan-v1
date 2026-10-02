package com.khatiyan.d_modules.lead.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.lead.model.LeadActivity;

@Repository
public interface LeadActivityRepository extends JpaRepository<LeadActivity, UUID> {

    /** One lead's timeline, newest first. */
    List<LeadActivity> findByLeadIdOrderByOccurredAtDescCreatedAtDesc(UUID leadId);
}
