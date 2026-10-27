package com.khatiyan.d_modules.lead.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse.DeadLeads;
import com.khatiyan.d_modules.lead.api.dto.LeadFunnelResponse.LostEnquiries;
import com.khatiyan.d_modules.lead.model.LeadActivityType;
import com.khatiyan.d_modules.lead.model.LeadCloseReason;
import com.khatiyan.d_modules.lead.model.LeadStage;

/**
 * The month's numbers, in three grouped queries whatever the property's size.
 *
 * <p>Steps are counted off the timeline, where each is written once at the
 * moment it happened. Endings and returns are counted off the records.
 * Duplicates and potential spam are left out of all three, so one person who
 * keeps coming back is counted once (user, 2026-10-17).
 */
@Component
class LeadFunnelReader {

    /** Not a duplicate or potential spam. The old spam and duplicate closes stay out too. */
    private static final String NOT_A_REPEAT = "record.earlier_walkaways = 0"
            + " AND (record.close_reason IS NULL OR record.close_reason NOT IN ('SPAM', 'DUPLICATE'))";

    private final JdbcTemplate jdbc;

    LeadFunnelReader(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** How many times each step happened at the property from {@code since} up to {@code until}. */
    Map<LeadActivityType, Long> steps(UUID propertyId, Instant since, Instant until) {
        Map<LeadActivityType, Long> steps = new EnumMap<>(LeadActivityType.class);
        jdbc.query("""
                SELECT activity.type, COUNT(*)
                FROM lead.lead_activities activity
                JOIN lead.leads record ON record.id = activity.lead_id
                WHERE record.property_id = ?
                  AND activity.occurred_at >= ? AND activity.occurred_at < ?
                  AND\s""" + NOT_A_REPEAT + """

                GROUP BY activity.type
                """, row -> {
                    steps.put(LeadActivityType.valueOf(row.getString(1)), row.getLong(2));
                }, propertyId, Timestamp.from(since), Timestamp.from(until));
        return steps;
    }

    /**
     * The month's first responses and how quickly they came, and who came back.
     *
     * @param answered      records first reached in the month
     * @param medianSeconds null when none was
     */
    record Returns(long answered, Long medianSeconds, Long p90Seconds, long resumed, long resumedConverted) {
    }

    Returns returns(UUID propertyId, Instant since, Instant until) {
        Timestamp from = Timestamp.from(since);
        Timestamp to = Timestamp.from(until);
        // Came back in the month: a new record opened after an earlier one, or the same record opened again.
        String cameBack = "((record.resumed_from_lead_id IS NOT NULL AND record.created_at >= ? AND record.created_at < ?)"
                + " OR (record.reopened_at >= ? AND record.reopened_at < ?))";
        String answered = "record.responded_at >= ? AND record.responded_at < ? AND record.enquired_at IS NOT NULL";
        String waited = "EXTRACT(EPOCH FROM (record.responded_at - record.enquired_at))";
        return jdbc.queryForObject("""
                SELECT
                    COUNT(*) FILTER (WHERE %2$s),
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY %1$s) FILTER (WHERE %2$s),
                    percentile_cont(0.9) WITHIN GROUP (ORDER BY %1$s) FILTER (WHERE %2$s),
                    COUNT(*) FILTER (WHERE %3$s),
                    COUNT(*) FILTER (WHERE %3$s AND record.close_reason = 'CONVERTED')
                FROM lead.leads record
                WHERE record.property_id = ? AND %4$s
                """.formatted(waited, answered, cameBack, NOT_A_REPEAT),
                (row, at) -> new Returns(
                        row.getLong(1), seconds(row.getObject(2)), seconds(row.getObject(3)), row.getLong(4),
                        row.getLong(5)),
                from, to, from, to, from, to, from, to, from, to, from, to, from, to, propertyId);
    }

    /** The month's endings: dead leads by the stage they died at and why, and lost enquiries by why. */
    record Endings(List<DeadLeads> deadLeads, List<LostEnquiries> lostEnquiries) {
    }

    Endings endings(UUID propertyId, Instant since, Instant until) {
        List<DeadLeads> dead = new ArrayList<>();
        List<LostEnquiries> lost = new ArrayList<>();
        jdbc.query("""
                SELECT record.stage, record.close_reason, record.became_lead_at IS NOT NULL, COUNT(*)
                FROM lead.leads record
                WHERE record.property_id = ?
                  AND record.state = 'CLOSED'
                  AND record.closed_at >= ? AND record.closed_at < ?
                  AND record.close_reason NOT IN ('CONVERTED', 'SPAM', 'DUPLICATE')
                  AND record.earlier_walkaways = 0
                GROUP BY 1, 2, 3
                ORDER BY 4 DESC, 1, 2
                """, row -> {
                    LeadCloseReason reason = LeadCloseReason.valueOf(row.getString(2));
                    if (row.getBoolean(3)) {
                        dead.add(new DeadLeads(LeadStage.valueOf(row.getString(1)), reason, row.getLong(4)));
                    } else {
                        // Never a lead, so it never left Enquired: one line per reason.
                        lost.add(new LostEnquiries(reason, row.getLong(4)));
                    }
                }, propertyId, Timestamp.from(since), Timestamp.from(until));
        return new Endings(dead, lost);
    }

    private static Long seconds(Object value) {
        return value == null ? null : Math.round(((Number) value).doubleValue());
    }
}
