-- Bivaax Trade MySQL Migration
-- Optimized with proper indexes and foreign keys

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uid` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(255) DEFAULT NULL,
  `photo_url` VARCHAR(500) DEFAULT NULL,
  `password` VARCHAR(255) DEFAULT NULL,
  `real_balance` DECIMAL(20, 2) DEFAULT '0.00',
  `demo_balance` DECIMAL(20, 2) DEFAULT '10000.00',
  `currency` VARCHAR(10) DEFAULT 'USD',
  `tfa_enabled` TINYINT(1) DEFAULT '0',
  `tfa_mode` VARCHAR(50) DEFAULT 'app',
  `tfa_secret` VARCHAR(255) DEFAULT NULL,
  `is_verified` TINYINT(1) DEFAULT '0',
  `is_admin` TINYINT(1) DEFAULT '0',
  `phone` VARCHAR(50) DEFAULT NULL,
  `country` VARCHAR(100) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Standard',
  `kyc_status` VARCHAR(50) DEFAULT 'unverified',
  `referred_by_uid` VARCHAR(255) DEFAULT NULL,
  `referral_code` VARCHAR(50) DEFAULT NULL,
  `affiliate_id` VARCHAR(50) DEFAULT NULL,
  `affiliate_balance` DECIMAL(20, 2) DEFAULT '0.00',
  `total_affiliate_earnings` DECIMAL(20, 2) DEFAULT '0.00',
  `referral_count` INT DEFAULT '0',
  `custom_affiliate_share` INT DEFAULT NULL,
  `withdrawal_otp` VARCHAR(10) DEFAULT NULL,
  `withdrawal_otp_expires_at` BIGINT DEFAULT NULL,
  `total_live_volume` DECIMAL(20, 2) DEFAULT '0.00',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uid` (`uid`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_referral_code` (`referral_code`),
  KEY `idx_referred_by` (`referred_by_uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trades Table
CREATE TABLE IF NOT EXISTS `trades` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `firebase_id` VARCHAR(255) DEFAULT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `market_id` VARCHAR(100) NOT NULL,
  `asset` VARCHAR(100) DEFAULT NULL,
  `amount` DECIMAL(20, 2) NOT NULL,
  `direction` VARCHAR(10) NOT NULL,
  `type` VARCHAR(50) DEFAULT NULL,
  `entry_price` DECIMAL(20, 8) NOT NULL,
  `exit_price` DECIMAL(20, 8) DEFAULT NULL,
  `duration` INT NOT NULL,
  `time_left` INT DEFAULT NULL,
  `expiry_time` BIGINT NOT NULL,
  `expiration_time` VARCHAR(100) DEFAULT NULL,
  `is_demo` TINYINT(1) DEFAULT '1',
  `account_type` VARCHAR(50) DEFAULT 'demo',
  `tournament_id` VARCHAR(255) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'open',
  `payout_amount` DECIMAL(20, 2) DEFAULT NULL,
  `payout` VARCHAR(50) DEFAULT NULL,
  `settled_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_expiry` (`expiry_time`),
  CONSTRAINT `fk_trades_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transactions Table
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `amount` DECIMAL(20, 2) NOT NULL,
  `currency` VARCHAR(10) DEFAULT 'USD',
  `status` VARCHAR(50) DEFAULT 'pending',
  `method` VARCHAR(100) DEFAULT 'direct',
  `tx_hash` VARCHAR(255) DEFAULT NULL,
  `details` TEXT DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tx_hash` (`tx_hash`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_transactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) DEFAULT NULL,
  `action` VARCHAR(255) NOT NULL,
  `entity_type` VARCHAR(100) DEFAULT NULL,
  `entity_id` VARCHAR(255) DEFAULT NULL,
  `details` TEXT DEFAULT NULL,
  `ip_address` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login History Table
CREATE TABLE IF NOT EXISTS `login_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `ip_address` VARCHAR(100) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'success',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_login_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- KYC Requests Table
CREATE TABLE IF NOT EXISTS `kyc_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `status` VARCHAR(50) DEFAULT 'pending',
  `full_name` VARCHAR(255) DEFAULT NULL,
  `document_type` VARCHAR(50) DEFAULT NULL,
  `document_number` VARCHAR(100) DEFAULT NULL,
  `front_image` TEXT DEFAULT NULL,
  `back_image` TEXT DEFAULT NULL,
  `selfie_image` TEXT DEFAULT NULL,
  `rejection_reason` TEXT DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_kyc_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tickets Table
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `status` VARCHAR(50) DEFAULT 'open',
  `priority` VARCHAR(50) DEFAULT 'medium',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_tickets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`uid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket Messages Table
CREATE TABLE IF NOT EXISTS `ticket_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ticket_id` BIGINT UNSIGNED NOT NULL,
  `user_id` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `is_admin` TINYINT(1) DEFAULT '0',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ticket_id` (`ticket_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_ticket_messages_ticket` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
