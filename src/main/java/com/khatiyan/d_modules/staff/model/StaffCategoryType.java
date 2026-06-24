package com.khatiyan.d_modules.staff.model;

/** Built-in categories. Managers remain real-user assignments in property. */
public enum StaffCategoryType {
    COOKING("Cooking"),
    CLEANING("Cleaning"),
    SECURITY("Security"),
    MAINTENANCE("Maintenance"),
    OTHER("Other");

    private final String displayName;

    StaffCategoryType(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
