import { useCreate, useDelete, useNotify, useUpdate } from "ra-core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PlanningIdea } from "./planningStats";
import { SimpleSelect, usePlanningList } from "./ui";

const STATUS = [
  { id: "new", name: "Ny" },
  { id: "planned", name: "Planerad" },
  { id: "dropped", name: "Avfärdad" },
];

export const IdeasSection = () => {
  const { data = [], refetch } =
    usePlanningList<PlanningIdea>("planning_ideas");
  const [create, { isPending }] = useCreate();
  const [update] = useUpdate();
  const [deleteOne] = useDelete();
  const notify = useNotify();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const handleAdd = async () => {
    if (!title.trim()) return;
    try {
      await create(
        "planning_ideas",
        { data: { title: title.trim(), notes: notes.trim() || null } },
        { returnPromise: true },
      );
      setTitle("");
      setNotes("");
      refetch();
    } catch {
      notify("Kunde inte spara idén", { type: "error" });
    }
  };

  const setStatus = (id: number, status: string) =>
    update(
      "planning_ideas",
      { id, data: { status }, previousData: {} },
      {
        onSuccess: () => refetch(),
      },
    );

  const remove = (id: number) =>
    deleteOne("planning_ideas", { id }, { onSuccess: () => refetch() });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Input
            placeholder="Skriv en tanke eller idé…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Textarea
            placeholder="Anteckningar (valfritt)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <Button onClick={handleAdd} disabled={isPending || !title.trim()}>
            Lägg till idé
          </Button>
        </CardContent>
      </Card>

      {data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Inga idéer än. Skriv ner den första!
        </p>
      )}

      <div className="space-y-2">
        {data.map((idea) => (
          <Card key={idea.id}>
            <CardContent className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:justify-between">
              <div className="min-w-0 break-words">
                <p
                  className={`font-medium ${idea.status === "dropped" ? "line-through text-muted-foreground" : ""}`}
                >
                  {idea.title}
                </p>
                {idea.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {idea.notes}
                  </p>
                )}
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                <SimpleSelect
                  value={idea.status}
                  options={STATUS}
                  onChange={(v) => v && setStatus(idea.id, v)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0 sm:size-9"
                  aria-label="Ta bort idé"
                  onClick={() => remove(idea.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
