package com.khatiyan.d_modules.mail.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.khatiyan.d_modules.mail.MailContent;
import com.khatiyan.d_modules.mail.MailContent.Button;
import com.khatiyan.d_modules.mail.MailContent.Detail;
import com.khatiyan.d_modules.mail.api.AppOpenController;

/** How a mail is laid out (2026-10-18): escaped, with a text part, and a button that reaches the app. */
class MailRendererTest {

    private final MailRenderer renderer = new MailRenderer("https://khatiyan.example/api/v1/open");

    private static MailContent mail(String propertyName) {
        return new MailContent(
                "Your visit to " + propertyName + " is booked",
                "Sunday 5 October, 4:00 pm",
                "Your visit is booked",
                List.of("You booked a visit to " + propertyName + "."),
                List.of(new Detail("Property", propertyName), new Detail("Address", " "), new Detail("Visit", "VIS-12")),
                new Button("View your visit", "my-booking-detail?requestId=abc"),
                List.of("Show your visitor pass."));
    }

    @Test
    void everyValueIsEscapedAndABlankDetailIsLeftOut() {
        MailRenderer.Rendered out = renderer.render(mail("Sky <b>Luxury</b> & Co"));
        assertThat(out.html()).contains("Sky &lt;b&gt;Luxury&lt;/b&gt; &amp; Co").doesNotContain("<b>Luxury</b>");
        assertThat(out.html()).doesNotContain(">Address<");
        assertThat(out.html()).contains("cid:logo").contains("What happens next").contains("VIS-12");
    }

    @Test
    void theTextPartSaysTheSameWithTheLinkWrittenOut() {
        String text = renderer.render(mail("Sky Luxury PG")).text();
        assertThat(text).startsWith("Your visit is booked\n\n")
                .contains("Property: Sky Luxury PG\n").contains("Visit: VIS-12\n").doesNotContain("Address:")
                .contains("View your visit: https://khatiyan.example/api/v1/open?to=my-booking-detail%3FrequestId%3Dabc")
                .contains("- Show your visitor pass.");
    }

    @Test
    void theButtonOpensThePageThatHandsTheScreenToTheApp() {
        AppOpenController open = new AppOpenController();
        String android = open.open("my-visits", "Mozilla/5.0 (Linux; Android 14)").getBody();
        assertThat(android).contains("intent://my-visits#Intent;scheme=khatiyan;package=com.khatiyan.app;end")
                .contains("http-equiv=\"refresh\"");
        String desktop = open.open("my-visits", "Mozilla/5.0 (Windows NT 10.0)").getBody();
        assertThat(desktop).contains("khatiyan://my-visits").doesNotContain("http-equiv");
        // Anything that is not a plain screen name goes nowhere.
        assertThat(open.open("javascript:alert(1)", "Android").getBody()).doesNotContain("javascript")
                .contains("intent://#Intent");
    }
}
