CREATE INDEX `account_issuer_accountId_idx` ON `account` (`issuer`,`accountId`);--> statement-breakpoint
CREATE INDEX `verification_expiresAt_idx` ON `verification` (`expiresAt`);