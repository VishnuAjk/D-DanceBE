# Backend Progress Tracker

| Ticket ID | Title | Status | Evidence |
|-----------|-------|--------|----------|
| FOUND-01-BE | Backend Repo Bootstrap | DONE | Git repo initialized, env template added, package metadata created, TypeScript source scaffolded, local server runnable |
| FOUND-02-BE | CI Pipeline | DONE | CI and deploy workflows added; install, lint, test, typecheck, and build scripts verified locally |
| FOUND-04-BE | Express API Skeleton | DONE | Package install passed; typecheck and build passed; `/health` and missing-route runtime checks passed |
| FOUND-05-BE | MongoDB Connection + Base Models | DONE | DB bootstrap and base models implemented; runtime verification completed against in-memory MongoDB |
| AUTH-01-BE | OTP + JWT Backend | DONE | OTP send/verify, JWT utils, auth middleware, auth routes, and refresh cookie flow verified with mock OTP |
| AUTH-02-BE | RBAC Middleware + Audit Log | DONE | `requireAuth`, `requireRole`, `requireBranchAccess`, `AuditLog` model/helper, and RBAC unit tests verified |
| DOMAIN-01-BE | All Remaining Domain Models | DONE | Course, Level, AgeGroup, Batch, Child, Enrollment, Attendance, Assessment, FeeLedger, Payment, Video, and NotificationLog models added with key business indexes |
| DOMAIN-02-BE | Admin: Branches, Courses, Batches API | DONE | Admin routers for branches, courses, levels, and batches mounted with validation, branch scoping, roster listing, and audit logging |
| DOMAIN-03-BE | Admin: User Management API | DONE | Admin user list/create/update/detail/branch-assignment routes implemented with policy tests for branch-admin restrictions |
| PARENT-01-BE | Children Management API | DONE | Parent-owned child CRUD routes implemented with ownership enforcement, soft delete guard, and student router mount |
