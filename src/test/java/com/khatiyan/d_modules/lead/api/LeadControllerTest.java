package com.khatiyan.d_modules.lead.api;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.YearMonth;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.lead.model.LeadKind;
import com.khatiyan.d_modules.lead.model.LeadRepeatFlag;
import com.khatiyan.d_modules.lead.service.LeadQueryService;

/**
 * How a request reaches the lead services: the list's filters and the
 * funnel's month. Who may read is exercised against the database by the
 * service suites. Nothing is written to a lead by hand.
 */
class LeadControllerTest {

    private final UUID owner = UUID.randomUUID();
    private final UUID property = UUID.randomUUID();
    private final UUID lead = UUID.randomUUID();
    private final LeadQueryService leads = mock(LeadQueryService.class);
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new LeadController(leads))
                .setCustomArgumentResolvers(new HandlerMethodArgumentResolver() {
                    @Override
                    public boolean supportsParameter(MethodParameter parameter) {
                        return parameter.getParameterType() == UserPrincipal.class;
                    }

                    @Override
                    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer container,
                            NativeWebRequest request, WebDataBinderFactory binder) {
                        return new UserPrincipal(owner, "+919000000000", "OWNER", null);
                    }
                }).build();
    }

    @Test
    void theListWithNothingAskedForIsEveryRecordNewestFirst() throws Exception {
        mvc.perform(get("/api/v1/properties/{propertyId}/leads", property)).andExpect(status().isOk());

        verify(leads).pageForProperty(owner, property, null, false, false, false, null, null, 0, 20);
    }

    @Test
    void severalKindsArriveCommaSeparatedWithTheTwoTagsBesideThem() throws Exception {
        mvc.perform(get("/api/v1/properties/{propertyId}/leads", property)
                .queryParam("kind", "EARLY_LEAD,ADVANCED_LEAD,BOOKED")
                .queryParam("resumed", "true").queryParam("goingCold", "true")
                .queryParam("repeat", "DUPLICATE,POTENTIAL_SPAM").queryParam("q", "Aarav").queryParam("mine", "true")
                .queryParam("page", "2").queryParam("size", "50"))
                .andExpect(status().isOk());

        verify(leads).pageForProperty(owner, property,
                Set.of(LeadKind.EARLY_LEAD, LeadKind.ADVANCED_LEAD, LeadKind.BOOKED), true, true,
                true, Set.of(LeadRepeatFlag.DUPLICATE, LeadRepeatFlag.POTENTIAL_SPAM), "Aarav", 2, 50);
    }

    @Test
    void spamAndDuplicateAreMarksNotKinds() throws Exception {
        mvc.perform(get("/api/v1/properties/{propertyId}/leads", property).queryParam("kind", "SPAM"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/properties/{propertyId}/leads", property).queryParam("repeat", "SPAM"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aKindThatDoesNotExistIsRefusedBeforeAnythingIsRead() throws Exception {
        mvc.perform(get("/api/v1/properties/{propertyId}/leads", property).queryParam("kind", "WARM"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void theFunnelTakesAMonthOrTheMonthItIsNow() throws Exception {
        mvc.perform(get("/api/v1/properties/{propertyId}/leads/funnel", property).queryParam("month", "2026-10"))
                .andExpect(status().isOk());
        verify(leads).funnel(owner, property, YearMonth.of(2026, 10));

        mvc.perform(get("/api/v1/properties/{propertyId}/leads/funnel", property)).andExpect(status().isOk());
        verify(leads).funnel(owner, property, null);

        mvc.perform(get("/api/v1/properties/{propertyId}/leads/funnel", property).queryParam("month", "October"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nobodyMarksALeadByHand() throws Exception {
        for (String path : new String[] { "/api/v1/leads/{leadId}/spam", "/api/v1/leads/{leadId}/duplicate" }) {
            mvc.perform(post(path, lead).header("If-Match", "4")).andExpect(status().isNotFound());
        }
        mvc.perform(request(HttpMethod.GET, "/api/v1/leads/{leadId}/duplicate", lead))
                .andExpect(status().isNotFound());
    }
}
