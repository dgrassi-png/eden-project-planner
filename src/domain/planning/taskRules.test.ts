import { describe, expect, it } from "vitest";

import type { Result } from "../result";

import { checkTaskDeletion, prepareNewTask, prepareTaskUpdate, type TaskRuleContext } from "./taskRules";
import { makeTask, PROJECT_ID } from "./testFixtures";

const parent = makeTask({ id: "t-1", edenCode: "TEC-001", workstreamId: "ws-1" });
const milestone = makeTask({ id: "m-1", edenCode: "CERT-003", workstreamId: "ws-2", isMilestone: true, plannedDurationDays: 0 });
const subtask = makeTask({ id: "t-1-1", edenCode: "TEC-001.1", workstreamId: "ws-1", parentTaskId: "t-1" });

const ctx: TaskRuleContext = {
  projectId: PROJECT_ID,
  workstreams: [{ id: "ws-1" }, { id: "ws-2" }],
  members: [{ id: "mem-1" }],
  tasks: [parent, milestone, subtask],
};

function issueCodes<T>(result: Result<T>): string[] {
  return result.ok ? [] : result.issues.map((i) => i.code);
}

describe("prepareNewTask", () => {
  it("creates an unscheduled task with nothing invented", () => {
    const result = prepareNewTask({ edenCode: " tec-002 ", title: "  Validate  ", workstreamId: "ws-1" }, ctx);
    expect(result).toEqual({
      ok: true,
      value: {
        projectId: PROJECT_ID,
        workstreamId: "ws-1",
        parentTaskId: null,
        edenCode: "TEC-002",
        title: "Validate",
        description: null,
        ownerMemberId: null,
        plannedStart: null,
        plannedDurationDays: null,
        plannedFinish: null,
        status: "BACKLOG",
        priority: null,
        geography: null,
        isMilestone: false,
        progressPercent: null,
        sortOrder: 0,
      },
    });
  });

  it("derives planned finish from working days", () => {
    const result = prepareNewTask(
      { edenCode: "TEC-002", title: "x", workstreamId: "ws-1", plannedStart: "2026-10-08", plannedDurationDays: 3 },
      ctx,
    );
    expect(result.ok && result.value.plannedFinish).toBe("2026-10-12");
  });

  it("rejects malformed, duplicate and mis-levelled codes", () => {
    expect(issueCodes(prepareNewTask({ edenCode: "TEC-1", title: "x", workstreamId: "ws-1" }, ctx))).toContain("EDEN_CODE_FORMAT");
    expect(issueCodes(prepareNewTask({ edenCode: "TEC-001", title: "x", workstreamId: "ws-1" }, ctx))).toContain("EDEN_CODE_TAKEN");
    expect(issueCodes(prepareNewTask({ edenCode: "TEC-002.1", title: "x", workstreamId: "ws-1" }, ctx))).toContain("EDEN_CODE_LEVEL");
  });

  it("creates subtasks under the parent code and workstream", () => {
    const result = prepareNewTask({ edenCode: "TEC-001.2", title: "x", parentTaskId: "t-1" }, ctx);
    expect(result.ok && result.value.workstreamId).toBe("ws-1");
    expect(issueCodes(prepareNewTask({ edenCode: "TEC-002.1", title: "x", parentTaskId: "t-1" }, ctx))).toContain(
      "EDEN_CODE_PARENT_PREFIX",
    );
    expect(
      issueCodes(prepareNewTask({ edenCode: "TEC-001.2", title: "x", parentTaskId: "t-1", workstreamId: "ws-2" }, ctx)),
    ).toContain("SUBTASK_WORKSTREAM_MISMATCH");
  });

  it("enforces one subtask level and no subtasks under milestones", () => {
    expect(issueCodes(prepareNewTask({ edenCode: "TEC-001.1", title: "x", parentTaskId: "t-1-1" }, ctx))).toContain(
      "HIERARCHY_TOO_DEEP",
    );
    expect(issueCodes(prepareNewTask({ edenCode: "CERT-003.1", title: "x", parentTaskId: "m-1" }, ctx))).toContain(
      "MILESTONE_WITH_SUBTASKS",
    );
  });

  it("requires a workstream, title, working-day start and valid ranges", () => {
    const codes = issueCodes(
      prepareNewTask(
        {
          edenCode: "TEC-002",
          title: " ",
          plannedStart: "2026-10-10",
          plannedDurationDays: 0,
          progressPercent: 120,
          ownerMemberId: "ghost",
        },
        ctx,
      ),
    );
    expect(codes).toEqual(
      expect.arrayContaining(["WORKSTREAM_REQUIRED", "TITLE_REQUIRED", "START_NOT_WORKING_DAY", "DURATION_RANGE", "PROGRESS_RANGE", "OWNER_NOT_FOUND"]),
    );
    expect(codes).not.toContain("WORKSTREAM_NOT_FOUND");
  });

  it("normalises milestones to zero duration and allows any calendar day", () => {
    const result = prepareNewTask(
      { edenCode: "CERT-004", title: "x", workstreamId: "ws-2", isMilestone: true, plannedStart: "2026-11-08" },
      ctx,
    );
    expect(result.ok && [result.value.plannedDurationDays, result.value.plannedFinish]).toEqual([0, "2026-11-08"]);
    expect(
      issueCodes(prepareNewTask({ edenCode: "CERT-004", title: "x", workstreamId: "ws-2", isMilestone: true, plannedDurationDays: 3 }, ctx)),
    ).toContain("MILESTONE_DURATION");
  });
});

