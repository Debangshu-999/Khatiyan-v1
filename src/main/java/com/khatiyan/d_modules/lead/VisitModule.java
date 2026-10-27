package com.khatiyan.d_modules.lead;

import java.time.Clock;
import java.time.ZoneId;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.khatiyan.d_modules.lead.api.dto.VisitAttentionSummary;
import com.khatiyan.d_modules.lead.repository.VisitRepository;

/** Read-only visit facts for other modules. No attendance or assignment is changed by these reads. */
@Service
public class VisitModule {
    private final VisitRepository visits;
    private final Clock clock;

    public VisitModule(VisitRepository visits, Clock clock) {
        this.visits = visits;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public VisitAttentionSummary attentionForProperty(UUID propertyId) {
        var now = clock.instant().atZone(ZoneId.of("Asia/Kolkata"));
        var counts = visits.countAttention(propertyId, now.toLocalDate(), now.getHour() * 60 + now.getMinute());
        return new VisitAttentionSummary(counts.getArrivalsToday(), counts.getAttendanceOverdue());
    }
}
