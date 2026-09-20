/**
 * Property food catalogues, subscription profiles, weekly menus and cooking
 * forecasts.
 *
 * <p>The property module remains the source of truth for whether food is
 * available and which meal slots are offered. This module has its own separate
 * enablement switch for owners who want Khatiyan to manage that food operation;
 * switching it off never changes the property's advertised food setting.
 */
@org.springframework.modulith.ApplicationModule(type = org.springframework.modulith.ApplicationModule.Type.OPEN)
package com.khatiyan.d_modules.food;
