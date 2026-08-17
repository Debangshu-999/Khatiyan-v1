package com.khatiyan.d_modules.enquiry.model;

/**
 * Where an enquiry sits.
 *
 * <p>Only {@code NEW} is enforced anywhere: the partial unique index that keeps
 * one open enquiry per person per property is keyed on it, so an enquirer can
 * ask again once they have been answered but not before.
 */
public enum EnquiryStatus {
    NEW,
    RESPONDED
}
