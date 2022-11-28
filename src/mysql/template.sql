CREATE TABLE `users`(
    `id` BIGINT UNSIGNED NOT NULL,
    `username` TEXT NOT NULL,
    `email` TEXT NOT NULL,
    `passwd_md5` TEXT NOT NULL,
    `passwd_length` INT UNSIGNED NOT NULL,
    `passwd_changed_ms` BIGINT UNSIGNED NOT NULL,
    `created_ms` BIGINT NOT NULL,
    `roles` TEXT NULL,
    `administrator` INT NOT NULL,
    `flags` INT NOT NULL DEFAULT '0'
);
ALTER TABLE
    `users` ADD UNIQUE `users_id_unique`(`id`);
CREATE TABLE `sessions`(
    `id` BIGINT UNSIGNED NOT NULL,
    `session_id` TEXT NOT NULL,
    `user` BIGINT UNSIGNED NOT NULL,
    `md5` TEXT NOT NULL,
    `created_ms` BIGINT UNSIGNED NOT NULL,
    `last_used_ms` BIGINT UNSIGNED NOT NULL,
    `user_agent` TEXT NOT NULL,
    `ip_address` TEXT NOT NULL
);
ALTER TABLE
    `sessions` ADD UNIQUE `sessions_id_unique`(`id`);
CREATE TABLE `mfa`(
    `id` BIGINT UNSIGNED NOT NULL,
    `user` BIGINT UNSIGNED NOT NULL,
    `secret` TEXT NOT NULL,
    `pending` TINYINT NOT NULL
);
ALTER TABLE
    `mfa` ADD UNIQUE `mfa_id_unique`(`id`);
CREATE TABLE `sso`(
    `id` BIGINT UNSIGNED NOT NULL,
    `user` BIGINT UNSIGNED NOT NULL,
    `ssokey` TEXT NOT NULL,
    `expires_after` BIGINT NOT NULL
);
ALTER TABLE
    `sso` ADD UNIQUE `sso_id_unique`(`id`);
CREATE TABLE `roles`(
    `id` BIGINT UNSIGNED NOT NULL,
    `name` TEXT NOT NULL,
    `color` INT NOT NULL,
    `flags` INT NOT NULL
);
ALTER TABLE
    `roles` ADD UNIQUE `roles_id_unique`(`id`);