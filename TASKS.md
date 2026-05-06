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
| PARENT-02-BE | PARENT-02 | Enrollment Request API | DONE | Parent enrollment submit/list endpoints and parent-safe branch/batch catalog endpoints added under `/api/student` |
| PARENT-03-BE | PARENT-03 | Admin Enrollment Approval API | DONE | Admin enrollment queue and action routes added with approval, rejection, suspension, and fee-ledger side effect |
| PARENT-04-BE | PARENT-04 | Parent Dashboard Summary API | DONE | Parent dashboard summary endpoint added under `/api/student/dashboard` |
| INST-01-BE | INST-01 | Instructor Batches + Roster API | DONE | Instructor batch list and batch roster routes added under `/api/instructor/batches` |
| INST-02-BE | INST-02 | Attendance Mark + View API | DONE | Instructor attendance mark/list endpoints + parent attendance endpoint implemented with date filtering and idempotent upsert |
| INST-03-BE | INST-03 | Progress Assessments API | DONE | Instructor assessment create/update/list/share endpoints + parent shared assessments endpoint implemented with batch/ownership enforcement |
| PAY-01-BE | PAY-01 | Fee Ledger API | DONE | Admin fee generation/list/waive/discount routes + parent fee listing route implemented with idempotent monthly generation |
| PAY-02-BE | PAY-02 | Razorpay Payment Initiation API | DONE | Parent payment initiation route added with owned-ledger validation, Razorpay order creation, audit logging, and persisted payment context for webhook follow-up |
| PAY-03-BE | PAY-03 | Razorpay Webhooks API | DONE | Webhook route added with signature verification, idempotent payment capture/failure handling, fee-ledger reconciliation, and audit logging |
| PAY-04-BE | PAY-04 | Razorpay Subscriptions API | DONE | Parent subscription create/list routes and admin cancel route added; subscription activation/charge/pause/cancel webhooks now update local payment lifecycle and recurring fee-ledger state |
| NOTIF-01-BE | NOTIF-01 | Push + SMS Notifications | DONE | Notification adapter added for push/SMS logging and delivery; push subscription auth route, core business-event hooks, and fee-due reminder script implemented |