describe("prepareTaskUpdate", () => {
  it("returns only changed fields and re-derives finish", () => {
    const scheduled = makeTask({ id: "t-2", edenCode: "TEC-002", plannedStart: "2026-10-05", plannedDurationDays: 5, plannedFinish: "2026-10-09" });
    expect(prepareTaskUpdate(scheduled, { plannedDurationDays: 6 }, ctx)).toEqual({
      ok: true,
      value: { plannedDurationDays: 6, plannedFinish: "2026-10-12" },
    });
    expect(prepareTaskUpdate(scheduled, { title: "TEC-002" }, ctx)).toEqual({ ok: true, value: {} });
  });

  it("clears finish when start is removed (back to unscheduled)", () => {
    const scheduled = makeTask({ id: "t-2", edenCode: "TEC-002", plannedStart: "2026-10-05", plannedDurationDays: 5, plannedFinish: "2026-10-09" });
    expect(prepareTaskUpdate(scheduled, { plannedStart: null }, ctx)).toEqual({
      ok: true,
      value: { plannedStart: null, plannedFinish: null },
    });
  });

  it("converts between task and milestone without inventing a duration", () => {
    const task = makeTask({ id: "t-2", edenCode: "TEC-002", plannedStart: "2026-10-05", plannedDurationDays: 5, plannedFinish: "2026-10-09" });
    const toMilestone = prepareTaskUpdate(task, { isMilestone: true }, ctx);
    expect(toMilestone).toEqual({ ok: true, value: { isMilestone: true, plannedDurationDays: 0, plannedFinish: "2026-10-05" } });

    const backToTask = prepareTaskUpdate(milestone, { isMilestone: false }, ctx);
    expect(backToTask.ok && backToTask.value.plannedDurationDays).toBeNull();
  });

  it("blocks turning a parent into a milestone and moving subtasks directly", () => {
    expect(issueCodes(prepareTaskUpdate(parent, { isMilestone: true }, ctx))).toContain("MILESTONE_WITH_SUBTASKS");
    expect(issueCodes(prepareTaskUpdate(subtask, { workstreamId: "ws-2" }, ctx))).toContain("SUBTASK_WORKSTREAM_MISMATCH");
  });
});

describe("checkTaskDeletion", () => {
  it("requires subtasks to be deleted first", () => {
    expect(checkTaskDeletion(parent, ctx.tasks).map((i) => i.code)).toEqual(["TASK_HAS_SUBTASKS"]);
    expect(checkTaskDeletion(subtask, ctx.tasks)).toEqual([]);
  });
});
