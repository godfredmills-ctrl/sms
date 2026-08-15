# School Management System

A school-operations platform for Ghanaian international schools: student records,
attendance, assessment and grading, fees and payments, multi-channel communication,
elections, documents and learning — with staff, student and parent portals.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · PostgreSQL via
Prisma · deployed on Railway. Progressive web app with push notifications.
AI features run on the Claude API.

---

## Getting started

### 1. Requirements

- Node.js 20 or newer
- A PostgreSQL database (Railway, Neon, Supabase, or local)

### 2. Configure

```bash
cp .env.example .env
```

Then set, at minimum:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | 32+ random characters — `openssl rand -base64 48` |
| `APP_URL` | The origin the app is served from |

Everything else is optional. Without provider keys the system runs on **mock**
providers for payments, SMS and email — the full flow works end to end and every
message is logged to the console instead of being sent.

### 3. Create the schema and seed a demo school

```bash
npm install
npm run db:migrate     # creates the tables
npm run db:seed        # ~450 students, staff, marks, registers, invoices, payments
npm run dev
```

Open <http://localhost:3000>.

The seed prints its sign-in accounts. The default password for staff accounts is
whatever `SEED_ADMIN_PASSWORD` is set to (`ChangeMe123!` out of the box):

| Role | Email |
| --- | --- |
| System Administrator | `admin@school.edu.gh` |
| Head Teacher | `head@goldencrest.edu.gh` |
| Bursar | `bursar@goldencrest.edu.gh` |
| Form Teacher | `teacher@goldencrest.edu.gh` |
| Parent / Guardian | `parent@goldencrest.edu.gh` — password `Parent123!` |
| Student | `student@goldencrest.edu.gh` — password `Student123!` |

The seed is deterministic and re-runnable: `npm run db:seed` wipes and rebuilds
the same school every time.

---

## Deploying to Railway

1. **Create the project** and add a **PostgreSQL** service.
2. **Add this repo** as a service. Railway detects Node and runs `npm run build`.
3. **Set variables** on the app service:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
   NEXT_PUBLIC_APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
   SESSION_SECRET=<long random string>
   CRON_SECRET=<long random string>
   ```

   > **Do not set `NODE_ENV`.** Railway and the build set it themselves. Setting
   > it by hand — especially as `NODE_ENV="production"`, where a raw editor keeps
   > the quotes as part of the value — makes Next.js reject it. Combined with a
   > warm build cache written under a different `NODE_ENV`, the build then fails
   > with `<Html> should not be imported outside of pages/_document` while
   > prerendering `/404`, an error that points nowhere near the real cause.
   >
   > `scripts/build.mjs` normalises the value before Next sees it, so this is
   > handled — but the variable is still better removed. Values in
   > `.env.example` are unquoted for the same reason.

4. **Deploy.** `scripts/start.mjs` applies pending migrations and then starts the
   server. A database problem is logged loudly but does **not** stop the server
   from listening — otherwise the platform reports only "service unavailable"
   and you learn nothing about the cause.

   `/api/health` returns **200 whenever the process is serving**, and reports the
   database separately, so a slow Postgres never fails a deploy:

   ```jsonc
   { "status": "ok",       "database": "connected",   "migrations": "applied" }
   { "status": "degraded", "database": "unreachable", "error": "…", "hint": "…" }
   { "status": "degraded", "database": "not_configured", "hint": "…" }
   ```

   If a deploy goes wrong, `curl https://<your-domain>/api/health` is the first
   thing to check — it names the problem.
5. **Seed once** (optional, for a demo instance). A Railway Postgres is only
   reachable from inside the project's private network, so there is usually no
   way to run the seed from a laptop. Set `SEED_ON_BOOT=true` on the app service
   and redeploy — the container seeds itself, then **remove the variable**.

   It is safe to leave on by accident: the seed exits without writing if any
   user already exists, and it runs *after* the server is listening so a long
   seed cannot fail the health check.

   If you have enabled the Postgres TCP proxy, `npm run db:seed` from your
   machine works too, using `DATABASE_PUBLIC_URL` as `DATABASE_URL`.
6. **Attach a volume** at `/data` and set `STORAGE_LOCAL_DIR=/data/uploads` if you
   want uploaded files to survive redeploys.
7. **Schedule fee reminders** — add a Railway cron service that runs hourly:

   ```
   curl -fsS -X POST "$APP_URL/api/cron/reminders" -H "Authorization: Bearer $CRON_SECRET"
   ```

---

## Integrations

All of these are optional and degrade to a mock implementation when unset.

