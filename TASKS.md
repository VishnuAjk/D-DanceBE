# Backend Tasks

| Ticket ID | Original Ticket | Title | Status | Notes |
|-----------|-----------------|-------|--------|-------|
| FOUND-01-BE | FOUND-01 | Backend Repo Bootstrap | DONE | Split-repo adaptation of monorepo bootstrap |
| FOUND-02-BE | FOUND-02 | CI Pipeline | DONE | GitHub Actions CI and deploy workflows added for backend repo |
| FOUND-03-SHARED | FOUND-03 | Shared Types + Zod Schemas Package | DONE | Consumed through local file dependency |
| FOUND-04-BE | FOUND-04 | Express API Skeleton | DONE | Core shell verified with install, compile, build, and runtime route checks |
| FOUND-05-BE | FOUND-05 | MongoDB Connection + Base Models | DONE | DB connection retry logic and base models verified with in-memory MongoDB boot |
| AUTH-01-BE | AUTH-01 | OTP + JWT Backend | DONE | Mock OTP flow, JWT issuance, refresh cookie handling, and auth endpoints implemented |
| AUTH-02-BE | AUTH-02 | RBAC Middleware + Audit Log | DONE | Reusable RBAC middleware, audit log persistence helper, and guard tests implemented |
| DOMAIN-01-BE | DOMAIN-01 | All Remaining Domain Models | DONE | Remaining domain schemas created with required idempotency and uniqueness indexes |
| DOMAIN-02-BE | DOMAIN-02 | Admin: Branches, Courses, Batches API | DONE | Admin CRUD/list routes added for branches, courses, levels, and batches with roster endpoint and audit hooks |
| DOMAIN-03-BE | DOMAIN-03 | Admin: User Management API | DONE | Admin user routes and policy helper added for role/status updates, branch assignment, and scoped account creation |
| PARENT-01-BE | PARENT-01 | Children Management API | DONE | Parent child routes added under `/api/student/children` with ownership checks and active-enrollment delete guard |
