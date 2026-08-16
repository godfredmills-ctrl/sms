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

The student login is attached to one named student, and the demo course
material and quizzes are seeded into **that student's class** so the portal is
populated on first sign-in. Set `SEED_DEMO_STUDENT` to a different admission
number or full name to move it:

```
SEED_DEMO_STUDENT="GCS/2024/0390"      # default
SEED_DEMO_STUDENT="Priscilla Quartey"  # by name also works
```

The seed prints who it landed on and which class was populated.

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

   > That same safety means `SEED_ON_BOOT` will **not** re-seed a database that
   > already has users — it exits quietly. To deliberately rebuild an existing
   > demo, open the service's **Console** in Railway and run `npm run db:seed`
   > (or `npm run db:seed:force` if `tsx` was pruned). That wipes first.

   If you have enabled the Postgres TCP proxy, `npm run db:seed` from your
   machine works too, using `DATABASE_PUBLIC_URL` as `DATABASE_URL`.
6. **Set up file storage** — uploads written inside the container are lost on
   every redeploy, so pick one:

   **Object storage (recommended).** Any S3-compatible store works. Cloudflare R2:

   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_BUCKET=sms
   S3_REGION=auto
   S3_ACCESS_KEY_ID=<R2 API token key id>
   S3_SECRET_ACCESS_KEY=<R2 API token secret>
   ```

   > `S3_ENDPOINT` must **not** include the bucket name. R2's dashboard shows a
   > combined `…r2.cloudflarestorage.com/sms` URL; the bucket belongs in
   > `S3_BUCKET`. Getting this wrong fails with an opaque 403 rather than a 404,
   > so the app checks for it and says so on the integrations page.
   >
   > **Keep the bucket private.** Every file is served through
   > `/api/files/[id]`, which applies access control per request. A public
   > bucket bypasses that entirely — medical forms and fee statements sit in the
   > same bucket as the school logo.

   **Or a volume.** Attach one at `/data` and set `STORAGE_LOCAL_DIR=/data/uploads`.

   `/api/health` reports which driver is active and warns when uploads are
   ephemeral. Settings → Integrations verifies the bucket for real.
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
prisma/schema.prisma     The domain model — 113 models across every module
prisma/seed.ts           Deterministic demo school

src/lib/
  auth.ts                Sessions, sign-in, guards
  rbac.ts                Permission catalogue and role presets
  db.ts                  Prisma client
  settings.ts            School-editable settings, with env as the fallback
  finance.ts             Billing, part payments, allocation, plans, statements
  grading.ts             CA/exam weighting, report cards, positions, transcripts
  reporting.ts           Report dataset catalogue (browser-safe)
  reporting-data.ts      The queries behind it (server-only)
  excel.ts               Import and export, with formula-injection escaping
  templates.ts           Certificate and transcript layout model
  image-transforms.ts    Image edit vocabulary (browser-safe)
  images.ts              The sharp pipeline behind it (server-only)
  site-blocks.ts         Website block vocabulary
  storage.ts             Uploads and access-controlled file serving
  payments/              Paystack · Hubtel · mock gateway abstraction
  messaging/             Email · SMS · push · in-app, jobs, templates, reminders
  ai/                    Claude client and the domain analytics built on it

src/components/
  ui.tsx                 Design-system primitives
  data-table.tsx         Sorting, filters, tags, search, export, mobile reveal
  select-search.tsx      Searchable, groupable, multi-select dropdown
  charts.tsx             Validated, accessible chart primitives
  app-shell.tsx          Navigation frame
  tab-nav.tsx            Section tabs, active state from the pathname
  ai-insight.tsx         Insight renderer
  family-tree.tsx        Generational family tree

src/app/
  (auth)/login           Sign-in
  (app)/                 Authenticated application
  site/                  The school's public website
  api/                   Webhooks, cron, files, media, export, push, health
  pay/mock               Simulated checkout for the mock gateway
```

### Conventions worth knowing

- **Money is always integer minor units** (pesewas). Nothing outside
  `src/lib/money.ts` handles money as a float.
