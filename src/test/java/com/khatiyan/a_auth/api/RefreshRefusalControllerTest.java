package com.khatiyan.a_auth.api;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.khatiyan.a_auth.service.AuthService;
import com.khatiyan.a_auth.firebase.FirebaseAuthService;
import com.khatiyan.c_shared.http.ClientIpResolver;

/**
 * A refused refresh token says so by its code, and the app signs out on that code alone
 * (user, 2026-11-07): a bare 401 from Spring's error page during a restart signed a phone out.
 */
class RefreshRefusalControllerTest {

    @Test
    void aRefusedRefreshTokenCarriesItsOwnCode() throws Exception {
        AuthService auth = mock(AuthService.class);
        when(auth.refresh(anyString())).thenReturn(Optional.empty());
        MockMvc mvc = MockMvcBuilders.standaloneSetup(
                new AuthController(auth, mock(ClientIpResolver.class), mock(FirebaseAuthService.class))).build();

        mvc.perform(post("/api/v1/auth/token/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"not-a-real-token\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("REFRESH_REFUSED"));
    }
}
