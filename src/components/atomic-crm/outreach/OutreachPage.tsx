import { useState } from "react";
import { useGetList, useNotify, useRefresh, useDataProvider } from "ra-core";
import { Link } from "react-router";
import { Image, Phone, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { supabase } from "../providers/supabase/supabase";

/**
 * Outreach — det fyrstegsflödet behöver en människa till:
 *  1. leveransen till steg 2 (före/efter-bild eller skiss) — URL:en klistras
 *     in här, sedan skickar motorn mejl två av sig själv;
 *  2. tratten per steg och A/B-grupp, så att vi ser vad som ger svar;
 *  3. matning av ringlistan med juridiska personer som saknar e-post.
 * Samtalen i steg 3 hamnar i den vanliga ringlistan (/call-queue).
 */

type Enrollment = {
  id: number;
  company_id: number | null;
  contact_id: number;
  current_step: number;
  status: string;
  next_action_at: string | null;
  asset_url: string | null;
  krok_familj: string | null;
  ab_variant: string | null;
};

type Company = { id: number; name: string; website: string | null };

type FunnelRow = {
  id: string;
  sekvens: string;
  step: number;
  ab_variant: string | null;
  krok_familj: string | null;
  skickade: number;
  utforda: number;
  vantar_bild: number;
  hoppade_over: number;
  svarade: number | null;
  sa_nej: number | null;
  studsade: number | null;
  vidare: number | null;
};

const BILD_FAMILJER = new Set(["slow-mobile", "poor-crux", "not-mobile", "parked", "no-site"]);
const FAMILJ_LABEL: Record<string, string> = {
  "slow-mobile": "Långsam på mobil",
  "poor-crux": "Långsam enligt besökardata",
  "not-mobile": "Inte mobilanpassad",
  unreachable: "Svarar inte",
  "no-https": "Saknar HTTPS",
  noindex: "Blockerad från Google",
  parked: "Platshållarsida",
  "no-gbp": "Ingen Google-profil",
  "no-site": "Ingen egen hemsida",
};

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) : "–";

export function OutreachPage() {
  return (
    <>
      <MobileHeader title="Outreach" />
      <MobileContent>
        <div className="flex flex-col gap-6 p-4 md:p-6">
          <div>
            <h1 className="text-2xl font-semibold">Outreach</h1>
            <p className="text-sm text-muted-foreground">
              Fyra steg över 21 dagar: observationen, leveransen, samtal eller referens, avslut.
              Samtalen ligger i <Link className="underline" to="/call-queue">ringlistan</Link>.
            </p>
          </div>
          <VantarPaLeverans />
          <Tratt />
          <Ringlistematning />
        </div>
      </MobileContent>
    </>
  );
}

