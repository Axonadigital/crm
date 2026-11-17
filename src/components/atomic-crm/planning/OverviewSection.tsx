import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  buildOverview,
  goalProgress,
  type PlanningGoal,
  type PlanningIdea,
  type PlanningProject,
  type PlanningTask,
} from "./planningStats";
import { formatHours, useTeam, usePlanningList } from "./ui";

const Stat = ({
  label,
  value,
  to,
}: {
  label: string;
  value: string | number;
  to: string;
}) => (
  <Link to={to} className="no-underline">
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="py-4">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  </Link>
);

export const OverviewSection = () => {
  const { data: goals = [] } = usePlanningList<PlanningGoal>("planning_goals");
  const { data: projects = [] } =
    usePlanningList<PlanningProject>("planning_projects");
  const { data: tasks = [] } = usePlanningList<PlanningTask>("planning_tasks");
  const { data: ideas = [] } = usePlanningList<PlanningIdea>("planning_ideas");
  const team = useTeam();

  const overview = buildOverview({ goals, projects, tasks, ideas });
  const hoursByPerson = team.options.map((person) => ({
    ...person,
    hours: overview.openTasks
      .filter((t) => String(t.assignee_id) === person.id)
      .reduce((sum, t) => sum + (Number(t.estimate_hours) || 0), 0),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Aktiva mål"
          value={overview.activeGoals.length}
          to="/planning/goals"
        />
        <Stat
          label="Pågående projekt"
          value={overview.activeProjects.length}
          to="/planning/projects"
        />
        <Stat
          label="Öppna uppgifter"
          value={overview.openTasks.length}
          to="/planning/tasks"
        />
        <Stat
          label="Nya idéer"
          value={overview.newIdeaCount}
          to="/planning/ideas"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Målframsteg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {overview.activeGoals.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Inga aktiva mål. Sätt ett under Mål.
              </p>
            )}
            {overview.activeGoals.map((goal) => (
              <div key={goal.id} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words">{goal.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {goal.current_value}/{goal.target_value ?? "–"}
                  </span>
                </div>
                <Progress
                  value={goalProgress(goal.current_value, goal.target_value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Arbetsbelastning (öppna uppgifter)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hoursByPerson.map((p) => (
              <div key={p.id} className="flex justify-between text-sm">
                <span>{p.name}</span>
                <span className="text-muted-foreground">
                  {formatHours(p.hours)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-sm font-medium">
              <span>Totalt</span>
              <span>{formatHours(overview.openEstimateHours)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pågående projekt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.activeProjects.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Inga pågående projekt.
            </p>
          )}
          {overview.activeProjects.map((p) => (
            <div key={p.id} className="flex justify-between gap-2 text-sm">
              <span className="min-w-0 break-words">{p.title}</span>
              <span className="shrink-0 text-muted-foreground">
                {team.nameOf(p.owner_id)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
