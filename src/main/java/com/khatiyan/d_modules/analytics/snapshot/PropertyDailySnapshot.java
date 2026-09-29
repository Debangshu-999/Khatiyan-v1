package com.khatiyan.d_modules.analytics.snapshot;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** One property's end-of-day state. {@code snapshotDate} is the IST day it describes. */
public record PropertyDailySnapshot(
        UUID propertyId,
        LocalDate snapshotDate,
        int totalBeds,
        int occupiedBeds,
        int reservedBeds,
        int unavailableBeds,
        int activeMonthlyStays,
        int activeDailyStays,
        long duesOutstandingPaise,
        long duesOverduePaise,
        long depositsHeldPaise,
        Instant capturedAt) {}
