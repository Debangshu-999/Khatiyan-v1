/**
 * Post-visit monthly booking requests, offers, bed holds and tokens.
 *
 * <p>A request holds one bed from the moment it is sent, so a bed is asked
 * for by one person at a time. The token (paid to the property directly and
 * only recorded here) or the owner's waiver confirms it, and a booking that
 * ends short of that frees the bed. Requests can be sent, read and expired
 * through services. Inventory mutations go through tenancy/property facades.
 * No endpoint exists yet; authenticated attendance/access guards remain
 * mandatory there.
 */
@org.springframework.modulith.ApplicationModule(type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.khatiyan.d_modules.booking;
