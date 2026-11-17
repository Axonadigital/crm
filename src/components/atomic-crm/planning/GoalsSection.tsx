import { useCreate, useDelete, useNotify, useUpdate } from "ra-core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { GoalIdeas } from "./GoalIdeas";
import {
  goalProgress,
  type PlanningGoal,
  type PlanningIdea,
} from "./planningStats";
import { SimpleSelect, usePlanningList } from "./ui";

const STATUS = [
  { id: "active", name: "Pågår" },
  { id: "achieved", name: "Uppnått" },
  { id: "dropped", name: "Avbrutet" },
];

export const GoalsSection = () => {
  const { data = [], refetch } =
    usePlanningList<PlanningGoal>("planning_goals");
  const { data: ideas = [], refetch: refetchIdeas } =
    usePlanningList<PlanningIdea>("planning_ideas");
  const [create, { isPending }] = useCreate();
  const [update] = useUpdate();
  const [deleteOne] = useDelete();
  const notify = useNotify();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [deadline, setDeadline] = useState("");

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      await create(
        "planning_goals",
        {
          data: {
            title: title.trim(),
            target_value: target ? Number(target) : null,
            unit: unit.trim() || null,
            deadline: deadline || null,
          },
        },
        { returnPromise: true },
      );
      setTitle("");
      setTarget("");
      setUnit("");
      setDeadline("");
      refetch();
    } catch {
      notify("Kunde inte spara målet", { type: "error" });
    }
  };

  const patch = (id: number, data: Record<string, unknown>) =>
    update(
      "planning_goals",
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
            placeholder="Mål, t.ex. Få 8 kvalificerade förfrågningar per månad"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Målvärde, enhet och deadline är valfria. Bara titeln krävs.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-full sm:w-32"
              type="number"
              placeholder="Målvärde (valfritt)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <Input
              className="w-full sm:w-40"
              placeholder="Enhet (st, kr…)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
            <Input
              className="w-full sm:w-44"
              type="date"
              aria-label="Deadline"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={isPending || !title.trim()}>
            Lägg till mål
          </Button>
        </CardContent>
      </Card>

      {data.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga mål ännu.</p>
      )}

      {data.map((goal) => (
        <Card key={goal.id}>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
              <div className="min-w-0 break-words">
                <p className="font-medium">{goal.title}</p>
                {goal.deadline && (
                  <p className="text-xs text-muted-foreground">
                    Deadline {goal.deadline}
                  </p>
                )}
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <SimpleSelect
                  value={goal.status}
                  options={STATUS}
                  onChange={(v) => v && patch(goal.id, { status: v })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 sm:size-9"
                  aria-label="Ta bort mål"
                  onClick={() =>
                    deleteOne(
                      "planning_goals",
                      { id: goal.id },
                      { onSuccess: () => refetch() },
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Progress
                value={goalProgress(goal.current_value, goal.target_value)}
                className="flex-1"
              />
              <Input
                className="h-9 w-20"
                type="number"
                aria-label="Nuvarande värde"
                defaultValue={goal.current_value}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (next !== goal.current_value) {
                    patch(goal.id, { current_value: next });
                  }
                }}
              />
              <span className="w-24 shrink-0 text-sm text-muted-foreground">
                / {goal.target_value ?? "–"} {goal.unit ?? ""}
              </span>
            </div>
            <GoalIdeas
              goalId={goal.id}
              ideas={ideas}
              onChange={() => refetchIdeas()}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
