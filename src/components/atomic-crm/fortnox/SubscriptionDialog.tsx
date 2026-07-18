import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify } from "ra-core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { CrmDataProvider } from "../providers/types";
import type { Subscription, SubscriptionInput } from "../types";

const CATEGORIES = [
  "AI-verktyg",
  "Hosting/Infra",
  "Design",
  "Produktivitet",
  "Bank/Ekonomi",
  "Övrigt",
];

const STATUS_OPTIONS: { value: Subscription["status"]; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausad" },
  { value: "ended", label: "Avslutad" },
];

const parseAliases = (raw: string): string[] =>
  raw
    .split(",")
    .map((a) => a.trim().toUpperCase())
    .filter((a) => a.length > 0);

type FormState = {
  name: string;
  category: string;
  monthly_amount: string;
  status: Subscription["status"];
  started_on: string;
  ended_on: string;
  aliases: string;
  notes: string;
};

const emptyForm = (seed?: Partial<FormState>): FormState => ({
  name: "",
  category: "AI-verktyg",
  monthly_amount: "",
  status: "active",
  started_on: "",
  ended_on: "",
  aliases: "",
  notes: "",
  ...seed,
});

const fromSubscription = (s: Subscription): FormState => ({
  name: s.name,
  category: s.category ?? "Övrigt",
  monthly_amount: String(s.monthly_amount),
  status: s.status,
  started_on: s.started_on ?? "",
  ended_on: s.ended_on ?? "",
  aliases: s.aliases.join(", "),
  notes: s.notes ?? "",
});

/**
 * Add or edit a subscription in the manual registry. Edit mode is entered by
 * passing `subscription`; `seed` prefills a create form (used by the
 * "unregistered cost → add" shortcut).
 */
export const SubscriptionDialog = ({
  open,
  onOpenChange,
  subscription,
  seed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription?: Subscription;
  seed?: Partial<FormState>;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm(seed));

  useEffect(() => {
    if (open) {
      setForm(subscription ? fromSubscription(subscription) : emptyForm(seed));
    }
  }, [open, subscription, seed]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const input: SubscriptionInput = {
        name: form.name.trim(),
        category: form.category,
        monthly_amount: Number(form.monthly_amount) || 0,
        status: form.status,
        started_on: form.started_on || null,
        ended_on: form.ended_on || null,
        aliases: parseAliases(form.aliases),
        notes: form.notes.trim() || null,
      };
      return subscription
        ? dataProvider.updateSubscription(subscription.id, input)
        : dataProvider.createSubscription(input);
    },
    onSuccess: () => {
      notify(subscription ? "Abonnemang uppdaterat" : "Abonnemang tillagt", {
        type: "info",
      });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      onOpenChange(false);
    },
    onError: () => notify("Kunde inte spara abonnemanget", { type: "error" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {subscription ? "Redigera abonnemang" : "Nytt abonnemang"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sub-name">Namn / plan</Label>
            <Input
              id="sub-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Claude Max"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sub-amount">Kostnad / månad (kr)</Label>
              <Input
                id="sub-amount"
                type="number"
                inputMode="decimal"
                value={form.monthly_amount}
                onChange={(e) => set("monthly_amount", e.target.value)}
                placeholder="350"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select
                value={form.category}
                onValueChange={(v) => set("category", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  set("status", v as Subscription["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-start">Startdatum</Label>
              <Input
                id="sub-start"
                type="date"
                value={form.started_on}
                onChange={(e) => set("started_on", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-end">Slutdatum</Label>
              <Input
                id="sub-end"
                type="date"
                value={form.ended_on}
                onChange={(e) => set("ended_on", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-aliases">Alias (matchar bokföringen)</Label>
            <Input
              id="sub-aliases"
              value={form.aliases}
              onChange={(e) => set("aliases", e.target.value)}
              placeholder="CHATGPT, OPENAI *CHATGPT"
            />
            <p className="text-xs text-muted-foreground">
              Kommaseparerat. Textmönster som matchar leverantörens rader i
              bokföringen för avstämning.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sub-notes">Anteckning</Label>
            <Textarea
              id="sub-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            onClick={() => mutate()}
            disabled={isPending || form.name.trim().length === 0}
          >
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
