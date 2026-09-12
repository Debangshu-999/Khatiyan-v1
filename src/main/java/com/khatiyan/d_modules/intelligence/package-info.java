/**
 * Everything in Khatiyan that asks a language model a question.
 *
 * <p><b>One way in.</b> Other modules never call an AI service directly — they
 * go through {@code IntelligenceModule}, or more often they publish an event
 * this module reacts to. Nothing here runs inside another module's transaction.
 *
 * <p><b>Nothing depends on this module.</b> The dependency arrow only points
 * outwards: intelligence reads other modules through their public facades. That
 * is what lets the whole thing be switched off, or fail, without taking any
 * part of the product with it.
 *
 * <p><b>It is off until somebody turns it on.</b> {@code app.ai.enabled} is
 * false by default and every capability has its own flag beneath it. This is
 * the only module that sends data to a third party, so "does nothing" has to be
 * the resting state rather than a configuration mistake away.
 *
 * <p>Design and phasing: {@code docs/Spring AI/ai-intelligence-platform-spec.md}.
 * Intent and invariants, as for every module: {@code docs/modules/intelligence.md}.
 */
package com.khatiyan.d_modules.intelligence;
