import { useCreate, useDelete, useNotify, useUpdate } from "ra-core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PlanningProject, PlanningTask } from "./planningStats";
import { sumEstimateHours } from "./planningStats";
import { formatHours, SimpleSelect, useTeam, usePlanningList } from "./ui";

const STATUS = [
  { id: "todo", name: "Att göra" },
  { id: "doing", name: "Pågår" },
  { id: "done", name: "Klart" },
];

export const TasksSection = () => {
  const { data = [], refetch } =
    usePlanningList<PlanningTask>("planning_tasks");
  const { data: projects = [] } =
    usePlanningList<PlanningProject>("planning_projects");
  const team = useTeam();
  const [create, { isPending }] = useCreate();
  const [update] = useUpdate();
  const [deleteOne] = useDelete();
  const notify = useNotify();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);

  const projectOptions = projects.map((p) => ({
    id: String(p.id),
    name: p.title,
  }));
  const projectName = (id: number | null) =>
    projects.find((p) => p.id === id)?.title;

  const visible = assigneeFilter
    ? data.filter((t) => String(t.assignee_id) === assigneeFilter)
    : data;
  const openHours = sumEstimateHours(
    visible.filter((t) => t.status !== "done"),
  );

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      await create(
        "planning_tasks",
        {
          data: {
            title: title.trim(),
            project_id: projectId ? Number(projectId) : null,
            assignee_id: assigneeId ? Number(assigneeId) : null,
            estimate_hours: estimate ? Number(estimate) : null,
            planned_date: plannedDate || null,
          },
        },
        { returnPromise: true },
      );
      setTitle("");
      setEstimate("");
      setPlannedDate("");
      refetch();
    } catch {
      notify("Kunde inte spara uppgiften", { type: "error" });
    }
  };

  const patch = (id: number, fields: Record<string, unknown>) =>
    update(
      "planning_tasks",
      { id, data: fields, previousData: {} },
      {
        onSuccess: () => refetch(),
      },
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Input
            placeholder="Nästa steg, t.ex. Ta fram tre annonsförslag"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <div className="flex flex-wrap gap-2">
            <SimpleSelect
              className="w-full sm:w-56"
              value={projectId}
              options={projectOptions}
              onChange={setProjectId}
              placeholder="Projekt"
              allowEmpty
            />
            <SimpleSelect
              className="w-full sm:w-40"
              value={assigneeId}
              options={team.options}
              onChange={setAssigneeId}
              placeholder="Ansvarig"
              allowEmpty
            />
            <Input
              className="w-full sm:w-28"
              type="number"
              step="0.5"
              placeholder="Est. h"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            />
            <Input
              className="w-full sm:w-40"
              type="date"
              aria-label="Planerat datum"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={isPending || !title.trim()}>
            Lägg till uppgift
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SimpleSelect
          className="w-full sm:w-44"
          value={assigneeFilter}
          options={team.options}
          onChange={setAssigneeFilter}
          placeholder="Alla personer"
          allowEmpty
        />
        <span className="text-sm text-muted-foreground">
          Öppet: {formatHours(openHours)} uppskattat
        </span>
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga uppgifter.</p>
      )}

      {visible.map((task) => (
        <Card key={task.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 break-words">
              <p
                className={`font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}
              >
                {task.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {team.nameOf(task.assignee_id)}
                {projectName(task.project_id) &&
                  ` · ${projectName(task.project_id)}`}
                {task.planned_date && ` · ${task.planned_date}`}
                {task.estimate_hours != null &&
                  ` · ${formatHours(Number(task.estimate_hours))}`}
              </p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <SimpleSelect
                value={task.status}
                options={STATUS}
                onChange={(v) => v && patch(task.id, { status: v })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0 sm:size-9"
                aria-label="Ta bort uppgift"
                onClick={() =>
                  deleteOne(
                    "planning_tasks",
                    { id: task.id },
                    { onSuccess: () => refetch() },
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
