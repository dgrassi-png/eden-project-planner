# Architecture V0

## System
Browser -> Next.js application -> Supabase/Postgres.

Server-side adapters connect to Trello and optional AI providers. Provider secrets never reach browser code.

## API
Projects:
- GET /api/projects
- GET /api/projects/:id

Tasks:
- GET/POST /api/projects/:id/tasks
- PATCH/DELETE /api/tasks/:id

Dependencies:
- POST /api/dependencies
- DELETE /api/dependencies/:id

Trello:
- POST /api/tasks/:id/sync-trello
- POST /api/projects/:id/sync-trello
- GET /api/projects/:id/trello-sync-status

AI:
- GET /api/projects/:id/ai-context
- POST /api/projects/:id/change-proposals
- GET /api/change-proposals/:id
- POST /api/change-proposals/:id/apply
- POST /api/change-proposals/:id/reject

## Scheduling
Tasks can be scheduled, partially scheduled, or unscheduled. Default calendar is Monday-Friday. Finish is derived from start + working-day duration. Milestones have zero duration.

Dependency violations produce warnings. Explicit cascade may move successors forward; DONE tasks never move silently.

## Trello idempotency
Cards contain:
`EDEN_PLANNER_ID:<task_uuid>`
`EDEN_CODE:<eden_code>`

If a stored card ID exists, update it. Create only when no mapping exists. Bulk sync always has dry-run preview.

## AI mutation policy
Default `AI_MUTATIONS_REQUIRE_APPROVAL=true`.

Agents may read, summarize, explain impact and propose. Canonical writes occur through proposal review/apply.

## Audit
Record actor type (USER, CHATGPT, CLAUDE, SYSTEM, TRELLO_SYNC), actor ID, action, entity, before/after JSON, metadata and timestamp.
