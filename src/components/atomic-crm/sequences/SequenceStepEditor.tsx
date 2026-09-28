import { useState } from "react";
import {
  ArrowDown,
  Clock,
  Mail,
  ListTodo,
  TrendingUp,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { useGetList } from "ra-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export interface SequenceStep {
  step_number: number;
  delay_days: number;
  delay_hours: number;
  action_type: "send_email" | "create_task" | "update_lead_status";
  template_id: number | null;
  action_config: Record<string, unknown>;
}

const actionTypeIcons: Record<string, React.ReactNode> = {
  send_email: <Mail className="w-4 h-4" />,
  create_task: <ListTodo className="w-4 h-4" />,
  update_lead_status: <TrendingUp className="w-4 h-4" />,
};

const actionTypeLabels: Record<string, string> = {
  send_email: "Skicka e-post",
  create_task: "Skapa uppgift",
  update_lead_status: "Uppdatera lead-status",
};

const leadStatusOptions = [
  { id: "new", name: "Ny" },
  { id: "contacted", name: "Kontaktad" },
  { id: "qualified", name: "Kvalificerad" },
  { id: "proposal_sent", name: "Offert skickad" },
  { id: "nurture", name: "Nurture" },
];

interface SequenceStepEditorProps {
  steps: SequenceStep[];
  onChange: (steps: SequenceStep[]) => void;
}

export const SequenceStepEditor = ({
  steps,
  onChange,
}: SequenceStepEditorProps) => {
  const { data: templates } = useGetList("email_templates", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  const addStep = () => {
    const newStep: SequenceStep = {
      step_number: steps.length + 1,
      delay_days: steps.length === 0 ? 0 : 2,
      delay_hours: 0,
      action_type: "send_email",
      template_id: null,
      action_config: {},
    };
    onChange([...steps, newStep]);
  };

  const removeStep = (index: number) => {
    const updated = steps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, step_number: i + 1 }));
    onChange(updated);
  };

  const updateStep = (index: number, partial: Partial<SequenceStep>) => {
    const updated = steps.map((s, i) =>
      i === index ? { ...s, ...partial } : s,
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Steg</label>

      {steps.map((step, index) => (
        <div key={index}>
          {index > 0 && (
            <div className="flex items-center gap-2 py-2 pl-6">
              <ArrowDown className="w-4 h-4 text-muted-foreground" />
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  value={step.delay_days}
                  onChange={(e) =>
                    updateStep(index, {
                      delay_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-16 h-7 text-xs"
                />
                <span className="text-xs text-muted-foreground">dagar</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={step.delay_hours}
                  onChange={(e) =>
                    updateStep(index, {
                      delay_hours: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-16 h-7 text-xs"
                />
                <span className="text-xs text-muted-foreground">timmar</span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border p-3 bg-card">
            <GripVertical className="w-4 h-4 mt-1 text-muted-foreground shrink-0" />

            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {step.step_number}
                </Badge>
                <Select
                  value={step.action_type}
                  onValueChange={(v) =>
                    updateStep(index, {
                      action_type: v as SequenceStep["action_type"],
                      template_id: null,
                      action_config: {},
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(actionTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-1.5">
                          {actionTypeIcons[key]} {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {step.action_type === "send_email" && (
                <Select
                  value={step.template_id ? String(step.template_id) : ""}
                  onValueChange={(v) =>
                    updateStep(index, { template_id: parseInt(v) })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Välj e-postmall..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {step.action_type === "create_task" && (
                <div className="space-y-1.5">
                  <Input
                    placeholder="Uppgiftstext..."
                    value={(step.action_config.task_text as string) || ""}
                    onChange={(e) =>
                      updateStep(index, {
                        action_config: {
                          ...step.action_config,
                          task_text: e.target.value,
                        },
                      })
                    }
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      Förfaller om
                    </span>
                    <Input
                      type="number"
                      min={1}
                      value={(step.action_config.due_days as number) || 1}
                      onChange={(e) =>
                        updateStep(index, {
                          action_config: {
                            ...step.action_config,
                            due_days: parseInt(e.target.value) || 1,
                          },
                        })
                      }
                      className="w-16 h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">dagar</span>
                  </div>
                </div>
              )}

              {step.action_type === "update_lead_status" && (
                <Select
                  value={(step.action_config.lead_status as string) || ""}
                  onValueChange={(v) =>
                    updateStep(index, {
                      action_config: {
                        ...step.action_config,
                        lead_status: v,
                      },
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Välj ny status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leadStatusOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => removeStep(index)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addStep}
        type="button"
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Lägg till steg
      </Button>
    </div>
  );
};
