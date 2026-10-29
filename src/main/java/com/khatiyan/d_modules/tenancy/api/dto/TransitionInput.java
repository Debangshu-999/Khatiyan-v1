package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * What an existing tenant brings from before Khatiyan (P1.1, 2026-10-28).
 *
 * <p>The stay itself starts on its first Khatiyan bill. These keep the rest:
 * when they really moved in, what they owed at the switch, and the photos of
 * their paper agreement when it carries over instead of a deed signed in the
 * app. The deposit already held travels as the stay's own deposit.
 *
 * @param movedInOn               the day they moved in, before the first bill
 * @param openingDuesPaise        owed at the switch, or null; raised as an
 *                                opening one-off bill when billing starts
 * @param openingDuesNote         what the dues were for, or null
 * @param paperAgreementPhotoUrls the paper agreement's photos, or null when a
 *                                deed is signed in the app instead
 * @param verifiedBefore          the owner declared their identity was verified
 *                                before Khatiyan, instead of a check now
 */
public record TransitionInput(
        LocalDate movedInOn,
        Long openingDuesPaise,
        String openingDuesNote,
        List<String> paperAgreementPhotoUrls,
        boolean verifiedBefore) {

    public boolean agreementOnPaper() {
        return paperAgreementPhotoUrls != null && !paperAgreementPhotoUrls.isEmpty();
    }
}
