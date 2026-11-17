-- #72 account-level default reminder offset on new dated items (NULL = None, v1.1.0 behaviour)
ALTER TABLE `users` ADD `default_reminder` text DEFAULT NULL CHECK(default_reminder IS NULL OR default_reminder IN ('1w','3d','2d','1d','2h','15min'));
