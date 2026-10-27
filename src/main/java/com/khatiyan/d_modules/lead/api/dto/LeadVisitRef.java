package com.khatiyan.d_modules.lead.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitStatus;

/**
 * A lead's visit, in as much as the lead shows of it. The visit itself is read
 * and acted on from Manage Visits.
 *
 * @param slotStartMinute       minutes from midnight
 * @param stillInterestedUntil  for a missed visit: until when the visitor may
 *                              still say they are interested by moving it
 * @param movedFromDate         where its latest move took it from, with the
 *                              slot's start. Null for a visit never moved
 *                              (lead details, 2026-10-17)
 */
public record LeadVisitRef(
        UUID id,
        String referenceCode,
        UUID enquiryId,
        LocalDate visitDate,
        int slotStartMinute,
        int slotEndMinute,
        VisitStatus status,
        Instant checkedInAt,
        Instant stillInterestedUntil,
        LocalDate movedFromDate,
        Integer movedFromSlotStartMinute,
        Instant movedAt) {

    public static LeadVisitRef of(Visit visit) {
        return new LeadVisitRef(
                visit.getId(),
                visit.getReferenceCode(),
                visit.getEnquiryId(),
                visit.getVisitDate(),
                visit.getSlotStartMinute(),
                visit.getSlotEndMinute(),
                visit.getStatus(),
                visit.getCheckedInAt(),
                visit.getStatus() == VisitStatus.NOT_VISITED && visit.getNoVisitAt() != null
                        ? visit.getNoVisitAt().plus(Visit.STILL_INTERESTED_FOR)
                        : null,
                visit.getMovedFromDate(),
                visit.getMovedFromSlotStartMinute(),
                visit.getMovedAt());
    }
}
