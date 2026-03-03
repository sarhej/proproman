# DD Product Board

Persona-driven backlog manager for Doctor Digital with B2B2C prioritization.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Express + TypeScript + Prisma
- DB: PostgreSQL
- Auth: Google OAuth (session-based)
- Deploy: Railway single service

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy env values:

```bash
cp server/.env.example server/.env
```

3. Configure `DATABASE_URL`, Google OAuth credentials and callback URL.
   - Temporary local fallback (optional): set `ALLOW_DEV_AUTH=true` in `server/.env`.
4. Copy frontend env values:

```bash
cp client/.env.example client/.env
```

5. If you use temporary local fallback, also set `VITE_ENABLE_DEV_LOGIN=true` in `client/.env`.

6. Generate Prisma client and apply schema:

```bash
npm run db:generate
npm run db:migrate --workspace server -- --name init
```

7. Seed data from CIO + spreadsheet:

```bash
npm run db:seed
```

8. Start app:

```bash
npm run dev
```

9. Temporary local fallback login (development only):
   - Click `Temporary local dev login` on the sign-in screen.
   - This route is blocked in production and disabled unless `ALLOW_DEV_AUTH=true`.

## Railway deploy

1. Create Railway project and add PostgreSQL service.
2. Set service root directory to repository root.
3. Add environment variables from `server/.env.example`.
4. Set `GOOGLE_CALLBACK_URL` to `https://<your-railway-domain>/api/auth/google/callback`.
5. Deploy.
6. Run migrations and seed:

```bash
npm run db:generate
npm run db:migrate --workspace server -- --name init
npm run db:seed
```

## Views

- Domain Board (drag and drop by domain)
- Priority Grid
- Owner Board
- Stakeholder Heatmap
- Buyer x User Matrix
- Gaps view
- Initiative detail panel with Features, Decisions, Risks, Dependencies
