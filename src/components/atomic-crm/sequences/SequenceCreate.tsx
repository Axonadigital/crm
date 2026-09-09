import { useState } from "react";
import { useCreate, useNotify, useRedirect, useGetIdentity } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  { id: "scan_result", name: "Scan-resultat (automatisk)" },
];

/** Formulärfält för scan_result-triggern. Sparas i sequences.trigger_config. */
const DEFAULT_MAX_SCORE = 50;
const DEFAULT_MAX_SCAN_AGE_DAYS = 60;

function buildTriggerConfig(triggerType: string, maxScore: string) {
  if (triggerType !== "scan_result") return {};
  const parsed = Number(maxScore);
  return {
    max_score: Number.isFinite(parsed) ? parsed : DEFAULT_MAX_SCORE,
    min_score: 0,
    max_scan_age_days: DEFAULT_MAX_SCAN_AGE_DAYS,
    include_no_website: false,
  };
}

export const SequenceCreate = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("manual");
  const [maxScore, setMaxScore] = useState(String(DEFAULT_MAX_SCORE));
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [create, { isPending }] = useCreate();
  const notify = useNotify();
  const redirect = useRedirect();
  const { data: identity } = useGetIdentity();

  const handleSave = async () => {
    if (!name.trim()) {
      notify("Namn krävs", { type: "error" });
      return;
    }

    try {
      // Create the sequence
      const sequenceResult = await create(
        "sequences",
        {
          data: {
            name,
            description,
            trigger_type: triggerType,
            trigger_config: buildTriggerConfig(triggerType, maxScore),
            status: "draft",
            created_by: identity?.id || null,
          },
        },
        { returnPromise: true },
      );

      // Create steps if any
      if (steps.length > 0 && sequenceResult?.id) {
        for (const step of steps) {
          await create(
            "sequence_steps",
            {
              data: {
                sequence_id: sequenceResult.id,
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
      }

      notify("Sekvens skapad!", { type: "success" });
      redirect("list", "sequences");
    } catch (error) {
      notify(
        `Kunde inte skapa: ${error instanceof Error ? error.message : "Okänt fel"}`,
        { type: "error" },
      );
    }
  };

  return (
    <div>
      <TopToolbar>
        <Button variant="outline" onClick={() => redirect("list", "sequences")}>
          Tillbaka
        </Button>
      </TopToolbar>

      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-lg font-semibold mb-4">Skapa sekvens</h2>

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

          <div>
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

          {triggerType === "scan_result" && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Enrolla företag med scan-poäng under
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Körs varje timme. Grinden (befintlig kund, sagt nej, enskild
                firma utan samtycke, mejlad senaste 90 dagarna) gäller alltid.
                Bara scans yngre än {DEFAULT_MAX_SCAN_AGE_DAYS} dagar räknas.
              </p>
            </div>
          )}

          <SequenceStepEditor steps={steps} onChange={setSteps} />

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Sparar..." : "Spara sekvens"}
            </Button>
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
