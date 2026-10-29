package com.khatiyan.d_modules.tenancy.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.khatiyan.d_modules.tenancy.model.MoveInChecklist;

public interface MoveInChecklistRepository extends JpaRepository<MoveInChecklist, UUID> {
}
