# D-DanceBE

Backend repository for the Dance Institute app.

## Stack

- Node.js
- Express
- TypeScript
- MongoDB / Mongoose
- Zod validation
- Pino logging

## Initial scope

This setup corresponds to the backend portions of:

- `FOUND-01` Monorepo Bootstrap, adapted to separate repo layout
- `FOUND-04` Express API Skeleton, partially scaffolded

## Next steps

1. Install dependencies with `pnpm install`
2. Copy `.env.example` to `.env`
3. Run `pnpm dev`
4. Continue with Sprint 2 backend auth work

## Local role seed

To create usable local admin and instructor accounts plus one branch/course/batch:

```bash
pnpm seed:dev
```

Seeded login phones:

- `super_admin`: `9990000001`
- `branch_admin`: `9990000002`
- `instructor`: `9990000003`

When `OTP_PROVIDER=mock`, the OTP is always `123456`.

## Public demo mode

The hosted demo can expose four role-based, read-only accounts on the login
screen. Configure the backend (for example, in Railway) with:

```env
DEMO_MODE=true
DEMO_OTP_CODE=123456
OTP_PROVIDER=mock
```

Then seed the demo data once per database (the command is safe to run again):

```bash
pnpm seed:demo
```

Demo phones are `9990000001` through `9990000004` for super admin, branch
admin, instructor, and customer/family respectively. In demo mode, OTP login
is restricted to those accounts and authenticated demo users may only make
read requests. Disable `DEMO_MODE` before connecting the deployment to real
users or enabling a real OTP provider.

## Workspace docs

Use the workspace agent entry document for project-wide workflow:

- [ENTRYPOINT.md](/home/vishnu/Projects/Dance%20Web%20App/docs/agent-dev/ENTRYPOINT.md)
