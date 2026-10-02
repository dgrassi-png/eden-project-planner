# E Project Planner — Master Product Definition

- **Version:** 1.0
- **Status:** Product source of truth
- **Product:** Internal E Project Planning & Execution System

> This document is the product source of truth. `docs/PRODUCT_SPEC.md` is the
> V0 implementation spec derived from it; where they differ, this document
> wins unless a decision in `docs/DECISIONS.md` records otherwise.

## 1. Purpose

E Project Planner is the internal system used by E to plan, coordinate and monitor the execution of company projects.

Its primary purpose is to answer, at any moment:

- What needs to be done?
- Why does it need to be done?
- Who owns it?
- When should it start?
- How long should it take?
- What must happen before it can start?
- What will be delayed if it moves?
- What is currently blocking it?
- What is happening now?
- What should happen next?
- Which operational tasks have been sent to Trello?
- Which changes have been proposed by ChatGPT or Claude?
- What changed in the project plan and why?

The Planner must become the single planning source of truth for E.

It is not intended to replace every operational tool used by the company. Instead, it coordinates them.

## 2. The core model

The E operating system is based on three layers.

### Layer 1 — E Planner

The Planner is the strategic and planning source of truth.

It owns:

- project structure;
- workstreams;
- tasks;
- subtasks;
- milestones;
- owners;
- planned dates;
- expected duration;
- dependencies;
- priority;
- status;
- geographic constraints;
- planning assumptions;
- project impact;
- historical changes.

The Planner answers: **What is supposed to happen?**

### Layer 2 — Trello

Trello is the operational execution layer. It contains the actionable work used by the team during day-to-day execution.

Trello answers: **What do I need to do?**

The Planner can generate and update Trello cards. Trello must NOT become an alternative project-planning database.

### Layer 3 — AI assistants

ChatGPT and Claude act as an intelligent coordination layer. They can:

- read project state;
- analyze dependencies;
- identify inconsistencies;
- identify delays;
- summarize project status;
- suggest changes;
- generate new tasks;
- suggest rescheduling;
- prepare project updates;
- help maintain the plan.

AI assistants do not silently modify the canonical plan. They propose changes. Humans approve them.

## 3. System hierarchy

The fundamental hierarchy is:

Project → Workstream → Task → Subtask

A project may contain multiple workstreams. Example:

```
E / eBacco
→ Product Engineering
  → Electrical Architecture
    → Validate final ECU configuration
      → Test CAN communication
```

## 4. Permanent E task IDs

Every relevant planning item receives a permanent identifier. Examples:

`GOV-001`, `TEC-001`, `TEC-002`, `PROD-001`, `SC-001`, `CERT-001`, `EIMA-003`

Subtasks may use: `TEC-001.1`, `TEC-001.2`, `TEC-001.3`

The identifier is permanent. Changing the task name must never change its identifier.

This allows the same task to be referenced consistently across:

- Planner;
- Trello;
- ChatGPT;
- Claude;
- emails;
- meetings;
- documentation;
- future integrations.

## 5. Task model

Every task may contain:

**Identity**
- E code
- title
- description
- project
- workstream
- parent task

**Responsibility**
- owner
- contributors

**Planning**
- planned start
- planned duration
- planned finish
- milestone flag

**Execution**
- status
- progress
- priority

**Dependencies**
- predecessors
- successors
- lag

**Operational context**
- geographic requirement
- blocker
- waiting for
- notes

**Integration**
- Trello card
- Trello sync state

**Governance**
- created by
- updated by
- last update
- audit history

Unknown information remains unknown. The application must never invent dates, duration, ownership or progress.

## 6. Status model

Tasks use the following statuses:

- **BACKLOG**: known work, not yet ready to execute.
- **READY**: can be started.
- **IN_PROGRESS**: currently being executed.
- **WAITING_BLOCKED**: cannot progress because of an external dependency, decision, supplier, technical issue or other blocker.
- **DONE**: completed.
- **CANCELLED**: no longer required.

Milestone is not a status. A milestone is a planning item with zero duration.

## 7. Priority

- **P0**: critical. Delay has immediate or material project consequences.
- **P1**: important. Should be executed within the planned timeframe.
- **P2**: normal. Useful but can move without immediate project impact.
- **P3**: low priority. Optional, opportunistic or future work.

## 8. Geographic requirement

Every task can specify where it can be performed.

