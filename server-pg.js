require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const axios = require("axios");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Database Connection (PostgreSQL)
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Render
});

db.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Test connection
db.query('SELECT NOW()', (err, result) => {
    if (err) {
        console.error("Database connection failed:", err);
    } else {
        console.log("✅ Connected to PostgreSQL database.");
    }
});

// ✅ Middleware
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
    session({
        secret: process.env.SESSION_SECRET || "your_secret_key",
        resave: false,
        saveUninitialized: true,
    })
);

// ✅ Utility Functions
const getIP = (req) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(`Detected User IP: ${ip}`);
    return ip;
};

// ✅ Function to check office hours (9:00 AM - 5:30 PM)
const isWithinOfficeHours = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const officeStart = 0 * 60; // ✅ 1:00 AM in minutes
    const officeEnd = 23 * 60 + 50; // ✅ 11:30 PM in minutes
    const currentTime = hours * 60 + minutes;

    return currentTime >= officeStart && currentTime <= officeEnd;
};

// ✅ Function to check if user is in CUTM, Paralakhemundi
const isUserInCUTM = async (ip) => {
    try {
        // ✅ Handle Localhost Case
        if (ip === "::1" || ip === "127.0.0.1") {
            console.log("⚠️ Localhost detected, skipping location check.");
            return true; // Allow local testing
        }

        const response = await axios.get(`https://ipinfo.io/${ip}/json`);
        const { city, region, country } = response.data;

        console.log(`User IP: ${ip}`);
        console.log(`Detected Location: City = ${city}, Region = ${region}, Country = ${country}`);

        if (!city || !region || !country) {
            console.log("⚠️ Location data is incomplete, denying login.");
            return false;
        }

        // ✅ Normalize city and region to prevent errors
        return city.trim().toLowerCase().includes("paralakhemundi") &&
            region.trim().toLowerCase().includes("odisha") &&
            country.trim().toLowerCase() === "in";
    } catch (error) {
        console.error("❌ Error fetching IP location:", error.message);
        return false;
    }
};

const logBlockedUser = (username, ip) => {
    const logMessage = `Blocked: ${username} | IP: ${ip} at ${new Date().toLocaleString()}\n`;
    fs.appendFileSync("block.log", logMessage);
};

const trackFailedLogin = (username, ip, callback) => {
    db.query(
        "SELECT * FROM failed_logins WHERE username = $1",
        [username],
        (err, results) => {
            if (err) throw err;

            let attempts = 1;

            if (results.rows.length > 0) {
                attempts = results.rows[0].attempts + 1;

                db.query(
                    "UPDATE failed_logins SET attempts = $1, last_attempt = CURRENT_TIMESTAMP WHERE username = $2",
                    [attempts, username],
                    () => {
                        if (attempts >= 5) {
                            blockUser(username, ip);
                        }
                        callback(attempts);
                    }
                );
            } else {
                db.query(
                    "INSERT INTO failed_logins (username, ip, attempts) VALUES ($1, $2, 1)",
                    [username, ip],
                    () => callback(attempts)
                );
            }
        }
    );
};

const blockUser = (username, ip) => {
    db.query(
        "INSERT INTO blocked_users (username, ip) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING",
        [username, ip],
        (err) => {
            if (err) throw err;
            logBlockedUser(username, ip);
        }
    );
};

const isBlocked = (username, callback) => {
    db.query(
        "SELECT * FROM blocked_users WHERE username = $1",
        [username],
        (err, results) => {
            if (err) throw err;
            callback(results.rows.length > 0);
        }
    );
};

const clearFailedLogins = (username) => {
    db.query("DELETE FROM failed_logins WHERE username = $1", [username]);
};

const getAdminData = (callback) => {
    db.query("SELECT * FROM blocked_users", (err, blockedUsers) => {
        if (err) throw err;
        
        db.query("SELECT * FROM unblock_requests WHERE status = 'pending'", (err, unblockRequests) => {
            if (err) throw err;
            
            db.query("SELECT * FROM users WHERE status = 'pending'", (err, signupRequests) => {
                if (err) throw err;
                
                db.query("SELECT username, email, last_login_time FROM users WHERE status = 'approved' AND logout_time IS NULL", 
                (err, activeUsers) => {
                    callback({
                        blockedUsers: blockedUsers.rows,
                        unblockRequests: unblockRequests.rows,
                        signupRequests: signupRequests.rows,
                        activeUsers: activeUsers.rows
                    });
                });
            });
        });
    });
};

