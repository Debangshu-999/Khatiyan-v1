package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import com.khatiyan.d_modules.lead.model.Visit;
import com.khatiyan.d_modules.lead.model.VisitBookedBy;
import com.khatiyan.d_modules.lead.model.VisitStatus;

/**
 * A visit, as one of the two sides reads it.
 *
 * @param upcoming              whether it is still to happen. False once its date has passed
 * @param missed                whether its date passed without them coming
 * @param tenantReschedulesLeft how many more times the prospect may move it themselves
 * @param canReschedule         whether the person asking may move it now: before its day, or
 *                              after it was missed, and never on the day
 * @param rescheduleRefusal     why not, in words to show them. Null when they may
 * @param version               sent as If-Match when moving it
 */
public record VisitResponse(
        UUID id,
        String referenceCode,
        UUID leadId,
        UUID enquiryId,
        LocalDate date,
        LocalTime slotStart,
        LocalTime slotEnd,
        VisitStatus status,
        VisitBookedBy bookedBy,
        boolean upcoming,
        boolean missed,
        int tenantReschedulesLeft,
        boolean canReschedule,
        String rescheduleRefusal,
        long version) {

    /**
     * @param rescheduleRefusal why the person asking may not move it, in words
     *                          to show them. Null when they may
     */
    public static VisitResponse of(Visit visit, LocalDate today, String rescheduleRefusal) {
        return new VisitResponse(
                visit.getId(),
                visit.getReferenceCode(),
                visit.getLeadId(),
                visit.getEnquiryId(),
                visit.getVisitDate(),
                visit.getSlotStart(),
                visit.getSlotEnd(),
                visit.getStatus(),
                visit.getBookedBy(),
                visit.isUpcoming(today),
                visit.isMissed(today),
                visit.tenantReschedulesLeft(),
                rescheduleRefusal == null,
                rescheduleRefusal,
                visit.getVersion());
    }
}
