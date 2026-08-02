# Rank Tracker

Track keyword positions across search engines for your domains.

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3)
- **Auth**: Session-based (bcrypt password hashing)

## Getting Started

```bash
npm install
npm start
```

The API runs on `http://localhost:3000`.

## API Endpoints

### Auth
- `POST /api/auth/signup` — create account (`email`, `password`)
- `POST /api/auth/login` — log in (`email`, `password`)
- `POST /api/auth/logout` — end session
- `GET /api/auth/me` — get current user info

### Projects
- `GET /api/projects` — list your projects
- `POST /api/projects` — create project (`name`, `domain`)
- `GET /api/projects/:id` — get project details
- `PUT /api/projects/:id` — update project
- `DELETE /api/projects/:id` — delete project

### Keywords
- `GET /api/projects/:id/keywords` — list keywords in a project
- `POST /api/projects/:projectId/keywords` — add keyword (`keyword`, `search_engine`)
- `DELETE /api/projects/:projectId/keywords/:id` — remove keyword

### Rank Checks
- `GET /api/projects/:projectId/keywords/:id/rank-checks` — get rank history
- `POST /api/projects/:projectId/keywords/:id/rank-checks` — record rank (`position`, `search_engine`)

## Data Model

```
users → projects → keywords → rank_checks
```

Multi-tenancy: every query filters by the authenticated user — users only see their own data.