- **CECINA_REQUIRED**: physical presence in Cecina is required. Examples: work on eBacco; wiring; vehicle testing; physical assembly; component inspection.
- **CECINA_PREFERRED**: can theoretically be performed remotely but is more effective in Cecina.
- **REMOTE_OK**: no physical presence required.
- **ANYWHERE**: no relevant location constraint.

This information must be machine-readable because it can later be used by E's Personal Assistant for calendar planning.

## 9. The Gantt is the primary planning interface

The primary view of the application is a real interactive Gantt.

It is not a spreadsheet. It is not a colored weekly grid. It is not a static visualization.

The Gantt represents actual database planning data.

## 10. Gantt structure

The primary screen should approximately contain:

```
Task | Owner | Duration | Status | Dependencies || Timeline
```

The left side contains project information. The right side contains the time dimension. The two remain vertically synchronized.

## 11. Gantt behavior

The Gantt must support:

- task bars generated from dates;
- proportional duration;
- milestones;
- dependencies;
- today marker;
- workstream grouping;
- nested tasks;
- expand/collapse;
- week zoom;
- month zoom;
- quarter zoom;
- horizontal navigation;
- task selection;
- drag task;
- resize task;
- dependency visualization.

Moving a task updates its planning dates. Resizing a task updates its duration. Changing planning data updates the Gantt.

The database and Gantt must always represent the same state.

## 12. Unscheduled work

Not every task will immediately have a validated date. The application must therefore support:

- **Scheduled tasks**: start and duration are known.
- **Partially scheduled tasks**: some planning information exists but is incomplete.
- **Unscheduled tasks**: the task exists but has no validated schedule.

Unscheduled tasks must remain visible and usable. They must never be assigned arbitrary dates simply so they can appear on the Gantt.

## 13. Dependencies

V0 supports Finish-to-Start dependencies.

Example: TEC-001 must finish before TEC-002 can start.

Dependencies can include lag. Example: testing may start two days after assembly finishes.

## 14. Dependency impact

Moving a task must not silently reschedule the entire project.

Example: TEC-001 moves forward by five days. The system detects that TEC-002 now violates its dependency. The Planner should show:

> Moving TEC-001 creates a 5-day conflict with TEC-002.

The user may then:

- keep the conflict;
- manually modify TEC-002;
- explicitly cascade affected tasks.

Automatic cascade must always be an explicit action. DONE tasks must never be silently rescheduled.

## 15. Project impact analysis

The system should progressively become capable of answering:

- Which tasks are blocked?
- Which milestones are at risk?
- Which dependencies are violated?
- Which tasks have no owner?
- Which tasks have no validated duration?
- Which tasks have no schedule?
- Which P0 tasks are currently blocked?
- Which activities changed this week?
- What is preventing the next milestone?

This should eventually become one of the core advantages over Trello alone.

## 16. Trello role

The existing E Trello board is the operational execution environment.

Target board: `https://trello.com/b/9n93W4ym/eden`

Do not create another E board.

## 17. Planner → Trello synchronization

Initial synchronization is Planner → Trello. Planner is authoritative for planning information. A Planner task can create or update a Trello card.

Example:

- Planner: `TEC-001` Stabilizzazione ECU / controller / cablaggio
- Trello: `[TEC-001] Stabilizzazione ECU / controller / cablaggio`

## 18. Trello mapping

Typical mapping:

| Planner | Trello |
|---|---|
| E code + title | card title |
| Owner | Trello member |
| Planned finish | due date |
| Workstream | label |
| Status | list |
| Description | compact operational context |
| Subtasks | checklist items or dedicated child cards where appropriate |

## 19. Trello synchronization safety

Synchronization must be idempotent. Every mapped card must have a persistent relationship with its Planner task. The system must never create duplicates simply because synchronization was run twice.

Each linked Trello card should contain machine-readable identifiers such as:

```
EDEN_CODE
EDEN_PLANNER_ID:<UUID>
```

Before bulk synchronization the user should see a preview. Example:

```
12 cards unchanged
3 cards will be updated
2 cards will be created
1 mapping error
```

Then: **Confirm Sync**.

## 20. Trello is not the planning master

If someone changes a Trello due date manually, that does not automatically redefine the project plan.

In V0: Planner → Trello, not Planner ↔ Trello.

Bidirectional synchronization may be considered later only if conflict resolution is properly designed.

## 21. AI role

ChatGPT and Claude act as planning assistants. They may access structured project context through the Planner. They should be capable of understanding:

- current tasks;
- owners;
- status;
- milestones;
- blockers;
- dependencies;
- planning dates;
- Trello synchronization;
- recent changes.

