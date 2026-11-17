import { describe, expect, it } from "vitest";
import {
  goalProgress,
  ideasForGoal,
  sumEstimateHours,
  buildOverview,
  type PlanningGoal,
  type PlanningTask,
} from "./planningStats";

const task = (over: Partial<PlanningTask> = {}): PlanningTask => ({
  id: 1,
  title: "t",
  status: "todo",
  estimate_hours: null,
  assignee_id: null,
  project_id: null,
  planned_date: null,
  ...over,
});

describe("goalProgress", () => {
  it("returns percentage of current vs target", () => {
    expect(goalProgress(4, 8)).toBe(50);
  });

  it("clamps to 100 when current exceeds target", () => {
    expect(goalProgress(12, 8)).toBe(100);
  });

  it("returns 0 when target is missing or zero", () => {
    expect(goalProgress(3, null)).toBe(0);
    expect(goalProgress(3, 0)).toBe(0);
  });

  it("never returns negative progress", () => {
    expect(goalProgress(-2, 8)).toBe(0);
  });
});

describe("sumEstimateHours", () => {
  it("sums estimates and ignores empty ones", () => {
    const tasks = [
      task({ estimate_hours: 2 }),
      task({ estimate_hours: 1.5 }),
      task({ estimate_hours: null }),
    ];
    expect(sumEstimateHours(tasks)).toBe(3.5);
  });

  it("returns 0 for an empty list", () => {
    expect(sumEstimateHours([])).toBe(0);
  });
});

describe("buildOverview", () => {
  const goals: PlanningGoal[] = [
    { id: 1, title: "a", status: "active", current_value: 1, target_value: 2 },
    {
      id: 2,
      title: "b",
      status: "achieved",
      current_value: 2,
      target_value: 2,
    },
  ];

  it("counts only active goals and open tasks", () => {
    const overview = buildOverview({
      goals,
      tasks: [
        task({ id: 1, status: "todo", estimate_hours: 2 }),
        task({ id: 2, status: "done", estimate_hours: 5 }),
      ],
      projects: [],
      ideas: [],
    });
    expect(overview.activeGoals).toHaveLength(1);
    expect(overview.openTasks).toHaveLength(1);
    expect(overview.openEstimateHours).toBe(2);
  });

  it("counts new ideas only", () => {
    const overview = buildOverview({
      goals: [],
      tasks: [],
      projects: [],
      ideas: [
        { id: 1, title: "x", status: "new" },
        { id: 2, title: "y", status: "dropped" },
      ],
    });
    expect(overview.newIdeaCount).toBe(1);
  });

  it("counts active projects only", () => {
    const overview = buildOverview({
      goals: [],
      tasks: [],
      ideas: [],
      projects: [
        { id: 1, title: "p", status: "active", goal_id: null, owner_id: null },
        { id: 2, title: "q", status: "done", goal_id: null, owner_id: null },
      ],
    });
    expect(overview.activeProjects).toHaveLength(1);
  });
});

describe("ideasForGoal", () => {
  const ideas = [
    { id: 1, title: "a", status: "new" as const, goal_id: 10 },
    { id: 2, title: "b", status: "dropped" as const, goal_id: 10 },
    { id: 3, title: "c", status: "new" as const, goal_id: 11 },
    { id: 4, title: "d", status: "new" as const, goal_id: null },
  ];

  it("returns only ideas linked to the given goal", () => {
    expect(ideasForGoal(ideas, 10).map((i) => i.id)).toEqual([1, 2]);
  });

  it("returns an empty list when no idea is linked", () => {
    expect(ideasForGoal(ideas, 99)).toEqual([]);
  });

  it("ignores ideas without a goal", () => {
    expect(ideasForGoal(ideas, 11).map((i) => i.id)).toEqual([3]);
  });
});
