# Anomly detection (Cluster)

Prepare for deployment on Render (free):

- Ensure `package.json` contains a `start` script (it does: `node server.js`).
- Set required environment variables in Render dashboard: `PORT`, `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `SESSION_SECRET`.

Quick local test:

```powershell
npm install
copy .env.example .env
# edit .env and set DB credentials
npm start
```

Deploy to Render:

1. Push repository to GitHub.
2. Create a new Web Service on Render and connect the GitHub repo.
3. Set the environment variables in the Render service settings using the keys above.
4. Use the default build and start (Render will run `npm install` and `npm start`).

Notes:
- This app expects a MySQL database; Render free does not provide MySQL by default. Use an external MySQL provider or Render managed database (if available) and set `DB_*` vars accordingly.
- The app writes `block.log` to disk; on Render this is ephemeral storage — consider using a persistent logging service for production.
