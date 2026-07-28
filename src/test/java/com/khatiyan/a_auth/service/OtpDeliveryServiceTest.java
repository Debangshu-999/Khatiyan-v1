package com.khatiyan.a_auth.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.a_auth.model.OtpDeliveryChannel;
import com.khatiyan.a_auth.model.OtpDeliveryProviderType;
import com.khatiyan.a_auth.model.OtpPurpose;

class OtpDeliveryServiceTest {

    @Test
    void emailChannelSendsOtpToEmailRecipientOnly() {
        OtpDeliveryProvider smsProvider = provider(OtpDeliveryProviderType.SMS);
        OtpDeliveryProvider emailProvider = provider(OtpDeliveryProviderType.EMAIL);
        OtpDeliveryService service = new OtpDeliveryService(
                List.of(smsProvider, emailProvider), new AsyncOtpDelivery(List.of(smsProvider, emailProvider)));

        service.deliverOtp("+919007433360", "tenant@example.com", "123456", OtpPurpose.PIN_RESET, OtpDeliveryChannel.EMAIL);

        verify(emailProvider).sendOtp("tenant@example.com", "123456", OtpPurpose.PIN_RESET);
        verify(smsProvider, never()).sendOtp("+919007433360", "123456", OtpPurpose.PIN_RESET);
    }

    @Test
    void smsAndEmailSendsSmsAndBestEffortEmail() {
        OtpDeliveryProvider smsProvider = provider(OtpDeliveryProviderType.SMS);
        OtpDeliveryProvider emailProvider = provider(OtpDeliveryProviderType.EMAIL);
        OtpDeliveryService service = new OtpDeliveryService(
                List.of(smsProvider, emailProvider), new AsyncOtpDelivery(List.of(smsProvider, emailProvider)));

        service.deliverOtp("+919007433360", "tenant@example.com", "123456", OtpPurpose.LOGIN, OtpDeliveryChannel.SMS_AND_EMAIL);

        verify(smsProvider).sendOtp("+919007433360", "123456", OtpPurpose.LOGIN);
        verify(emailProvider).sendOtp("tenant@example.com", "123456", OtpPurpose.LOGIN);
    }

    @Test
    void smsAndEmailDoesNotFailWhenEmailDeliveryFails() {
        OtpDeliveryProvider smsProvider = provider(OtpDeliveryProviderType.SMS);
        OtpDeliveryProvider emailProvider = provider(OtpDeliveryProviderType.EMAIL);
        doThrow(new RuntimeException("smtp down")).when(emailProvider).sendOtp("tenant@example.com", "123456", OtpPurpose.LOGIN);
        OtpDeliveryService service = new OtpDeliveryService(
                List.of(smsProvider, emailProvider), new AsyncOtpDelivery(List.of(smsProvider, emailProvider)));

        service.deliverOtp("+919007433360", "tenant@example.com", "123456", OtpPurpose.LOGIN, OtpDeliveryChannel.SMS_AND_EMAIL);

        verify(smsProvider).sendOtp("+919007433360", "123456", OtpPurpose.LOGIN);
        verify(emailProvider).sendOtp("tenant@example.com", "123456", OtpPurpose.LOGIN);
    }

    @Test
    void emailOnlyRequiresEmailRecipient() {
        OtpDeliveryProvider emailProvider = provider(OtpDeliveryProviderType.EMAIL);
        OtpDeliveryService service = new OtpDeliveryService(
                List.of(emailProvider), new AsyncOtpDelivery(List.of(emailProvider)));

        assertThatThrownBy(() -> service.deliverOtp("+919007433360", null, "123456", OtpPurpose.LOGIN, OtpDeliveryChannel.EMAIL))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("email recipient");
    }

    private static OtpDeliveryProvider provider(OtpDeliveryProviderType type) {
        OtpDeliveryProvider provider = mock(OtpDeliveryProvider.class);
        when(provider.type()).thenReturn(type);
        return provider;
    }
}
