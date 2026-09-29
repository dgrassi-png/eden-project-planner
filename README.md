# E:DEN Project Planner

Web-based master planning system for E:DEN.

**Planner = source of truth. Trello = execution layer.**

## V0
- True interactive Gantt
- Project > Workstream > Task > Subtask
- Stable E:DEN task IDs
- Owner, dates, duration, status, priority, geography
- Milestones and Finish-to-Start dependencies
- Controlled Planner -> Trello sync
- AI change proposals for ChatGPT / Claude with human approval
- Audit log

## Stack
Next.js + TypeScript + Supabase/Postgres + Vercel.

See `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/CLAUDE_CODE_PROMPTS.md`.

Never commit secrets. Use `.env.local`.
