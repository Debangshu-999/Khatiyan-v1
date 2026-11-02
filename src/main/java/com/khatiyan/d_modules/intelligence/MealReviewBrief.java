package com.khatiyan.d_modules.intelligence;

import java.util.List;

/**
 * What the meal review reader is given, and all it is given (user, 2026-11-01):
 * plan names, dish names and the words people wrote. Keys stand in for ids, and
 * nothing here says who wrote what, so a model cannot leak what it never had.
 *
 * <p>A review goes in once, tagged with its plan and its dish. A dish on two plans
 * has one key, which is how it comes to be read across every plan. There is one review
 * per person per dish, their latest, so nobody outweighs anybody else by writing daily.
 */
public record MealReviewBrief(List<Subject> plans, List<Subject> dishes, List<Review> reviews) {

    public record Subject(String key, String name) {
    }

    public record Review(String planKey, String dishKey, String text) {
    }
}