## 22. AI use cases

Example requests:

- What is blocking certification?
- Which P0 tasks are currently waiting?
- What changed since last week?
- We received a two-week supplier delay. What does this affect?
- Create the tasks required after today's Wattius call.
- Move the ECU validation forward by three days and show the impact.
- Prepare the weekly project review.
- Which tasks should I discuss with the team tomorrow?
- What can I work on remotely?
- What tasks require me to be in Cecina?

The Planner should expose enough structured information for an AI assistant to answer these questions reliably.

## 23. AI change proposals

AI does not silently modify project state. AI produces structured proposals.

Example:

- Source: Claude
- Reason: Supplier delivery moved.
- Proposed change: SC-001 Finish: 10 October → 17 October
- Affected: PROD-002, CERT-001

The UI shows BEFORE vs PROPOSED, plus dependency impact. The user chooses **Apply** or **Reject**.

## 24. AI provider independence

The architecture must not depend exclusively on one AI provider. The system should support:

- ChatGPT;
- Claude;
- future agents.

The core planning engine must function without any AI API configured.

AI is an interface to the planning system. It is not the planning database.

## 25. Audit log

Material changes must eventually be traceable. Examples:

- Marco changed TEC-001 duration.
- Claude proposed moving CERT-001.
- Marco approved proposal.
- System synchronized TEC-001 to Trello.

The audit system records:

- actor;
- timestamp;
- action;
- entity;
- previous state;
- new state;
- reason where available.

## 26. Personal Assistant integration

The Planner should be designed so that E planning data can later feed the founder's Personal Assistant.

The Planner knows:

- priority;
- estimated duration;
- deadline;
- owner;
- dependencies;
- status;
- geographic requirement;
- whether work can be split.

The Personal Assistant can then answer a different question: **When should Marco actually work on this?**

The Planner should not become a calendar. It provides planning constraints. The Personal Assistant performs calendar optimization.

## 27. Task splitability

Tasks should eventually include: **Splittable: YES / NO**

Examples:

- Prepare investor materials: YES
- Vehicle EMC test: NO

This helps calendar scheduling systems understand whether a four-hour task can become two two-hour blocks.

## 28. Team workflow

The intended operational workflow is:

1. Define project activities in Planner.
2. Assign owner, expected duration, dependency, priority and deadline where applicable.
3. Planner creates the project timeline.
4. Relevant executable activities are synchronized to Trello.
5. Team works from Trello.
6. Project state is periodically reviewed.
7. Planner is updated.
8. AI assistants analyze changes and propose adjustments.

This creates: Plan → Execute → Observe → Adjust → Re-plan.

## 29. Weekly project review

The system should eventually support a Weekly Review view. It should highlight:

- **Completed**: what was completed since the previous review?
- **In progress**: what is currently active?
- **Blocked**: what cannot progress?
- **Slipping**: what is behind its planned position?
- **Upcoming**: what begins next?
- **Milestones**: which milestones are approaching?
- **Decisions**: which project decisions are required?
- **Unplanned**: which new activities appeared?

This should become the operating review surface for the team.

## 30. Project health

The system may eventually provide project-health indicators. However, these should be based on objective conditions. Examples:

- dependency violation;
- overdue task;
- blocked P0;
- milestone delay;
- missing owner;
- missing duration;
- unscheduled critical work.

Avoid meaningless generic "72% project health" scores. Prefer actionable information.

## 31. Search and filtering

The Planner should eventually support filtering by:

- owner;
- workstream;
- status;
- priority;
- geography;
- milestone;
- scheduled/unscheduled;
- blocked/unblocked.

Search should support:

- task title;
- E code;
- description.

## 32. Task detail

Selecting a task opens a side drawer. The drawer should eventually allow editing:

- **Identity**: code, title, description
- **Planning**: start, duration, finish, milestone
- **Execution**: owner, status, priority, progress
- **Constraints**: geography, splittable
- **Dependencies**: predecessors, successors
- **Integration**: Trello state, Trello card
- **History**: recent changes

The user should not need to leave the Gantt to perform normal planning work.

## 33. Data architecture

Canonical planning data lives in PostgreSQL through Supabase.

Supabase provides:

- PostgreSQL;
- authentication;
- database access;
- row-level security.

Next.js provides:

- web application;
- server-side application logic;
- API routes;
- integration endpoints.

Vercel hosts Next.js. No dedicated VPS/server is required for V0.

## 34. Infrastructure

Target architecture:

