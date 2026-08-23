package com.khatiyan.d_modules.chat.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.chat.model.ChatReadState;

@Repository
public interface ChatReadStateRepository extends JpaRepository<ChatReadState, UUID> {

    Optional<ChatReadState> findByThreadIdAndUserId(UUID threadId, UUID userId);

    /** Read positions for one person across a page of threads, to badge a list in one query. */
    List<ChatReadState> findByUserIdAndThreadIdIn(UUID userId, List<UUID> threadIds);

    /**
     * Every read position on a set of threads, for everyone.
     *
     * <p>Read receipts need the OTHER side's position, and on a team thread the
     * other side is several people. Fetching the lot in one query and grouping in
     * memory beats a correlated max per row; a thread has at most a handful of
     * readers.
     */
    List<ChatReadState> findByThreadIdIn(List<UUID> threadIds);
}
