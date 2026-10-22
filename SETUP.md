# Loan Hub setup

This repository contains the Loan Hub app. It does not include shared database credentials or the supplied employee dataset. When the supplied local TSV is absent, seeding creates synthetic demo users with `example.test` email addresses.

## Prerequisites

- Node.js 20 or newer
- PostgreSQL database

## Configure and run

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `DATABASE_URL` to your own PostgreSQL connection string and replace `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `SEED_DEMO_PASSWORD`, and `PROVISION_DEFAULT_PASSWORD` with unique private values.
3. Install dependencies and generate the Prisma client:

   ```powershell
   npm install
   ```

4. Apply the database schema and create the initial admin and demo users:

   ```powershell
   npm run db:push
   npm run db:seed
   ```

   Seeding clears existing non-admin users and related demo activity. Use a disposable development database.

5. Start the app:

   ```powershell
   npm run dev
   ```

- UI: http://localhost:5173
- API: http://localhost:4000

Sign in as `admin` with the `BOOTSTRAP_ADMIN_PASSWORD` value, or use a synthetic demo account (`demo.user001` through `demo.user100`) with the `SEED_DEMO_PASSWORD` value.

## Notes

- Never commit `.env`, database credentials, bearer tokens, or real user data.
- Default passwords are not embedded in the app; configure unique passwords for local development.
- Connector provisioning is optional and requires separate configuration.
