import { useCreate, useDelete, useNotify } from "ra-core";
import { Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ideasForGoal, type PlanningIdea } from "./planningStats";

interface GoalIdeasProps {
  goalId: number;
  ideas: ReadonlyArray<PlanningIdea>;
  onChange: () => void;
}

/** Idéer för att nå ett visst mål, med snabb inmatning direkt under målet. */
export const GoalIdeas = ({ goalId, ideas, onChange }: GoalIdeasProps) => {
  const [create, { isPending }] = useCreate();
  const [deleteOne] = useDelete();
  const notify = useNotify();
  const [title, setTitle] = useState("");
  const linked = ideasForGoal(ideas, goalId).filter(
    (idea) => idea.status !== "dropped",
  );

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      await create(
        "planning_ideas",
        { data: { title: title.trim(), goal_id: goalId } },
        { returnPromise: true },
      );
      setTitle("");
      onChange();
    } catch {
      notify("Kunde inte spara idén", { type: "error" });
    }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Lightbulb className="h-4 w-4" />
        Idéer för att nå målet
      </p>
      {linked.map((idea) => (
        <div
          key={idea.id}
          className="flex items-start justify-between gap-2 text-sm"
        >
          <span className="min-w-0 break-words">{idea.title}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="Ta bort idé"
            onClick={() =>
              deleteOne(
                "planning_ideas",
                { id: idea.id },
                { onSuccess: onChange },
              )
            }
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          className="h-9"
          placeholder="Skriv en idé, t.ex. Testa AI-genererade annonser"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          variant="secondary"
          className="h-9"
          onClick={handleAdd}
          disabled={isPending || !title.trim()}
        >
          Lägg till
        </Button>
      </div>
    </div>
  );
};