- **A payment is never tied to one invoice.** It is recorded once and then
  *allocated* across invoices, which is what makes part payments, over-payments
  and credit balances behave correctly.
- **Permissions drive the UI.** The sidebar is derived from the signed-in user's
  permissions, so a link is never shown that leads to a wall. Reporting, export
  and search re-check the permission on the *data*, not just on the feature — a
  report builder must not become a way around a read permission.
- **Files are never static paths.** Every read goes through `/api/files/[id]`,
  which applies access control per request.
- **Destructive-by-default operations aren't.** Bulk billing and spreadsheet
  import both default to a dry run; retirement is preferred over deletion
  wherever history would otherwise be lost (dropdown options, custom fields with
  captured values, discounts, document templates that have issued documents).
- **Server-only modules are marked.** `reporting-data.ts`, `excel.ts` and
  `images.ts` carry `import "server-only"`, and their browser-safe halves are
  separate files. This is not cosmetic: before the split, one client component
  importing a field label pulled Prisma into the bundle and inflated a page from
  3.75 kB to 32.8 kB.
- **Anything user-supplied is rendered as text.** The website builder has no
  raw-HTML block and never uses `dangerouslySetInnerHTML`; CSV and Excel exports
  escape leading `=`, `+`, `-` and `@` so a notes field cannot become a formula.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Applies migrations, then serves |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:check` | Non-destructive: is the database reachable, and what is in it? |
| `npm run db:seed` | Rebuild the demo school — **wipes first** |
| `npm run db:seed:force` | Same, but fetches `tsx` on demand (for a container where dev dependencies were pruned) |
| `npm run db:studio` | Prisma Studio |
| `npm run typecheck` | TypeScript, no emit |
| `node scripts/generate-icons.mjs` | Regenerate the PWA icon set |

---

## What is in the system

Every module below has a working interface on top of the data model.

**People** — students (advanced table plus a ten-tab profile covering demographics,
background, medical history and allergies, guardians, family tree, education
history, academics, attendance, fees, documents and conduct), admissions,
spreadsheet import, staff records and profiles, the guardian register.

**Academics** — class levels and sections, subjects and the curriculum map,
academic years and terms with locking, a timetable grid that detects teacher
clashes across every class, attendance registers, the gradebook, and report
cards that generate as PDFs and can be emailed home a class at a time.

**Finance** — fee categories and structures, bulk billing with a dry run,
invoices and printable documents, payment recording, receipts, discounts and
scholarships, automated reminder rules, and online payment by mobile money,
card, bank transfer and USSD.

**Communication** — announcements, bulk email and SMS with cost estimates,
memos with acknowledgement tracking, a direct-message inbox, notifications.

**Operations** — the document cabinet with previews, secret-ballot elections
with live results, the custom report builder over seven datasets, Excel export,
transcripts and certificates with a template designer, PDF generation and
public verification.

**Learning** — the VLE: courses, modules, lessons, assignments and marking,
quizzes (authoring, timed sitting, automatic marking, a queue for the essays
the machine cannot mark), and the student-facing lesson viewer.

**Website** — page builder with a block vocabulary, media library with a
non-destructive image editor, and a public site at `/site`.

**System** — settings (school profile, customisable dropdowns, custom fields,
grading scales, integrations), users and roles with a 90-permission catalogue,
audit trail, global search, account and notification preferences.

**Portals** — separate student and parent portals, each scoped to what that
person is entitled to see, including downloading their own certificates and
transcripts as PDFs.

**Platform** — PWA (installable, offline shell, push notifications), AI insights
throughout (management brief, teaching effectiveness, student progress, at-risk
scan, finance analysis, report-card remarks, report narratives).

### Known limits

- **Generated PDFs use the standard PDF fonts (Helvetica).** A template that
  needs a school's own typeface, or a script other than Latin, will fall back.
  The on-screen version and the print stylesheet use the real fonts.
- **A certificate's background artwork is embedded; images placed inside the
  layout are not.** Use the page background for artwork.
- **Report charts group and sum; they do not aggregate by other functions.**
  A bar or line chart totals each numeric column by the first text column.
  Averages, counts and medians are not offered — build those into the dataset
  or read them off the table.
