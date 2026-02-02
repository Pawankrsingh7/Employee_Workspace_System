
require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const axios = require("axios");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "dataclu1",
});

db.connect((err) => {
    if (err) console.error("Database connection failed:", err);
    else console.log("✅ Connected to MySQL database.");
});

// ✅ Middleware
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Add this line
// Add this in your middleware section
app.use(express.static("public"));
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
        "SELECT * FROM failed_logins WHERE username = ?",
        [username],
        (err, results) => {
            if (err) throw err;

            let attempts = 1;

            if (results.length > 0) {
                attempts = results[0].attempts + 1;

                db.query(
                    "UPDATE failed_logins SET attempts = ?, last_attempt = CURRENT_TIMESTAMP WHERE username = ?",
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
                    "INSERT INTO failed_logins (username, ip, attempts) VALUES (?, ?, 1)",
                    [username, ip],
                    () => callback(attempts)
                );
            }
        }
    );
};

const blockUser = (username, ip) => {
    db.query(
        "INSERT IGNORE INTO blocked_users (username, ip) VALUES (?, ?)",
        [username, ip],
        (err) => {
            if (err) throw err;
            logBlockedUser(username, ip);
        }
    );
};

const isBlocked = (username, callback) => {
    db.query(
        "SELECT * FROM blocked_users WHERE username = ?",
        [username],
        (err, results) => {
            if (err) throw err;
            callback(results.length > 0);
        }
    );
};

const clearFailedLogins = (username) => {
    db.query("DELETE FROM failed_logins WHERE username = ?", [username]);
};

// Add this utility function at the top with other utility functions
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
                        blockedUsers: blockedUsers,
                        unblockRequests: unblockRequests,
                        signupRequests: signupRequests,
                        activeUsers: activeUsers
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

