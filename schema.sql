-- PostgreSQL Schema for Anomly Detection
-- Converted from MySQL

-- Create tables (order matters for foreign keys)

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  location VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  last_login_time TIMESTAMP,
  logout_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blocked users table
CREATE TABLE blocked_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  ip VARCHAR(45),
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Failed logins table
CREATE TABLE failed_logins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  ip VARCHAR(45),
  attempts INT DEFAULT 1,
  last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unblock requests table
CREATE TABLE unblock_requests (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  ip VARCHAR(45),
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  request_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rejected requests table
CREATE TABLE rejected_requests (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  ip VARCHAR(45),
  rejected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notes table (with foreign key to users)
CREATE TABLE notes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_blocked_users_username ON blocked_users(username);
CREATE INDEX idx_failed_logins_username ON failed_logins(username);

-- Insert sample admin user (password: admin@123, hashed with bcrypt)
-- Note: Replace the hash with actual bcrypt hash if needed
INSERT INTO users (username, email, password, phone, location, status)
VALUES ('admin@admin.com', 'admin@admin.com', 'admin@123', '0000000000', 'Admin', 'approved')
ON CONFLICT (username) DO NOTHING;

-- Insert test user
INSERT INTO users (username, email, password, phone, location, status)
VALUES ('testuser', 'test@example.com', '$2b$10$YourHashedPasswordHere', '1234567890', 'Paralakhemundi', 'approved')
ON CONFLICT (username) DO NOTHING;