```
Browser
↓
Next.js / Vercel
↓
E Planning Domain
↓
Supabase / PostgreSQL
```

External integrations:

- Next.js server → Trello API
- Next.js server → AI integrations

No secrets are exposed to the browser.

## 35. Security

Never expose:

- Supabase service-role key;
- Trello token;
- OpenAI key;
- Anthropic key;
- other integration credentials.

Secrets remain server-side. Production database access must use appropriate authentication and Row Level Security.

## 36. Product UX principle

This product is an internal engineering operating tool. It should prioritize:

- information density;
- clarity;
- speed;
- traceability;
- low interaction cost.

It should not look like a marketing website. Avoid:

- giant cards;
- unnecessary animations;
- decorative dashboards;
- excessive whitespace;
- generic SaaS UI patterns that reduce usable information.

The main screen should feel closer to engineering planning software than consumer productivity software.

## 37. Desktop first

The primary usage environment is desktop. Mobile should remain usable for:

- checking tasks;
- reading status;
- quick updates.

Complex Gantt editing is not required to be optimal on a phone. Do not compromise the desktop planning experience to force full mobile Gantt functionality.

## 38. What this product is not

The E Planner is NOT:

- another Trello;
- another Notion;
- a document repository;
- a CRM;
- an accounting system;
- a calendar;
- an email client;
- a generic company ERP.

Documents remain primarily in Google Drive. Execution remains primarily in Trello. Calendar optimization belongs to the Personal Assistant.

The Planner coordinates project planning across these systems.

## 39. Document references

Tasks should eventually be able to reference external resources such as:

- Google Drive files;
- Google Docs;
- technical documents;
- supplier specifications;
- GitHub issues;
- Trello cards.

The Planner should store references/links rather than duplicate documents.

## 40. Project data quality

A major purpose of the Planner is to expose missing planning information. Missing information must not be hidden. Example:

```
TEC-003
Owner: TBD
Duration: TBD
Start: TBD
```

is preferable to:

```
TEC-003
Owner: Marco
Duration: 5 days
Start: Monday
```

when those values have never been validated.

The Planner must distinguish known information from assumptions.

## 41. Initial product roadmap

- **Phase 00 — Foundation.** Application shell, architecture, environment security and timeline foundation. Status: implemented in PR #9.
- **Phase 01 — Planning database.** Supabase persistence; domain model; task CRUD; workstreams; subtasks; milestones; owners; duration calculation; dependencies; validation.
- **Phase 02 — Real Gantt.** Actual task bars; milestones; drag; resize; dependencies; hierarchy; zoom; editing drawer; unscheduled area. At the end of Phase 02 the Planner must already be useful as a standalone project planning tool.
- **Phase 03 — Scheduling engine.** Dependency validation; cycle prevention; impact analysis; conflict detection; explicit cascade.
- **Phase 04 — Trello.** Board mapping; owner mapping; labels; lists; card creation; updates; dry-run; sync status; audit. At the end of Phase 04, Planner → Trello must work reliably.
- **Phase 05 — AI coordination.** Structured project context; change proposals; before/after diff; dependency impact; approval; rejection; audit. At the end of Phase 05 ChatGPT and Claude should be able to interact safely with project planning.
- **Phase 06 — E project population.** Import/reconstruct the actual E roadmap. Validate with the team: activities; subtasks; owner; duration; dependencies; status; deadlines. Do not import obsolete historical dates as if they were current.
- **Phase 07 — Operating views.** Weekly Review; blockers; upcoming work; milestones; unscheduled work; filters; project change history.
- **Phase 08 — Personal Assistant interface.** Expose planning information required for personal scheduling: owner; duration; deadline; priority; geography; splitability; dependency; status. The Personal Assistant remains responsible for calendar scheduling.

## 42. Definition of success

The product succeeds when the founder can open one page and understand **"Where is E right now?"** and then immediately answer **"What has to happen next?"**

The team should be able to use the same system to understand **"What am I responsible for?"**

The planning system should make clear **"What happens if this task slips?"**

Trello should automatically reflect **"What needs to be executed?"**

And AI assistants should be able to answer **"Given everything we know, what should change in the plan?"** without gaining uncontrolled authority over the project.

## 43. Final system principle

The operating model is: **PLAN → EXECUTE → OBSERVE → ADJUST**

Where:

- **Planner** defines the plan.
- **Trello** supports execution.
- **Team** provides reality.
- **AI** analyzes reality and proposes adjustments.
- **Humans** retain final authority.

This separation of responsibilities must remain true as the product evolves.
