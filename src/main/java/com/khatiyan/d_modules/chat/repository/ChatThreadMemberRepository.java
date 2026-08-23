package com.khatiyan.d_modules.chat.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.chat.model.ChatThreadMember;

@Repository
public interface ChatThreadMemberRepository extends JpaRepository<ChatThreadMember, UUID> {

    List<ChatThreadMember> findByThreadId(UUID threadId);

    List<ChatThreadMember> findByThreadIdIn(List<UUID> threadIds);

    boolean existsByThreadIdAndUserId(UUID threadId, UUID userId);
}
