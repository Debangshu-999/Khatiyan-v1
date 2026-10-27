/**
 * Mails to people, queued by the module that knows when one is due and sent
 * by this one (2026-10-18). Spec:
 * {@code docs/superpowers/specs/2026-10-18-visit-and-booking-mails-design.md}.
 *
 * <p>It knows nothing about visits or bookings. A caller hands it a
 * {@link com.khatiyan.d_modules.mail.MailContent} and a key naming the
 * telling, and it renders, queues, and sends once.
 */
@org.springframework.modulith.ApplicationModule(type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.khatiyan.d_modules.mail;
