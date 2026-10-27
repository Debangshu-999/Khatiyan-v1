package com.khatiyan.d_modules.booking.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.booking.service.BookingConversionService;
import com.khatiyan.d_modules.booking.service.BookingNegotiationService;
import com.khatiyan.d_modules.booking.service.BookingRequestService;
import com.khatiyan.d_modules.booking.service.BookingTokenService;

/** JSON binding/validation only; ownership and version guards are exercised by service integration tests. */
class BookingCancellationControllerTest {
    private final UUID tenantId = UUID.randomUUID();
    private final UUID requestId = UUID.randomUUID();
    private final BookingNegotiationService negotiation = mock(BookingNegotiationService.class);
    private final LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        validator.afterPropertiesSet();
        var controller = new BookingRequestController(mock(BookingRequestService.class), negotiation,
                mock(BookingTokenService.class), mock(BookingConversionService.class));
        mvc = MockMvcBuilders.standaloneSetup(controller).setValidator(validator)
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType() == UserPrincipal.class;
                    }

                    @Override
                    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                            NativeWebRequest request, WebDataBinderFactory binder) {
                        return new UserPrincipal(tenantId, "+919000000000", "TENANT", null);
                    }
                }).build();
    }

    @AfterEach
    void closeValidator() {
        validator.close();
    }

    @Test
    void cancellationJsonPassesTheReasonAndSignedInTenantToTheService() throws Exception {
        mvc.perform(post("/api/v1/booking-requests/{requestId}/cancel", requestId)
                .header("If-Match", "12").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"My move-in plans changed\"}"))
                .andExpect(status().isOk());
        verify(negotiation).cancel(tenantId, requestId, "My move-in plans changed");
    }

    @Test
    void olderClientsCanStillCancelWithoutABody() throws Exception {
        mvc.perform(post("/api/v1/booking-requests/{requestId}/cancel", requestId).header("If-Match", "12"))
                .andExpect(status().isOk());
        verify(negotiation).cancel(tenantId, requestId, null);
    }

    @Test
    void oversizedReasonIsRejectedBeforeCallingTheService() throws Exception {
        mvc.perform(post("/api/v1/booking-requests/{requestId}/cancel", requestId)
                .header("If-Match", "12").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"" + "x".repeat(501) + "\"}"))
                .andExpect(status().isBadRequest());
        verify(negotiation, never()).cancel(any(), any(), any());
    }
}
