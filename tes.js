require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const session = require("express-session");
const bodyParser = require("body-parser");
const fs = require("fs");
const axios = require("axios"); // For fetching geolocation

const app = express();
const PORT = 3000;

// ✅ Database Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "dataclu",
});

db.connect((err) => {
    if (err) console.error("Database connection failed:", err);
    else console.log("✅ Connected to MySQL database.");
});

// ✅ Middleware
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
    session({
        secret: "your_secret_key",
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
    const officeStart = 9 * 60; // 9:00 AM in minutes
    const officeEnd = 23 * 60 + 59; // 5:30 PM in minutes
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



// ==========================
// ✅ Login Route with Time and Location Restriction
// ==========================
app.get("/", (req, res) => {
    res.render("login", { loginMessage: "", blocked: false, username: "" });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const ip = getIP(req);

    // ❌ Check Office Hours
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

    // ✅ Check if User is Blocked
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

                    if (match) {
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
// ✅ Start Server
// ==========================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
