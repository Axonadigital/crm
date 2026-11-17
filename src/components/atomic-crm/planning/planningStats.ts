export type PlanningIdea = {
  id: number;
  title: string;
  status: "new" | "planned" | "dropped";
  notes?: string | null;
  goal_id?: number | null;
};

export type PlanningGoal = {
  id: number;
  title: string;
  status: "active" | "achieved" | "dropped";
  current_value: number;
  target_value: number | null;
  unit?: string | null;
  deadline?: string | null;
  description?: string | null;
};

export type PlanningProject = {
  id: number;
  title: string;
  status: "planned" | "active" | "paused" | "done";
  goal_id: number | null;
  owner_id: number | null;
  estimate_hours?: number | null;
  due_date?: string | null;
  notes?: string | null;
};

export type PlanningTask = {
  id: number;
  title: string;
  status: "todo" | "doing" | "done";
  estimate_hours: number | null;
  assignee_id: number | null;
  project_id: number | null;
  planned_date: string | null;
  notes?: string | null;
};

export interface PlanningOverview {
  activeGoals: PlanningGoal[];
  activeProjects: PlanningProject[];
  openTasks: PlanningTask[];
  openEstimateHours: number;
  newIdeaCount: number;
}

export const goalProgress = (
  current: number,
  target: number | null,
): number => {
  if (!target || target <= 0) return 0;
  const pct = (current / target) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
};

export const sumEstimateHours = (
  tasks: ReadonlyArray<Pick<PlanningTask, "estimate_hours">>,
): number =>
  tasks.reduce((total, t) => total + (Number(t.estimate_hours) || 0), 0);

export const buildOverview = (data: {
  goals: ReadonlyArray<PlanningGoal>;
  projects: ReadonlyArray<PlanningProject>;
  tasks: ReadonlyArray<PlanningTask>;
  ideas: ReadonlyArray<Pick<PlanningIdea, "status">>;
}): PlanningOverview => {
  const openTasks = data.tasks.filter((t) => t.status !== "done");
  return {
    activeGoals: data.goals.filter((g) => g.status === "active"),
    activeProjects: data.projects.filter((p) => p.status === "active"),
    openTasks,
    openEstimateHours: sumEstimateHours(openTasks),
    newIdeaCount: data.ideas.filter((i) => i.status === "new").length,
  };
};

export const ideasForGoal = <T extends { goal_id?: number | null }>(
  ideas: ReadonlyArray<T>,
  goalId: number,
): T[] => ideas.filter((idea) => idea.goal_id === goalId);
