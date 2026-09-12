package com.khatiyan.d_modules.intelligence.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.d_modules.intelligence.IntelligenceModule;
import com.khatiyan.d_modules.intelligence.api.dto.AiCapabilitiesResponse;

/**
 * What this deployment can do, answered whether or not it can do anything.
 *
 * <p><b>Deliberately not conditional</b>, unlike the rest of the module. The
 * client asks this before offering an AI control, so it is asked on every visit
 * to the discovery screen — including every visit while AI is switched off.
 * Leaving it to 404 in that case worked, in that the client read an absent
 * endpoint as an absent feature, but it turned the ordinary resting state of
 * the app into a stream of unhandled-exception stack traces in the log. A log
 * that cries wolf on the normal case is a log nobody reads.
 *
 * <p>So "off" is an answer here, not an absence. The endpoint costs nothing
 * when the module is disabled: it reads two booleans and holds no provider
 * client. The module's actual work stays behind {@code app.ai.enabled}.
 */
@RestController
@RequestMapping("/api/v1/ai")
public class IntelligenceCapabilitiesController {

    private final IntelligenceModule intelligenceModule;

    public IntelligenceCapabilitiesController(IntelligenceModule intelligenceModule) {
        this.intelligenceModule = intelligenceModule;
    }

    /**
     * Asked once per screen, so a client can hide an AI control rather than
     * show one that fails when pressed.
     */
    @GetMapping("/capabilities")
    public AiCapabilitiesResponse capabilities() {
        return new AiCapabilitiesResponse(intelligenceModule.isSmartSearchEnabled());
    }
}