// ==========================
// ✅ Modified Signup Route
// ==========================
app.post("/signup", (req, res) => {
    const { username, email, password, phone, location } = req.body;

    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) throw err;

        db.query(
            `INSERT INTO users (username, email, password, phone, location, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
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
// ✅ Login Route with Unblock Request Feature
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

    // ❌ Check Location
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

        const sql = "SELECT * FROM users WHERE username = ?";
        db.query(sql, [username], (err, results) => {
            if (err) throw err;

            if (results.length > 0) {
                const user = results[0];

                bcrypt.compare(password, user.password, (err, match) => {
                    if (err) throw err;

                    // Add this check
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
                            "UPDATE users SET last_login_time = NOW() WHERE username = ?",
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

// ==========================
// ✅ Logout with Logout Time Storage
// ==========================
app.get("/logout", (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const username = req.session.user.username;

    db.query(
        "UPDATE users SET logout_time = NOW() WHERE username = ?",
        [username],
        (err) => {
            if (err) {
                console.error("Error updating logout time:", err);
            }
            req.session.destroy(() => res.redirect("/"));
        }
    );
});


// ==========================
// ✅ User Dashboard
// ==========================
app.get("/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const username = req.session.user.username;

    db.query(
        "SELECT * FROM users WHERE username = ?",
        [username],
        (err, results) => {
            if (err) throw err;
            const user = results[0];
            res.render("dashboard", { user });
        }
    );
});


// ==========================
// ✅ Admin Panel to View Unblock Requests
// ==========================
app.get("/admin", (req, res) => {
    const blockedUsersQuery = "SELECT * FROM blocked_users";
    const unblockRequestsQuery = "SELECT * FROM unblock_requests WHERE status = 'pending'";

    db.query(blockedUsersQuery, (err, blockedUsers) => {
        if (err) throw err;

        db.query(unblockRequestsQuery, (err, unblockRequests) => {
            if (err) throw err;

            res.render("admin", {
                blockedUsers: blockedUsers,
                unblockRequests: unblockRequests
            });
        });
    });
});

// ✅ Unblock Request Route
app.post("/request-unblock", (req, res) => {
    const { username } = req.body;

    db.query(
        "SELECT * FROM unblock_requests WHERE username = ? AND status = 'pending'",
        [username],
        (err, results) => {
            if (err) throw err;

            if (results.length > 0) {
                return res.render("login", {
                    loginMessage: "⏳ Unblock request already submitted.",
                    blocked: true,
                    username,
                });
            }

            db.query(
                "INSERT INTO unblock_requests (username, status, request_time) VALUES (?, 'pending', NOW())",
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

    db.query("DELETE FROM blocked_users WHERE username = ?", [username], (err) => {
        if (err) throw err;

        db.query("UPDATE unblock_requests SET status = 'approved' WHERE username = ?", [username], (err) => {
            if (err) throw err;
            res.redirect("/admin");
        });
    });
});

// ✅ Approve Unblock Request
app.post("/approve-request", (req, res) => {
    const { id } = req.body;

    db.query("SELECT * FROM unblock_requests WHERE id = ?", [id], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const { username } = results[0];

            db.query("DELETE FROM blocked_users WHERE username = ?", [username], (err) => {
                if (err) throw err;

                db.query("DELETE FROM unblock_requests WHERE id = ?", [id], (err) => {
                    if (err) throw err;
                    res.redirect("/admin");
                });
            });
        } else {
            res.redirect("/admin");
        }
    });
});

// ✅ Reject Unblock Request
app.post("/reject-request", (req, res) => {
    const { id } = req.body;

    db.query("SELECT * FROM unblock_requests WHERE id = ?", [id], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            const { username, ip } = results[0];

            db.query(
                "INSERT INTO rejected_requests (username, ip, rejected_at) VALUES (?, ?, NOW())",
                [username, ip],
                (err) => {
                    if (err) throw err;

                    db.query("DELETE FROM unblock_requests WHERE id = ?", [id], (err) => {
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

// Update the admin routes section to:
// ==========================
// ✅ Admin Panel Routes
// ==========================
app.get("/admin", (req, res) => {
    if (!req.session.admin) return res.redirect("/login");
    
    getAdminData((data) => {
        res.render("admin", data);
    });
});

app.get("/admin/signup-requests", (req, res) => {
    if (!req.session.admin) return res.redirect("/login");
    
    getAdminData((data) => {
        res.render("admin", data);
    });
});

app.get("/admin/active-users", (req, res) => {
    if (!req.session.admin) return res.redirect("/login");
    
    getAdminData((data) => {
        res.render("admin", data);
    });
});

// Update the approval/reject routes:
app.post("/admin/approve-user", (req, res) => {
    const { userId } = req.body;

    db.query(
        "UPDATE users SET status = 'approved' WHERE id = ?",
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
        "UPDATE users SET status = 'rejected' WHERE id = ?",
        [userId],
        (err) => {
            if (err) throw err;
            res.redirect("/admin");
        }
    );
});
// ==========================
// ✅ Active Users Tracking
// ==========================
app.get("/admin/active-users", (req, res) => {
    if (!req.session.admin) return res.redirect("/login");

    db.query(
        "SELECT username, email, last_login_time FROM users WHERE status = 'approved' AND logout_time IS NULL",
        (err, activeUsers) => {
            if (err) throw err;

            res.render("admin", {
                blockedUsers: req.body.blockedUsers,
                unblockRequests: req.body.unblockRequests,
                activeUsers: activeUsers
            });
        }
    );
});

app.get("/projects", (req, res) => {
    res.render("projects");
});
app.get("/chat", (req, res) => {
    res.render("chat");
});

// Single-page Notes Routes
app.get("/notes", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const userId = req.session.user.id;

    db.query(
        "SELECT id, title FROM notes WHERE user_id = ? ORDER BY updated_at DESC",
        [userId],
        (err, notes) => {
            if (err) throw err;
            res.render("notes-single", {
                notes: notes,
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
        // Update existing note
        db.query(
            "UPDATE notes SET title = ?, content = ? WHERE id = ? AND user_id = ?",
            [title, content, noteId, userId],
            (err) => {
                if (err) throw err;
                res.json({ success: true });
            }
        );
    } else {
        // Create new note
        db.query(
            "INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)",
            [userId, title, content],
            (err, result) => {
                if (err) throw err;
                res.json({
                    success: true,
                    newId: result.insertId
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
        "SELECT * FROM notes WHERE id = ? AND user_id = ?",
        [noteId, userId],
        (err, results) => {
            if (err) throw err;
            res.json(results[0] || {});
        }
    );
});

app.delete("/api/notes/:id", (req, res) => {
    if (!req.session.user) return res.status(401).send("Unauthorized");

    const noteId = req.params.id;
    const userId = req.session.user.id;

    db.query(
        "DELETE FROM notes WHERE id = ? AND user_id = ?",
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
// ✅ Start Server
// ==========================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
