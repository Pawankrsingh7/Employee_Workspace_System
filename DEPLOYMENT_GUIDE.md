# Render Deployment Checklist

## Pre-Deployment ✅

- [x] Converted MySQL schema to PostgreSQL
- [x] Updated `server.js` for Postgres (`pg` package)
- [x] Added `schema.sql` file with database structure
- [x] Updated `package.json` with correct dependencies
- [x] Updated `.env.example` with Postgres connection format
- [x] Updated `README.md` with step-by-step deployment guide
- [x] Added `/health` endpoint for uptime monitoring

## Step-by-Step Render Deployment

### 1. Create Postgres Database
```
✓ Go to render.com Dashboard
✓ Click "New +" → "PostgreSQL"
✓ Name: anomly-detection-db
✓ Region: Oregon (US West)
✓ Wait for database to start (2-3 minutes)
✓ Copy External Database URL from overview
```

### 2. Initialize Database Schema
```
✓ Open Render PostgreSQL Dashboard
✓ Click "Connect" tab
✓ Use Database Browser or psql
✓ Paste entire contents of schema.sql file
✓ Execute to create all tables
```

### 3. Create Web Service
```
✓ Go to render.com Dashboard
✓ Click "New +" → "Web Service"
✓ Connect your GitHub repository
✓ Select branch: main
✓ Fill Service Details:
  - Name: anomly-detection-api
  - Build Command: npm install
  - Start Command: npm start
  - Instance Type: Free
  - Region: Oregon
```

### 4. Configure Environment Variables
In Web Service → Settings → Environment Variables, add:

```
DATABASE_URL = postgresql://[user]:[pass]@[host]:5432/[dbname]
SESSION_SECRET = [generate random string]
PORT = 3000
```

Example DATABASE_URL from Render Postgres:
```
postgresql://render_user:abc123xyz@dpg-abc123.render.internal:5432/anomly_db
```

### 5. Deploy
```
✓ Click "Create Web Service"
✓ Wait for build to complete (3-5 minutes)
✓ Check Logs for "✅ Connected to PostgreSQL" message
✓ Visit your-service-url.onrender.com
```

## Testing After Deployment

```
✓ Test landing page: https://your-service.onrender.com/
✓ Test health check: https://your-service.onrender.com/health
✓ Test signup: /signup
✓ Test login with admin: admin@admin.com / admin@123
✓ Check logs for any errors
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Database connection failed" | Verify DATABASE_URL in environment variables |
| "relation 'users' does not exist" | Run schema.sql in PostgreSQL console |
| Port binding error | PORT should be 3000, let Render assign actual port |
| Static files 404 | Ensure `public/` folder is in repository |
| Timeout on login | Check location (must be CUTM or localhost) |

## Files Modified for Deployment

1. **server.js** - Switched from MySQL to PostgreSQL
2. **package.json** - Replaced `mysql2` with `pg`
3. **.env.example** - Updated for DATABASE_URL format
4. **README.md** - Added deployment instructions
5. **schema.sql** - New file for Postgres schema (run manually)

## Auto-Deploy Setup

Once deployed:
- Push changes to `main` branch
- Render automatically rebuilds and deploys
- Check deploy logs at render.com dashboard