function VantarPaLeverans() {
  const { data, isPending } = useGetList<Enrollment>("sequence_enrollments", {
    filter: { "status@eq": "active", "current_step@eq": 1 },
    sort: { field: "next_action_at", order: "ASC" },
    pagination: { page: 1, perPage: 100 },
  });
  const rows = (data ?? []).filter(
    (e) => !e.asset_url && e.krok_familj && BILD_FAMILJER.has(e.krok_familj),
  );
  const ids = rows.map((r) => r.company_id).filter((id): id is number => id != null);
  const { data: companies } = useGetList<Company>("companies", {
    filter: { "id@in": `(${ids.length ? ids.join(",") : "0"})` },
    pagination: { page: 1, perPage: 100 },
  });
  const byId = new Map((companies ?? []).map((c) => [c.id, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Image className="h-4 w-4" /> Väntar på leverans till steg 2 ({rows.length})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Mejl ett har gått. Mejl två skickas av sig självt när bildens URL är inklistrad här.
          Ligger URL:en inte inne när steget förfaller väntar motorn.
        </p>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inget väntar just nu.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((e) => (
              <LeveransRad key={e.id} enrollment={e} company={byId.get(e.company_id ?? -1)} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeveransRad({ enrollment, company }: { enrollment: Enrollment; company?: Company }) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const giltig = /^https:\/\/\S+\.(png|jpe?g|webp)(\?\S*)?$/i.test(url.trim());

  const spara = async () => {
    setSaving(true);
    try {
      await dataProvider.update("sequence_enrollments", {
        id: enrollment.id,
        data: { asset_url: url.trim() },
        previousData: enrollment,
      });
      notify("Bilden sparad. Mejl två går vid nästa körning inom sändfönstret.", { type: "success" });
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Kunde inte spara", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {company ? (
            <Link className="underline-offset-2 hover:underline" to={`/companies/${company.id}/show`}>
              {company.name}
            </Link>
          ) : (
            `Enrollment ${enrollment.id}`
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {FAMILJ_LABEL[enrollment.krok_familj ?? ""] ?? enrollment.krok_familj}
          {company?.website ? ` · ${company.website.replace(/^https?:\/\/(www\.)?/, "")}` : ""}
          {` · steg 2 förfaller ${datum(enrollment.next_action_at)}`}
        </div>
      </div>
      <div className="flex w-full gap-2 md:w-[480px]">
        <Input
          id={`asset-${enrollment.id}`}
          placeholder="https://…/fore-efter.png"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button size="sm" disabled={!giltig || saving} onClick={spara}>
          <Save className="mr-1 h-4 w-4" /> Spara
        </Button>
      </div>
    </div>
  );
}

function Tratt() {
  const { data, isPending } = useGetList<FunnelRow>("outreach_funnel", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "step", order: "ASC" },
  });
  const rows = data ?? [];
  const pct = (a: number | null | undefined, b: number) =>
    b > 0 && a != null ? `${((100 * a) / b).toFixed(1)} %` : "–";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tratt per steg och grupp</CardTitle>
        <p className="text-sm text-muted-foreground">
          Riktvärde för byrå mot småföretag: 2,5–4,5 % svar, de bästa över 7 %. Under 30 utskick per rad
          säger siffran ingenting.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inget skickat i det här flödet ännu.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sekvens</TableHead>
                <TableHead>Steg</TableHead>
                <TableHead>Grupp</TableHead>
                <TableHead>Krok</TableHead>
                <TableHead className="text-right">Skickade</TableHead>
                <TableHead className="text-right">Väntar bild</TableHead>
                <TableHead className="text-right">Svar</TableHead>
                <TableHead className="text-right">Nej</TableHead>
                <TableHead className="text-right">Studs</TableHead>
                <TableHead className="text-right">Vidare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{r.sekvens}</TableCell>
                  <TableCell>{r.step}</TableCell>
                  <TableCell>{r.ab_variant === "call" ? "Samtal" : r.ab_variant === "email" ? "Mejl" : "–"}</TableCell>
                  <TableCell className="whitespace-nowrap">{FAMILJ_LABEL[r.krok_familj ?? ""] ?? r.krok_familj ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.skickade + r.utforda}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.vantar_bild}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.svarade ?? 0} ({pct(r.svarade, r.skickade)})</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sa_nej ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.studsade ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.vidare ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Ringlistematning() {
  const [preview, setPreview] = useState<Array<{ company_id: number; name: string; phone: string; note: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useNotify();

  const kör = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("outreach_feed_call_queue", { p_limit: 20, p_dry_run: dryRun });
      if (error) throw error;
      setPreview(data ?? []);
      if (!dryRun) notify(`${(data ?? []).length} företag lagda i ringlistan`, { type: "success" });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Kunde inte hämta", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-4 w-4" /> Mata ringlistan
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Aktiebolag och andra juridiska personer med telefonnummer men utan e-postadress, där skanningen
          har ett fynd vi får citera. De hamnar i ringlistan med fyndet som notering. Enskilda firmor tas
          aldrig med.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => kör(true)}>
            <RefreshCw className="mr-1 h-4 w-4" /> Visa nästa 20
          </Button>
          <Button size="sm" disabled={busy || !preview || preview.length === 0} onClick={() => kör(false)}>
            Lägg dem i ringlistan
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/call-queue">Öppna ringlistan</Link>
          </Button>
        </div>
        {preview && (
          <ul className="flex flex-col gap-1 text-sm">
            {preview.length === 0 && <li className="text-muted-foreground">Inga fler att lägga till just nu.</li>}
            {preview.map((p) => (
              <li key={p.company_id} className="rounded border px-3 py-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground"> · {p.phone}</span>
                <div className="text-xs text-muted-foreground">{p.note}</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

OutreachPage.path = "/outreach";
