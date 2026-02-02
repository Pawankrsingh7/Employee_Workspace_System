// Database initialization - runs on app startup
const initDatabase = async (db) => {
    try {
        // Check if users table exists
        const tableCheckQuery = `
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'users'
            )
        `;

        const result = await db.query(tableCheckQuery);
        const tablesExist = result.rows[0].exists;

        if (!tablesExist) {
            console.log("📦 Initializing database schema...");
            
            // Create all tables - one at a time for safety
            const tables = [
                `CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    phone VARCHAR(20),
                    location VARCHAR(255),
                    status VARCHAR(20) DEFAULT 'pending',
                    last_login_time TIMESTAMP,
                    logout_time TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE blocked_users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    ip VARCHAR(45),
                    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE failed_logins (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    ip VARCHAR(45),
                    attempts INT DEFAULT 1,
                    last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE unblock_requests (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    ip VARCHAR(45),
                    status VARCHAR(20) DEFAULT 'pending',
                    request_time TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE rejected_requests (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    ip VARCHAR(45),
                    rejected_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE TABLE notes (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255),
                    content TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`,
                
                `CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)`,
                `CREATE INDEX IF NOT EXISTS idx_blocked_users_username ON blocked_users(username)`,
                `CREATE INDEX IF NOT EXISTS idx_failed_logins_username ON failed_logins(username)`
            ];

            for (const table of tables) {
                try {
                    await db.query(table);
                } catch (err) {
                    // Table might already exist, continue
                    if (!err.message.includes('already exists')) {
                        console.error("Error creating table:", err.message);
                    }
                }
            }

            console.log("✅ Database schema created successfully");

            // Insert default admin user
            try {
                await db.query(
                    `INSERT INTO users (username, email, password, phone, location, status)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (username) DO NOTHING`,
                    ['admin@admin.com', 'admin@admin.com', 'admin@123', '0000000000', 'Admin', 'approved']
                );
                console.log("✅ Admin user initialized");
            } catch (err) {
                console.log("ℹ️  Admin user already exists");
            }

        } else {
            console.log("✅ Database schema already exists");
        }
    } catch (error) {
        console.error("❌ Database initialization error:", error.message);
    }
};

module.exports = initDatabase;
