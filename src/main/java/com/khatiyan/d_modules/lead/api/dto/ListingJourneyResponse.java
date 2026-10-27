package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Everything on the Leads insights screen, for one period (2026-10-18).
 *
 * <p><b>The funnel follows the same people</b>: everyone who opened the profile
 * in the period, each counted once at the furthest step they reached. Getting
 * in touch counts when it happens within 30 days of their first open in the
 * period; after that their lead ties the visit, booking and move-in to them
 * however long it takes. A later step is never larger than the one before it.
 *
 * <p><b>The activity counts everything that happened in the period</b>, whoever
 * it was: the lead module's pipeline read, for the same dates.
 *
 * @param dataSince   when the property joined: where "All time" starts and the earliest a custom range can
 *                    usefully begin
 * @param steps       OPENED, GOT_IN_TOUCH, ANSWERED, VISITED, BOOKED, MOVED_IN, in that order
 * @param biggestDrop the step that loses the most people, null with nobody in the funnel
 * @param actions     what the people who opened it did
 * @param activity    the pipeline read for these dates
 */
public record ListingJourneyResponse(
        String period,
        LocalDate from,
        LocalDate to,
        LocalDate dataSince,
        List<Step> steps,
        BiggestDrop biggestDrop,
        Actions actions,
        ProfileTime profileTime,
        Rates rates,
        LeadFunnelResponse activity,
        Charts charts) {

    /**
     * The graphs on the screen (2026-10-18). Every series is for the same
     * period as the rest, and leaves out the owner's and managers' own views.
     *
     * @param overTime        people who opened, and who got in touch, per day; per week for 90 days
     * @param whenTheyLook    views by weekday (1 Monday to 7 Sunday) and quarter of the day (0 is midnight to 6)
     * @param timeSpent       views by how long they stayed: UNDER_10S, UNDER_30S, UNDER_1M, UNDER_3M, LONGER
     * @param foundFrom       views by where the profile was opened from
     * @param answerSpeed     enquiries answered, by how fast: UNDER_1H, UNDER_6H, UNDER_24H, LONGER
     * @param visitOutcomes   visits attended, missed and cancelled in the period
     */
    public record Charts(
            String bucket,
            List<OverTime> overTime,
            List<HeatCell> whenTheyLook,
            List<Bucket> timeSpent,
            List<Bucket> foundFrom,
            List<Bucket> answerSpeed,
            VisitOutcomes visitOutcomes) {
    }

    /** One day or week, from its first date. */
    public record OverTime(LocalDate from, long opened, long gotInTouch) {
    }

    public record HeatCell(int weekday, int quarter, long views) {
    }

    public record Bucket(String key, long count) {
    }

    public record VisitOutcomes(long attended, long missed, long cancelled) {
    }

    public record Step(String key, long people) {
    }

    /** From one step to the next: how many did not go on, and what share of the first. */
    public record BiggestDrop(String fromStep, String toStep, long lost, int percent) {
    }

    /**
     * What the people who opened the profile did there, within 30 days.
     *
     * @param byFurthest each person once, by the furthest thing they did: BOOKING_REQUESTED,
     *                   VISIT_SCHEDULED, ENQUIRED, CALLED, NONE. Adds up to the people who opened
     * @param individual everyone who did each, so one person can count twice. No NONE
     */
    public record Actions(long opened, long acted, List<ActionCount> byFurthest, List<ActionCount> individual) {
    }

    public record ActionCount(String action, long people) {
    }

    /**
     * What people did on the profile in the period, counted in views.
     *
     * @param viewsWithLength views whose close arrived, which the times are worked out from
     * @param quickExitPercent left within 10 seconds
     * @param readPercent      stayed 30 seconds or more
     * @param cameBack         people who opened it on two or more days
     */
    public record ProfileTime(
            long views,
            long people,
            long viewsWithLength,
            Long medianSeconds,
            Integer quickExitPercent,
            Integer readPercent,
            long cameBack) {
    }

    /**
     * Over the enquiries raised in the period. Visits and bookings made
     * straight from the profile, with no enquiry, are left out of the response
     * figures: nobody had to answer them.
     *
     * @param dropAfterAnswerPercent answered, then closed without ever visiting
     */
    public record Rates(
            long enquiries,
            Integer responseRatePercent,
            Long medianResponseSeconds,
            Integer dropAfterAnswerPercent,
            Integer enquiryToMoveInPercent) {
    }

    public static final List<String> STEP_KEYS =
            List.of("OPENED", "GOT_IN_TOUCH", "ANSWERED", "VISITED", "BOOKED", "MOVED_IN");

    /** Strongest first: a person who did several is shown under the first of these they did. */
    public static final List<String> ACTIONS =
            List.of("BOOKING_REQUESTED", "VISIT_SCHEDULED", "ENQUIRED", "CALLED");
}
