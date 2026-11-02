package com.khatiyan.d_modules.intelligence;

/**
 * The reader's answer for one plan or dish: its own overall score out of 5, judged from
 * the words alone, and one short paragraph with key words between double asterisks.
 */
public record MealReviewReading(String key, double rating, String review) {
}
