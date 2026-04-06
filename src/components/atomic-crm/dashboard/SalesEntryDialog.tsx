import {
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  parseISO,
} from "date-fns";
import { sv } from "date-fns/locale";
import { Check, ChevronsUpDown } from "lucide-react";
import { useCreate, useGetList, useNotify, useTranslate } from "ra-core";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { Company, Contact, Deal } from "../types";
import type { PeriodType } from "./useSalesTracking";

interface SalesEntryDialogProps {
  open: boolean;
  onClose: () => void;
  periodType: PeriodType;
}

// Convert the input value to a canonical period_date (start of period)
function toPeriodDate(rawValue: string, periodType: PeriodType): string {
  if (!rawValue) return format(new Date(), "yyyy-MM-dd");
  switch (periodType) {
    case "day":
      return rawValue; // already YYYY-MM-DD
    case "week": {
      // type="week" gives "2026-W15" → parse to a date
      const [yearStr, weekStr] = rawValue.split("-W");
      const year = Number(yearStr);
      const week = Number(weekStr);
      // Jan 4 is always in week 1 per ISO 8601
      const jan4 = new Date(year, 0, 4);
      const jan4Monday = startOfWeek(jan4, { weekStartsOn: 1 });
      const weekStart = new Date(
        jan4Monday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000,
      );
      return format(weekStart, "yyyy-MM-dd");
    }
    case "month":
      return `${rawValue}-01`; // "2026-04" → "2026-04-01"
  }
}

// Build default input value for each period type
function getDefaultInputValue(periodType: PeriodType): string {
  const now = new Date();
  switch (periodType) {
    case "day":
      return format(startOfDay(now), "yyyy-MM-dd");
    case "week":
      return format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-'W'ww", {
        locale: sv,
      });
    case "month":
      return format(startOfMonth(now), "yyyy-MM");
  }
}

interface ComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: { id: string | number; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
}

function Combobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.id) === String(value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? selected.label : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground italic"
                >
                  Rensa val
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={String(opt.label)}
                  onSelect={() => {
                    onChange(String(opt.id));
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      String(value) === String(opt.id)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SalesEntryDialog({
  open,
  onClose,
  periodType,
}: SalesEntryDialogProps) {
  const [create, { isPending }] = useCreate();
  const translate = useTranslate();
  const notify = useNotify();

  const [amount, setAmount] = useState("");
  const [dateValue, setDateValue] = useState(getDefaultInputValue(periodType));
  const [description, setDescription] = useState("");
  const [dealId, setDealId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);

  // Fetch options for link fields
  const { data: deals } = useGetList<Deal>("deals", {
    pagination: { perPage: 200, page: 1 },
    sort: { field: "name", order: "ASC" },
    filter: { "archived_at@is": null },
  });
  const { data: companies } = useGetList<Company>("companies", {
    pagination: { perPage: 200, page: 1 },
    sort: { field: "name", order: "ASC" },
  });
  const { data: contacts } = useGetList<Contact>("contacts", {
    pagination: { perPage: 200, page: 1 },
    sort: { field: "last_name", order: "ASC" },
  });

  const dealOptions = useMemo(
    () =>
      (deals ?? []).map((d) => ({
        id: d.id,
        label: `${d.name} · ${d.amount ? d.amount.toLocaleString("sv-SE") + " kr" : "–"}`,
      })),
    [deals],
  );
  const companyOptions = useMemo(
    () => (companies ?? []).map((c) => ({ id: c.id, label: c.name })),
    [companies],
  );
  const contactOptions = useMemo(
    () =>
      (contacts ?? []).map((c) => ({
        id: c.id,
        label: `${c.first_name} ${c.last_name}`.trim(),
      })),
    [contacts],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) return;

    create(
      "sales_entries",
      {
        data: {
          amount: numAmount,
          period_type: periodType,
          period_date: toPeriodDate(dateValue, periodType),
          description: description || undefined,
          deal_id: dealId ? Number(dealId) : undefined,
          company_id: companyId ? Number(companyId) : undefined,
          contact_id: contactId ? Number(contactId) : undefined,
        },
      },
      {
        onSuccess: () => {
          notify("crm.dashboard.sales_tracking.saved", {
            type: "success",
            messageArgs: { _: "Försäljning sparad" },
          });
          setAmount("");
          setDescription("");
          setDealId(null);
          setCompanyId(null);
          setContactId(null);
          setDateValue(getDefaultInputValue(periodType));
          onClose();
        },
        onError: () => {
          notify("crm.dashboard.sales_tracking.save_error", {
            type: "error",
            messageArgs: { _: "Kunde inte spara. Försök igen." },
          });
        },
      },
    );
  };

  const periodInputLabel =
    periodType === "day" ? "Dag" : periodType === "week" ? "Vecka" : "Månad";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lägg till försäljning</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Amount */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Belopp (kr)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50 000"
            />
          </div>

          {/* Period date */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="period_date">{periodInputLabel}</Label>
            <Input
              id="period_date"
              type={
                periodType === "day"
                  ? "date"
                  : periodType === "week"
                    ? "week"
                    : "month"
              }
              required
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
            />
          </div>

          {/* Optional links */}
          <div className="flex flex-col gap-3">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">
              Länka till (valfritt)
            </Label>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal" className="text-sm">
                Deal
              </Label>
              <Combobox
                value={dealId}
                onChange={setDealId}
                options={dealOptions}
                placeholder="Välj deal..."
                searchPlaceholder="Sök deal..."
                emptyText="Inga deals hittades"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company" className="text-sm">
                Företag
              </Label>
              <Combobox
                value={companyId}
                onChange={setCompanyId}
                options={companyOptions}
                placeholder="Välj företag..."
                searchPlaceholder="Sök företag..."
                emptyText="Inga företag hittades"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact" className="text-sm">
                Kontakt
              </Label>
              <Combobox
                value={contactId}
                onChange={setContactId}
                options={contactOptions}
                placeholder="Välj kontakt..."
                searchPlaceholder="Sök kontakt..."
                emptyText="Inga kontakter hittades"
              />
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Kommentar (valfri)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="T.ex. vilka kunder, projekt eller typ av tjänst..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {translate("ra.action.cancel", { _: "Avbryt" })}
            </Button>
            <Button type="submit" disabled={isPending}>
              {translate("ra.action.save", { _: "Spara" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