// ==========================
// ✅ Signup Route
// ==========================
app.get("/signup", (req, res) => {
    res.render("signup", { message: "" });
});

app.post("/signup", (req, res) => {
    const { username, email, password, phone, location } = req.body;

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) throw err;

        db.query(
            `INSERT INTO users (username, email, password, phone, location, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [username, email, hashedPassword, phone, location],
            (error) => {
                if (error) {
                    console.error("Signup failed:", error);
                    return res.render("signup", { message: "❌ User already exists!" });
                }
                res.render("signup", {
                    message: "✅ Signup request submitted! Waiting for admin approval."
                });
            }
        );
    });
});

// ==========================
// ✅ Routes
// ==========================
app.get("/", (req, res) => {
    res.render("landing");
});

app.get("/login", (req, res) => {
    res.render("login", { loginMessage: "", blocked: false, username: "" });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const ip = getIP(req);

    if (username === "admin@admin.com" && password === "admin@123") {
        req.session.admin = true;
        return res.redirect("/admin");
    }

    if (!isWithinOfficeHours()) {
        return res.render("login", {
            loginMessage: "🚫 Login allowed only between 9:00 AM and 5:30 PM.",
            blocked: false,
            username
        });
    }

    const inCUTM = await isUserInCUTM(ip);
    if (!inCUTM) {
        return res.render("login", {
            loginMessage: "🚫 Login allowed only from CUTM, Paralakhemundi.",
            blocked: false,
            username
        });
    }

    isBlocked(username, (blocked) => {
        if (blocked) {
            return res.render("login", {
                loginMessage: "🚫 You are blocked.",
                blocked: true,
                username
            });
        }

        const sql = "SELECT * FROM users WHERE username = $1";
        db.query(sql, [username], (err, results) => {
            if (err) throw err;

            if (results.rows.length > 0) {
                const user = results.rows[0];

                bcrypt.compare(password, user.password, (err, match) => {
                    if (err) throw err;

                    if (match) {
                        if (user.status !== 'approved') {
                            return res.render("login", {
                                loginMessage: "❌ Account not approved by admin yet.",
                                blocked: false,
                                username
                            });
                        }

                        req.session.user = user;
                        clearFailedLogins(username);

                        db.query(
                            "UPDATE users SET last_login_time = NOW() WHERE username = $1",
                            [username],
                            () => res.redirect("/dashboard")
                        );
                    } else {
                        trackFailedLogin(username, ip, (attempts) => {
                            const remainingAttempts = 5 - attempts;

                            if (attempts >= 5) {
                                res.render("login", {
                                    loginMessage: `🚫 You have been blocked after 5 failed attempts.`,
                                    blocked: true,
                                    username
                                });
                            } else {
                                res.render("login", {
                                    loginMessage: `❌ Incorrect username or password. ${remainingAttempts} attempts left.`,
                                    blocked: false,
                                    username
                                });
                            }
                        });
                    }
                });
            } else {
                res.render("login", {
                    loginMessage: "❌ User does not exist.",
                    blocked: false,
                    username
                });
            }
        });
    });
});

app.get("/logout", (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const username = req.session.user.username;

    db.query(
        "UPDATE users SET logout_time = NOW() WHERE username = $1",
        [username],
        (err) => {
            if (err) {
                console.error("Error updating logout time:", err);
            }
            req.session.destroy(() => res.redirect("/"));
        }
    );
});

app.get("/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const username = req.session.user.username;

    db.query(
        "SELECT * FROM users WHERE username = $1",
        [username],
        (err, results) => {
            if (err) throw err;
            const user = results.rows[0];
            res.render("dashboard", { user });
        }
    );
});

app.get("/admin", (req, res) => {
    if (!req.session.admin) return res.redirect("/login");
    
    getAdminData((data) => {
        res.render("admin", data);
    });
});

app.post("/request-unblock", (req, res) => {
    const { username } = req.body;

    db.query(
        "SELECT * FROM unblock_requests WHERE username = $1 AND status = 'pending'",
        [username],
        (err, results) => {
            if (err) throw err;

            if (results.rows.length > 0) {
                return res.render("login", {
                    loginMessage: "⏳ Unblock request already submitted.",
                    blocked: true,
                    username,
                });
            }

            db.query(
                "INSERT INTO unblock_requests (username, status, request_time) VALUES ($1, 'pending', NOW())",
                [username],
                (err) => {
                    if (err) throw err;
                    res.render("login", {
                        loginMessage: "✅ Unblock request submitted successfully.",
                        blocked: true,
                        username,
                    });
                }
            );
        }
    );
});

app.post("/unblock-user", (req, res) => {
    const { username } = req.body;

    db.query("DELETE FROM blocked_users WHERE username = $1", [username], (err) => {
        if (err) throw err;

        db.query("UPDATE unblock_requests SET status = 'approved' WHERE username = $1", [username], (err) => {
            if (err) throw err;
            res.redirect("/admin");
        });
    });
});

app.post("/approve-request", (req, res) => {
    const { id } = req.body;

    db.query("SELECT * FROM unblock_requests WHERE id = $1", [id], (err, results) => {
        if (err) throw err;

        if (results.rows.length > 0) {
            const { username } = results.rows[0];

            db.query("DELETE FROM blocked_users WHERE username = $1", [username], (err) => {
                if (err) throw err;

                db.query("DELETE FROM unblock_requests WHERE id = $1", [id], (err) => {
                    if (err) throw err;
                    res.redirect("/admin");
                });
            });
        } else {
            res.redirect("/admin");
        }
    });
});

app.post("/reject-request", (req, res) => {
    const { id } = req.body;

    db.query("SELECT * FROM unblock_requests WHERE id = $1", [id], (err, results) => {
        if (err) throw err;

        if (results.rows.length > 0) {
            const { username, ip } = results.rows[0];

            db.query(
                "INSERT INTO rejected_requests (username, ip, rejected_at) VALUES ($1, $2, NOW())",
                [username, ip],
                (err) => {
                    if (err) throw err;

                    db.query("DELETE FROM unblock_requests WHERE id = $1", [id], (err) => {
                        if (err) throw err;
                        res.redirect("/admin");
                    });
                }
            );
        } else {
            res.redirect("/admin");
        }
    });
});

app.post("/admin/approve-user", (req, res) => {
    const { userId } = req.body;

    db.query(
        "UPDATE users SET status = 'approved' WHERE id = $1",
        [userId],
        (err) => {
            if (err) throw err;
            res.redirect("/admin");
        }
    );
});

app.post("/admin/reject-user", (req, res) => {
    const { userId } = req.body;

    db.query(
        "UPDATE users SET status = 'rejected' WHERE id = $1",
        [userId],
        (err) => {
            if (err) throw err;
            res.redirect("/admin");
        }
    );
});

app.get("/projects", (req, res) => {
    res.render("projects");
});

app.get("/chat", (req, res) => {
    res.render("chat");
});

// ✅ Notes Routes
app.get("/notes", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const userId = req.session.user.id;

    db.query(
        "SELECT id, title FROM notes WHERE user_id = $1 ORDER BY updated_at DESC",
        [userId],
        (err, notes) => {
            if (err) throw err;
            res.render("notes-single", {
                notes: notes.rows,
                currentNote: null
            });
        }
    );
});

app.post("/api/notes", (req, res) => {
    if (!req.session.user) return res.status(401).send("Unauthorized");

    const { title, content, noteId } = req.body;
    const userId = req.session.user.id;

    if (noteId) {
        db.query(
            "UPDATE notes SET title = $1, content = $2 WHERE id = $3 AND user_id = $4",
            [title, content, noteId, userId],
            (err) => {
                if (err) throw err;
                res.json({ success: true });
            }
        );
    } else {
        db.query(
            "INSERT INTO notes (user_id, title, content) VALUES ($1, $2, $3)",
            [userId, title, content],
            (err, result) => {
                if (err) throw err;
                res.json({
                    success: true,
                    newId: result.rows[0].id
                });
            }
        );
    }
});

app.get("/api/notes/:id", (req, res) => {
    if (!req.session.user) return res.status(401).send("Unauthorized");

    const noteId = req.params.id;
    const userId = req.session.user.id;

    db.query(
        "SELECT * FROM notes WHERE id = $1 AND user_id = $2",
        [noteId, userId],
        (err, results) => {
            if (err) throw err;
            res.json(results.rows[0] || {});
        }
    );
});

app.delete("/api/notes/:id", (req, res) => {
    if (!req.session.user) return res.status(401).send("Unauthorized");

    const noteId = req.params.id;
    const userId = req.session.user.id;

    db.query(
        "DELETE FROM notes WHERE id = $1 AND user_id = $2",
        [noteId, userId],
        (err) => {
            if (err) throw err;
            res.json({ success: true });
        }
    );
});

app.get("/document", (req, res) => {
    res.render("document", { message: "" });
});

// ==========================
// ✅ Health Check (for Render uptime)
// ==========================
app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

// ==========================
// ✅ Start Server
// ==========================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