### Payments — Paystack (recommended for Ghana)

One integration covers **mobile money** (MTN, Telecel, AirtelTigo), **cards**,
**bank transfer** and **USSD**.

```
PAYMENT_PROVIDER=paystack
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
```

Point the Paystack webhook at `https://<your-domain>/api/webhooks/payments`. The
route verifies the HMAC signature, rejects amount mismatches, and is idempotent —
a replayed webhook cannot double-credit an account.

Hubtel is supported as an alternative (`PAYMENT_PROVIDER=hubtel`).

### SMS

```
SMS_PROVIDER=arkesel   # or mnotify | hubtel
ARKESEL_API_KEY=...
SMS_SENDER_ID=SCHOOL
```

Segment counts and per-message cost are computed before sending, so a bulk send
shows what it will cost before it goes out.

### Email

```
EMAIL_PROVIDER=smtp
SMTP_HOST=...
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM="School Admin <noreply@school.edu.gh>"
```

### Push notifications

```bash
npx web-push generate-vapid-keys
```

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@school.edu.gh
```

### AI (Claude)

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
```

Powers the management brief, teaching-effectiveness analysis, student progress
insights, the at-risk scan, finance analysis, drafted report-card remarks and
narrative on custom reports. Every insight is stored with the exact data it was
generated from, so a figure can always be checked. With no key, AI panels show a
clear "switched off" state and nothing else changes.

---

## Architecture

```
prisma/schema.prisma     The domain model — ~95 models across every module
prisma/seed.ts           Deterministic demo school

src/lib/
  auth.ts                Sessions, sign-in, guards
  rbac.ts                Permission catalogue and role presets
  db.ts                  Prisma client
  finance.ts             Billing, part payments, allocation, plans, statements
  grading.ts             CA/exam weighting, report cards, positions, transcripts
  storage.ts             Uploads and access-controlled file serving
  payments/              Paystack · Hubtel · mock gateway abstraction
  messaging/             Email · SMS · push · in-app, jobs, templates, reminders
  ai/                    Claude client and the domain analytics built on it

src/components/
  ui.tsx                 Design-system primitives
  data-table.tsx         Sorting, filters, tags, search, export, mobile reveal
  charts.tsx             Validated, accessible chart primitives
  app-shell.tsx          Navigation frame
  ai-insight.tsx         Insight renderer
  family-tree.tsx        Generational family tree

src/app/
  (auth)/login           Sign-in
  (app)/                 Authenticated application
  api/                   Webhooks, cron, files, push, health
  pay/mock               Simulated checkout for the mock gateway
```

### Conventions worth knowing

- **Money is always integer minor units** (pesewas). Nothing outside
  `src/lib/money.ts` handles money as a float.
- **A payment is never tied to one invoice.** It is recorded once and then
  *allocated* across invoices, which is what makes part payments, over-payments
  and credit balances behave correctly.
- **Permissions drive the UI.** The sidebar is derived from the signed-in user's
  permissions, so a link is never shown that leads to a wall.
- **Files are never static paths.** Every read goes through `/api/files/[id]`,
  which applies access control per request.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Applies migrations, then serves |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Rebuild the demo school |
| `npm run db:studio` | Prisma Studio |
| `npm run typecheck` | TypeScript, no emit |
| `node scripts/generate-icons.mjs` | Regenerate the PWA icon set |

---

## Current status

The data model, permissions, and business logic cover every module listed below.
The **interface** is complete for some and still being built for others.

### Working end to end

- Authentication, sessions, role-based access control, audit logging
- Management dashboard — statistics, charts, AI brief
- Students — advanced data table, and the full profile (demographics, background,
  medical history and allergies, guardians, family tree, education history,
  academics, attendance, fees, documents, conduct)
- Attendance — class register with same-day guardian notification
- Fees — invoices, collection analytics, front-desk payment recording, AI analysis
- Parent portal — children, results, attendance, fee account, **online payment**
  (mobile money, card, bank transfer, USSD)
- Payment webhooks, automated fee reminders, scheduled jobs
- PWA — installable, offline shell, push notifications

### Data layer and logic ready, interface in progress

Gradebook, report cards, transcripts and certificates, communications
(announcements/email/SMS/memos), document cabinet, elections, custom report
builder, VLE/LMS, website builder, settings (dropdown options, custom fields,
grading scales), user and role management, audit trail viewer, staff records.

Navigating to one of these shows a page explaining what it will do rather than a
404 — the underlying models, permissions and services are already in place, so
each is an interface build on top of working foundations.
