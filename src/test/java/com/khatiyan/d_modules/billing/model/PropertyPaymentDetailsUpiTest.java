package com.khatiyan.d_modules.billing.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.khatiyan.c_shared.exception.ValidationException;

/**
 * The four UPI details (QR, address, phone, receiver name) are all or none.
 */
class PropertyPaymentDetailsUpiTest {

    private static final UUID ACTOR = UUID.randomUUID();
    private static final String QR = "https://res.cloudinary.com/demo/image/upload/qr.png";

    private PropertyPaymentDetails details() {
        return PropertyPaymentDetails.empty(UUID.randomUUID());
    }

    @Test
    @DisplayName("all four UPI details save together")
    void allFourSave() {
        PropertyPaymentDetails details = details();

        details.update("owner@okbank", "Asha Roy", "9876543210", QR, null, null, null, ACTOR);

        assertThat(details.getUpiVpa()).isEqualTo("owner@okbank");
        assertThat(details.getPayeeName()).isEqualTo("Asha Roy");
        assertThat(details.getUpiQrImageUrl()).isEqualTo(QR);
    }

    @Test
    @DisplayName("none of them is fine, for a property collecting offline")
    void noneIsFine() {
        assertThatCode(() -> details().update(null, " ", "", null, null, null, null, ACTOR))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a partial set is refused, whichever one is missing")
    void partialSetRefused() {
        assertThatThrownBy(() -> details().update("owner@okbank", "Asha Roy", "9876543210", null, null, null, null, ACTOR))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("together");
        assertThatThrownBy(() -> details().update(null, "Asha Roy", "9876543210", QR, null, null, null, ACTOR))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> details().update("owner@okbank", null, "9876543210", QR, null, null, null, ACTOR))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> details().update("owner@okbank", "Asha Roy", null, QR, null, null, null, ACTOR))
                .isInstanceOf(ValidationException.class);
    }
}
