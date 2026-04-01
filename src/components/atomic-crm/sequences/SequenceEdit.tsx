import { useEffect, useState } from "react";
import {
  useGetOne,
  useGetList,
  useUpdate,
  useCreate,
  useDelete,
  useNotify,
  useRedirect,
} from "ra-core";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TopToolbar } from "../layout/TopToolbar";
import { SequenceStepEditor, type SequenceStep } from "./SequenceStepEditor";

const triggerOptions = [
  { id: "manual", name: "Manuell" },
  { id: "new_lead", name: "Ny lead" },
  { id: "segment_change", name: "Segmentändring" },
];

const statusOptions = [
  { id: "draft", name: "Utkast" },
  { id: "active", name: "Aktiv" },
  { id: "paused", name: "Pausad" },
];

export const SequenceEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { data: sequence, isPending: loadingSequence } = useGetOne(
    "sequences",
    { id },
    { enabled: !!id },
  );
  const { data: existingSteps, isPending: loadingSteps } = useGetList(
    "sequence_steps",
    {
      filter: { sequence_id: id },
      sort: { field: "step_number", order: "ASC" },
      pagination: { page: 1, perPage: 100 },
    },
    { enabled: !!id },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("manual");
  const [status, setStatus] = useState("draft");
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [initialized, setInitialized] = useState(false);

  const [update] = useUpdate();
  const [create] = useCreate();
  const [deleteOne] = useDelete();
  const notify = useNotify();
  const redirect = useRedirect();

  // Load data into state when fetched
  useEffect(() => {
    if (sequence && !initialized) {
      setName(sequence.name || "");
      setDescription(sequence.description || "");
      setTriggerType(sequence.trigger_type || "manual");
      setStatus(sequence.status || "draft");
      setInitialized(true);
    }
  }, [sequence, initialized]);

  useEffect(() => {
    if (existingSteps && existingSteps.length > 0 && steps.length === 0) {
      setSteps(
        existingSteps.map((s) => ({
          step_number: s.step_number,
          delay_days: s.delay_days || 0,
          delay_hours: s.delay_hours || 0,
          action_type: s.action_type as SequenceStep["action_type"],
          template_id: s.template_id,
          action_config: (s.action_config as Record<string, unknown>) || {},
        })),
      );
    }
  }, [existingSteps, steps.length]);

  const handleSave = async () => {
    if (!name.trim()) {
      notify("Namn krävs", { type: "error" });
      return;
    }

    try {
      // Update sequence
      await update(
        "sequences",
        {
          id,
          data: {
            name,
            description,
            trigger_type: triggerType,
            status,
          },
          previousData: sequence,
        },
        { returnPromise: true },
      );

      // Delete existing steps and recreate (simplest approach)
      if (existingSteps) {
        for (const step of existingSteps) {
          await deleteOne(
            "sequence_steps",
            { id: step.id, previousData: step },
            { returnPromise: true },
          );
        }
      }

      // Create new steps
      for (const step of steps) {
        await create(
          "sequence_steps",
          {
            data: {
              sequence_id: id,
              step_number: step.step_number,
              delay_days: step.delay_days,
              delay_hours: step.delay_hours,
              action_type: step.action_type,
              template_id: step.template_id,
              action_config: step.action_config,
            },
          },
          { returnPromise: true },
        );
      }

      notify("Sekvens uppdaterad!", { type: "success" });
      redirect("list", "sequences");
    } catch (error) {
      notify(
        `Kunde inte spara: ${error instanceof Error ? error.message : "Okänt fel"}`,
        { type: "error" },
      );
    }
  };

  if (loadingSequence || loadingSteps) {
    return <div className="p-6">Laddar...</div>;
  }

  return (
    <div>
      <TopToolbar>
        <Button variant="outline" onClick={() => redirect("list", "sequences")}>
          Tillbaka
        </Button>
      </TopToolbar>

      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-lg font-semibold mb-4">Redigera sekvens</h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Namn</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Outreach för nya leads"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Beskrivning
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valfri beskrivning..."
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">
                Trigger-typ
              </label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {triggerOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SequenceStepEditor steps={steps} onChange={setSteps} />

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave}>Spara ändringar</Button>
            <Button
              variant="outline"
              onClick={() => redirect("list", "sequences")}
            >
              Avbryt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
