import { useCreate, useDelete, useNotify, useUpdate } from "ra-core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PlanningGoal, PlanningProject } from "./planningStats";
import { SimpleSelect, useTeam, usePlanningList } from "./ui";

const STATUS = [
  { id: "planned", name: "Planerat" },
  { id: "active", name: "Pågår" },
  { id: "paused", name: "Pausat" },
  { id: "done", name: "Klart" },
];

export const ProjectsSection = () => {
  const { data = [], refetch } =
    usePlanningList<PlanningProject>("planning_projects");
  const { data: goals = [] } = usePlanningList<PlanningGoal>("planning_goals");
  const team = useTeam();
  const [create, { isPending }] = useCreate();
  const [update] = useUpdate();
  const [deleteOne] = useDelete();
  const notify = useNotify();
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const goalOptions = goals.map((g) => ({ id: String(g.id), name: g.title }));
  const goalName = (id: number | null) => goals.find((g) => g.id === id)?.title;

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      await create(
        "planning_projects",
        {
          data: {
            title: title.trim(),
            goal_id: goalId ? Number(goalId) : null,
            owner_id: ownerId ? Number(ownerId) : null,
          },
        },
        { returnPromise: true },
      );
      setTitle("");
      setGoalId(null);
      setOwnerId(null);
      refetch();
    } catch {
      notify("Kunde inte spara projektet", { type: "error" });
    }
  };

  const patch = (id: number, data: Record<string, unknown>) =>
    update(
      "planning_projects",
      { id, data, previousData: {} },
      {
        onSuccess: () => refetch(),
      },
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Input
            placeholder="Projekt, t.ex. Testa en kampanj för hemsidor"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <SimpleSelect
              className="w-full sm:w-56"
              value={goalId}
              options={goalOptions}
              onChange={setGoalId}
              placeholder="Kopplat mål"
              allowEmpty
            />
            <SimpleSelect
              className="w-full sm:w-40"
              value={ownerId}
              options={team.options}
              onChange={setOwnerId}
              placeholder="Ansvarig"
              allowEmpty
            />
          </div>
          <Button onClick={handleAdd} disabled={isPending || !title.trim()}>
            Lägg till projekt
          </Button>
        </CardContent>
      </Card>

      {data.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga projekt ännu.</p>
      )}

      {data.map((project) => (
        <Card key={project.id}>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
              <div className="min-w-0 break-words">
                <p className="font-medium">{project.title}</p>
                <p className="text-xs text-muted-foreground">
                  Ansvarig: {team.nameOf(project.owner_id)}
                  {goalName(project.goal_id) &&
                    ` · Mål: ${goalName(project.goal_id)}`}
                </p>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <SimpleSelect
                  value={project.status}
                  options={STATUS}
                  onChange={(v) => v && patch(project.id, { status: v })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 sm:size-9"
                  aria-label="Ta bort projekt"
                  onClick={() =>
                    deleteOne(
                      "planning_projects",
                      { id: project.id },
                      { onSuccess: () => refetch() },
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SimpleSelect
                className="h-9 w-full sm:w-40"
                value={project.owner_id ? String(project.owner_id) : null}
                options={team.options}
                onChange={(v) =>
                  patch(project.id, { owner_id: v ? Number(v) : null })
                }
                placeholder="Ansvarig"
                allowEmpty
              />
              <Input
                className="h-9 w-full sm:w-32"
                type="number"
                step="0.5"
                placeholder="Est. timmar"
                aria-label="Uppskattade timmar"
                defaultValue={project.estimate_hours ?? ""}
                onBlur={(e) =>
                  patch(project.id, {
                    estimate_hours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </div>
            <Textarea
              rows={2}
              placeholder="Anteckningar, t.ex. hur lång tid vi tror det tar och varför"
              defaultValue={project.notes ?? ""}
              onBlur={(e) => {
                if ((e.target.value || null) !== (project.notes ?? null)) {
                  patch(project.id, { notes: e.target.value || null });
                }
              }}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
