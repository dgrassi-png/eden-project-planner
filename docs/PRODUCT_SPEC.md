# Product Spec V0

## Objective
E:DEN Project Planner is the master timeline for E:DEN. It answers what must happen, who owns it, how long it takes, what it depends on, and what slips if dates change.

## Authority
Planner owns planning fields. Trello owns day-to-day execution detail. V0 synchronization is **Planner -> Trello only**.

## Hierarchy
Project > Workstream > Task > Subtask.

Every task has a stable `eden_code` such as `TEC-001` or `TEC-001.1`. Codes do not change when titles change.

## Task fields
- eden_code
- title / description
- workstream / parent task
- owner
- planned_start
- planned_duration_days
- planned_finish
- status: BACKLOG | READY | IN_PROGRESS | WAITING_BLOCKED | DONE | CANCELLED
- priority: P0 | P1 | P2 | P3
- geography: CECINA_REQUIRED | CECINA_PREFERRED | REMOTE_OK | ANYWHERE
- milestone
- progress
- Trello mapping and sync status

## Gantt
This must be a real date-driven Gantt, never a manually colored grid.

Required:
- week/month/quarter zoom
- workstream grouping and nested tasks
- proportional bars generated from dates
- milestone diamonds
- dependency arrows
- today line
- drag to move
- resize to change duration
- task drawer
- unscheduled task area
- dependency impact preview

A date change never silently cascades successors. Cascade is an explicit action.

## Dependencies
V0 supports Finish-to-Start with optional lag days. Reject self-dependencies, duplicates and cycles.

## Trello
Target existing E:DEN board: https://trello.com/b/9n93W4ym/eden

Runtime configuration discovers actual board/list/label/member IDs; never guess them.

Mapping:
- eden_code + title -> card title
- finish -> due date
- owner -> Trello member
- workstream -> label
- status -> list
- compact planning summary -> description
- subtask -> checklist item or child card according to configuration

Sync must be idempotent and use persistent Trello card IDs.

## AI alignment
ChatGPT, Claude and future agents are advisory by default.

Flow:
1. Agent reads project context.
2. Agent submits structured proposal.
3. Planner stores proposal.
4. Human reviews diff/impact.
5. Human applies or rejects.
6. Planner records audit event.
7. Trello sync remains a separate controlled action.

AI never receives direct Trello write capability in V0.

## Initial macro structure
Seed without inventing unverified dates/durations:
- GOV-001 Master Schedule & execution system
- TEC-001 Stabilizzazione ECU / controller / cablaggio
- TEC-002 Validazione architettura elettrica/elettronica definitiva
- PROD-001 Design freeze eBacco pre-produzione
- SC-001 BOM definitiva e fornitori critici
- PROD-002 Setup assemblaggio e procedure QC
- CERT-001 Documentazione tecnica / pre-audit CE
- CERT-002 Test EMC e iter certificazione
- CERT-003 Certificazione CE completa [milestone]
- MKT-001 Finalizzazione marketing e materiali commerciali
- CRM-001 CRM e processo gestione lead
- EIMA-001 Preparazione unità demo / use case EIMA
- EIMA-002 Logistica, sales training e materiali EIMA
- EIMA-003 EIMA Bologna [milestone]
- POST-001 Assistenza, issue tracking e feedback clienti
- ROAD-001 Roadmap prodotto 2027

## V0 acceptance
A user can log in, manage nested tasks, manipulate a true Gantt, create dependencies/milestones, preview and sync Planner tasks to Trello, submit/review/apply AI proposals, and inspect audit history.
