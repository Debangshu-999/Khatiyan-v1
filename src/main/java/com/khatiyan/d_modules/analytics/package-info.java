/**
 * Owner analytics: the figures behind the Dashboard tab's division screens.
 *
 * <p><b>It reads, it never owns.</b> Every figure comes from the module that
 * owns the data, through that module's analytics class, which queries only its
 * own schema. This module resolves periods, joins per-row facts in Java,
 * applies the minimum-sample and permission rules, and owns exactly one kind of
 * data: the nightly property snapshot, for history no other module keeps.
 *
 * <p><b>Nothing depends on this module</b> in this sub-project. The AI summaries
 * (sub-project 3) will read its metric contract as their evidence.
 *
 * <p>Design: {@code docs/superpowers/specs/2026-09-26-analytics-dashboard-design.md}.
 * Intent and invariants: {@code docs/modules/analytics.md}.
 */
package com.khatiyan.d_modules.analytics;
