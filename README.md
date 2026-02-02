# Anomly detection (Cluster)

Employee workspace management with location-based access control and admin dashboard.

## Quick Local Setup

```powershell
npm install
copy .env.example .env
# Edit .env with your PostgreSQL DATABASE_URL
npm start
```

## Render Deployment Guide

### Step 1: Create PostgreSQL Database on Render
1. Go to [render.com](https://render.com) → Dashboard
2. Click **"New +"** → **PostgreSQL**
3. Name: `anomly-detection-db`
4. Region: Oregon (same as web service)
5. Click **Create Database** and wait 2-3 minutes
6. Copy the **External Database URL** from the database overview

### Step 2: Initialize Database Schema
1. In Render PostgreSQL dashboard, click **Connect**
2. Use **psql** or **Database Browser**
3. Run the SQL from [schema.sql](schema.sql) to create all tables

### Step 3: Create Web Service
1. Go to Render Dashboard → **New Web Service**
2. Connect your GitHub repository (branch: `main`)
3. Fill in these settings:
   - **Name:** `anomly-detection-api`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (512 MB RAM)

### Step 4: Add Environment Variables
In Render Web Service settings → **Environment**, add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Paste from your PostgreSQL External URL |
| `SESSION_SECRET` | Generate a random string (e.g., `aB9xKmL2pQr5sT8uVwXyZ1cD4eF7gH0jK`) |
| `PORT` | `3000` |

### Step 5: Deploy
Click **Create Web Service** — Render will auto-deploy on push to `main` branch.

## Important Notes

- **Location Check:** Logins restricted to CUTM, Paralakhemundi (use localhost for testing)
- **Block Log:** Stored in `block.log` (ephemeral on Render free tier)
- **Admin Credentials:** `admin@admin.com` / `admin@123`
- **Health Check:** Available at `/health` endpoint for uptime monitoring

## File Structure

```
├── server.js          # Express app with Postgres
├── views/             # EJS templates
├── public/            # Static assets
├── schema.sql         # Database schema (run on Render Postgres)
├── .env.example       # Environment template
└── package.json       # Dependencies
```

## Troubleshooting

**Connection refused?** Check `DATABASE_URL` in Render environment settings.  
**Tables not found?** Run `schema.sql` in Render PostgreSQL console.  
**Static files not loading?** Ensure `public/` folder exists in repository.

