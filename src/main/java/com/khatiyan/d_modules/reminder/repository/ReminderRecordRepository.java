package com.khatiyan.d_modules.reminder.repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.khatiyan.d_modules.reminder.model.ReminderRecord;
import com.khatiyan.d_modules.reminder.model.ReminderStatus;

@Repository
public interface ReminderRecordRepository extends JpaRepository<ReminderRecord, UUID> {

    @Query("""
        SELECT reminder
        FROM ReminderRecord reminder
        WHERE reminder.reminderKey = :reminderKey
        """)
    Optional<ReminderRecord> findByReminderKey(String reminderKey);

    @Query("""
        SELECT reminder
        FROM ReminderRecord reminder
        WHERE reminder.status = :status
          AND reminder.scheduledForDate <= :today
        ORDER BY reminder.scheduledForDate ASC, reminder.createdAt ASC
        """)
    List<ReminderRecord> findDueByStatus(ReminderStatus status, LocalDate today, Pageable pageable);
}
