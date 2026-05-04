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
| PARENT-02-BE | Enrollment Request API | DONE | Parent enrollment submit/list routes plus student catalog branch/batch endpoints implemented and mounted |
| PARENT-03-BE | Admin Enrollment Approval API | DONE | Admin enrollment list/approve/reject/suspend routes implemented with branch scoping, audit logging, and current-month fee ledger generation |
| PARENT-04-BE | Parent Dashboard Summary API | DONE | Parent dashboard summary route implemented with children count, active enrollments, fee due, next class, and 30-day attendance summary |
| INST-01-BE | Instructor Batches + Roster API | DONE | Instructor-scoped batch list and roster routes implemented and mounted under `/api/instructor` |
| INST-02-BE | Attendance Mark + View API | DONE | Instructor attendance mark/list routes added under `/api/instructor/attendance`; parent monthly attendance endpoint added under `/api/student/attendance`; idempotent upsert behavior implemented |
| INST-03-BE | Progress Assessments API | DONE | Instructor assessment create/update/list/share routes added under `/api/instructor/assessments`; parent shared assessment endpoint added under `/api/student/assessments` |
| PAY-01-BE | Fee Ledger API | DONE | Admin fee generation/list/waive/discount routes added under `/api/admin/fees`; parent fee list endpoint added under `/api/student/fees`; bulk idempotent generation implemented |
| PAY-02-BE | Razorpay Payment Initiation API | DONE | `POST /api/student/fees/pay` added with parent ownership and status validation; Razorpay order creation persists payment rows including ledger/month context; BE lint/typecheck passed |
| PAY-03-BE | Razorpay Webhooks API | DONE | `POST /api/webhooks/razorpay` added with HMAC verification over raw body; captured payments now mark linked fee ledgers paid and failed payments mark local payment status; BE lint/typecheck passed |
| PAY-04-BE | Razorpay Subscriptions API | DONE | `POST /api/student/fees/subscribe`, `GET /api/student/fees/subscriptions`, and `POST /api/admin/subscriptions/:id/cancel` added; subscription lifecycle webhooks now mark recurring payment state and pay the next due ledger idempotently; BE lint/typecheck passed |
