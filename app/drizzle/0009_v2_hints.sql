-- #104 phone gesture hints dismissed (forward-only; existing users start with none seen)
ALTER TABLE `users` ADD `hints_seen` text DEFAULT '[]' NOT NULL CHECK(json_valid(hints_seen));
