-- A recurring expense no longer has a day of the month (user, 2026-11-01). It only
-- labelled the expense it generated, which is now dated the day it is added. The
-- column stays with its old values, unread, because nothing here should delete data.
ALTER TABLE expense.recurring_expenses ALTER COLUMN day_of_month DROP NOT NULL;
