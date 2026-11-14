CREATE INDEX `rateLimit_lastRequest_idx` ON `rateLimit` (`lastRequest`);--> statement-breakpoint
CREATE INDEX `session_expiresAt_idx` ON `session` (`expiresAt`);