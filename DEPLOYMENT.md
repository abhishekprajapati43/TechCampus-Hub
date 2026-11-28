# Deploying TechCampus Hub

## Current production setup

| Resource | Where | URL / notes |
|---|---|---|
| Frontend | **Vercel** (static) | <https://techcampushub-frontend.vercel.app> |
| Backend | **Render** (Docker, free) | <https://techcampus-hub-backend.onrender.com> |
| Database | **Render Postgres** (free) | `techcampushub-db` — free instance expires **Dec 28, 2026** |

- Backend health: <https://techcampus-hub-backend.onrender.com/api/health>
- Render service name: `techcampus-hub-backend` (hyphenated — it is **not**
  `techcampushub-backend`; `js/env.js` and `render.yaml` must match this).
- Required backend env vars: `PG_CONNECTION_URL` (Internal Database URL),
  `JWT_SECRET`, `APP_BASE_URL`, `CORS_ALLOWED_ORIGINS` (must include the Vercel
  origin), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REQUIRE_EMAIL_VERIFICATION=false`.
- Pushing to `main` redeploys the Vercel frontend automatically. The Render
  backend may need **Manual Deploy** if auto-deploy is off.

---

The Render Blueprint below provisions the same stack entirely on Render
(backend + Postgres + static site):

| Resource | Name | What it is |
|---|---|---|
| Web service (Docker) | `techcampushub-backend` | Spring Boot API |
| PostgreSQL | `techcampushub-db` | Managed Postgres (free plan) |
| Static site | `techcampushub-frontend` | The HTML/JS frontend |

Total cost: **₹0** — all three use Render's free plan (no credit card).
Frontend and backend are separate origins, so CORS is configured on the
backend via `CORS_ALLOWED_ORIGINS`.

> **Heads-up on free tier**
>
> - The backend **sleeps after 15 min without traffic** → first request after
>   idle takes ~60 s (cold start), then it's fast.
> - Free Postgres **expires after 30 days** (+ short grace period). For a demo
>   this is fine: recreate the database and restore from a dump if needed.
> - Free tier **blocks outbound SMTP** → e-mail verification is disabled
>   (`REQUIRE_EMAIL_VERIFICATION=false`), so login works without mail.

---

## 1. Push the code to GitHub

Everything must be on GitHub (this repo:
`https://github.com/abhishekprajapati43/TechCampus-Hub`). Render deploys from
the **`main`** branch.

```bash
git push origin main
```

## 2. Create the Blueprint on Render

1. Sign up / log in at <https://render.com> → **Continue with GitHub**
   (authorize Render to read your repos).
2. Dashboard → **New +** → **Blueprint**.
3. Connect/select the repo **TechCampus-Hub**.
4. Render reads `render.yaml` and shows the three resources.
   When prompted for **`ADMIN_PASSWORD`**, type the admin password you want
   for the live site (choose something strong and **save it** — the seeded
   admin account uses it).
5. Click **Apply / Deploy**.

First build takes ~5–10 min (Maven downloads + compile + image push).

## 3. Verify the deployment

- Backend health check — open
  `https://techcampushub-backend.onrender.com/api/health`
  → should return `{"status":"UP"}` (if it hangs ~60 s first, the service was
  just waking up — refresh).
- Frontend — open `https://techcampushub-frontend.onrender.com`
  → the login page loads, sign in, open a course note → PDF viewer works.

### If a URL doesn't match

Render URLs are derived from the service name. If the exact name was already
taken, Render appends a suffix (e.g. `techcampushub-backend-xxxx.onrender.com`).
In that case update **three places** with the real URLs, then push:

1. `TechCampusHub-Frontend/js/env.js` → `PROD_API` (backend URL)
2. `render.yaml` → `APP_BASE_URL` (backend URL)
3. `render.yaml` → `CORS_ALLOWED_ORIGINS` (frontend URL first in the list)

Render redeploys automatically on push (`autoDeployTrigger: commit`).

## 4. Post-deploy checklist

- [ ] `/api/health` → `UP`
- [ ] Frontend loads, login works with the `ADMIN_PASSWORD` you chose
- [ ] Create a course + note as admin, open it as a student role
- [ ] Search + autocomplete return only the right program's content
- [ ] Favourite toggle survives a refresh (DB-backed)
- [ ] Save the Render URLs somewhere (emails, share links)

---

## Local development (unchanged)

```bash
# Backend — needs local PostgreSQL (localhost:5432/techcampushub_db)
cd TechCampusHub-Backend
mvnw.cmd spring-boot:run

# Frontend: start-project.bat, or VS Code Live Server on TechCampusHub-Frontend
```

Opened from `localhost`, the frontend talks to `http://localhost:8080`
automatically; deployed, it talks to `PROD_API`. One-off override:
`?api=<url>`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Frontend: CORS error in console | Backend `CORS_ALLOWED_ORIGINS` must list the **exact** frontend origin (scheme + host, no trailing `/`) |
| `/api/health` refuses connection | Service still building, or crashed — check **Logs** tab on Render |
| `FATAL: password authentication failed` / DB unreachable | Blueprint didn't wire the DB — service env `PG_CONNECTION_URL` must come **from `techcampushub-db` → `connectionString`** |
| `Invalid JWT` errors after redeploy | `JWT_SECRET` was regenerated — it is `generateValue: true` (stable per service, but don't hardcode it anywhere) |
| Build fails with OOM in Maven step | Raise `MAVEN_OPTS` heap in `TechCampusHub-Backend/Dockerfile` |
| Admin login fails | You chose `ADMIN_PASSWORD` at Blueprint creation — that value, not `Admin@1234`, is seeded on the **first** deploy only |

## Files that control deployment

| File | Role |
|---|---|
| `render.yaml` | Blueprint: services, database, env vars |
| `TechCampusHub-Backend/Dockerfile` | Multi-stage Maven build + JRE runtime |
| `TechCampusHub-Backend/.dockerignore` | Keeps build context clean |
| `TechCampusHub-Frontend/js/env.js` | Backend URL for the frontend |
| `TechCampusHub-Backend/docs/ENVIRONMENT.md` | Full env-var reference |

### Deploying elsewhere

The Dockerfile is platform-agnostic (Railway, Fly.io, any host with Docker):
run the container, provide `DB_URL` (JDBC), `JWT_SECRET`, `APP_BASE_URL`,
`CORS_ALLOWED_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. The app also honors
libpq-style `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` if you link a
different Postgres.
