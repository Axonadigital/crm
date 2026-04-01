import { useState, useCallback } from "react";
import { useCreate, useNotify, useDataProvider } from "ra-core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Map,
  Search,
  Loader2,
  Building2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../providers/supabase/supabase";

interface GoogleMapsPlace {
  place_id: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews_count?: number;
  category?: string;
  latitude?: number;
  longitude?: number;
}

interface ScrapedPlaceWithSelection extends GoogleMapsPlace {
  selected: boolean;
  isDuplicate: boolean;
}

export const GoogleMapsScraper = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [places, setPlaces] = useState<ScrapedPlaceWithSelection[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [create] = useCreate();
  const notify = useNotify();
  const dataProvider = useDataProvider();

  const checkDuplicates = useCallback(
    async (placeIds: string[]): Promise<Set<string>> => {
      try {
        const { data } = await supabase
          .from("companies")
          .select("google_place_id")
          .in("google_place_id", placeIds);
        return new Set(
          (data ?? []).map(
            (row: { google_place_id: string }) => row.google_place_id,
          ),
        );
      } catch {
        return new Set();
      }
    },
    [],
  );

  const handleSearch = async () => {
    if (!query.trim()) {
      notify("Ange en sökfråga", { type: "warning" });
      return;
    }

    setIsSearching(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        notify("Du måste vara inloggad", { type: "error" });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google_maps_scraper`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            query,
            limit,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Scraping misslyckades");
      }

      const result = await response.json();

      if (result.success && result.data) {
        const placeIds = result.data
          .map((p: GoogleMapsPlace) => p.place_id)
          .filter(Boolean);
        const existingIds = await checkDuplicates(placeIds);
        const dupes = placeIds.filter((id: string) =>
          existingIds.has(id),
        ).length;
        setDuplicateCount(dupes);

        // Only show new companies — filter out duplicates entirely
        const newPlaces = result.data
          .filter(
            (place: GoogleMapsPlace) =>
              !place.place_id || !existingIds.has(place.place_id),
          )
          .map((place: GoogleMapsPlace) => ({
            ...place,
            selected: true,
            isDuplicate: false,
          }));

        setPlaces(newPlaces);

        if (newPlaces.length === 0 && dupes > 0) {
          notify(`Alla ${result.count} företag finns redan i CRM:et`, {
            type: "info",
          });
        } else {
          notify(
            `Hittade ${newPlaces.length} nya företag${dupes > 0 ? ` (${dupes} redan importerade filtrerades bort)` : ""}`,
            { type: "success" },
          );
        }
      } else {
        notify("Inga resultat hittades", { type: "info" });
        setPlaces([]);
        setDuplicateCount(0);
      }
    } catch (error) {
      notify(`Fel: ${(error as Error).message}`, { type: "error" });
      setPlaces([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSelection = (index: number) => {
    setPlaces((prev) =>
      prev.map((place, i) =>
        i === index ? { ...place, selected: !place.selected } : place,
      ),
    );
  };

  const toggleSelectAll = () => {
    const allSelected = places.every((p) => p.selected);
    setPlaces((prev) =>
      prev.map((place) => ({ ...place, selected: !allSelected })),
    );
  };

  const handleImport = async () => {
    const selectedPlaces = places.filter((p) => p.selected && !p.isDuplicate);

    if (selectedPlaces.length === 0) {
      notify("Välj minst ett nytt företag att importera", { type: "warning" });
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;
    const importedCompanyIds: number[] = [];

    for (const place of selectedPlaces) {
      try {
        const result = await new Promise<{ id: number }>((resolve, reject) => {
          create(
            "companies",
            {
              data: {
                name: place.name,
                address: place.address || "",
                city: extractCity(place.address || ""),
                zipcode: extractZipcode(place.address || ""),
                phone_number: place.phone || "",
                website: place.website || "",
                source: "google_maps",
                lead_status: "new",
                google_place_id: place.place_id || null,
                has_website:
                  !!place.website &&
                  !place.website.includes("facebook.com") &&
                  !place.website.includes("instagram.com"),
                industry: place.category || "",
              },
            },
            {
              onSuccess: (data) => {
                successCount++;
                resolve(data as { id: number });
              },
              onError: (error) => {
                errorCount++;
                reject(error);
              },
            },
          );
        });
        importedCompanyIds.push(result.id);
      } catch {
        errorCount++;
      }
    }

    // Auto-enrich imported companies in background
    if (importedCompanyIds.length > 0) {
      notify(`Enrichar ${importedCompanyIds.length} företag i bakgrunden...`, {
        type: "info",
      });
      (dataProvider as any)
        .bulkEnrichCompanies(importedCompanyIds)
        .then((results: Array<{ id: number; success: boolean }>) => {
          const enriched = results.filter((r) => r.success).length;
          notify(`${enriched} företag enrichade`, { type: "success" });
        })
        .catch(() => {
          notify("Enrichment misslyckades delvis", { type: "warning" });
        });
    }

    setIsImporting(false);

    if (successCount > 0) {
      notify(`${successCount} företag importerade`, { type: "success" });
    }
    if (errorCount > 0) {
      notify(`${errorCount} misslyckades`, { type: "warning" });
    }

    setOpen(false);
    setPlaces([]);
    setQuery("");
    setDuplicateCount(0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Map className="h-4 w-4" />
          Importera från Google Maps
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importera företag från Google Maps</DialogTitle>
          <DialogDescription>
            Sök efter företag på Google Maps och importera dem till ditt CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="search-query">Sökfråga</Label>
            <div className="flex gap-2">
              <Input
                id="search-query"
                placeholder="t.ex. 'restauranger i Stockholm' eller 'frisörer i Göteborg'"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSearching) {
                    handleSearch();
                  }
                }}
              />
              <Input
                type="number"
                className="w-24"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                placeholder="Max"
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching || !query.trim()}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Söker...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Sök
                  </>
                )}
              </Button>
            </div>
          </div>

          {places.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={places.every((p) => p.selected)}
                    onCheckedChange={toggleSelectAll}
                  />
                  <Label htmlFor="select-all" className="cursor-pointer">
                    Välj alla ({places.filter((p) => p.selected).length}/
                    {places.length})
                  </Label>
                </div>
                {duplicateCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {duplicateCount} redan importerade (filtrerade)
                  </div>
                )}
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Namn</TableHead>
                      <TableHead>Adress</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Webbplats</TableHead>
                      <TableHead>Betyg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {places.map((place, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Checkbox
                            checked={place.selected}
                            onCheckedChange={() => toggleSelection(index)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {place.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {place.address || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {place.phone || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {place.website ? (
                            <a
                              href={place.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Länk
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {place.rating ? (
                            <Badge variant="secondary">
                              ⭐ {place.rating} ({place.reviews_count})
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              isImporting ||
              places.length === 0 ||
              !places.some((p) => p.selected)
            }
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importerar...
              </>
            ) : (
              `Importera (${places.filter((p) => p.selected).length})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Hjälpfunktioner för att extrahera stad och postnummer från adress
function extractCity(address: string): string {
  // Enkel heuristik: Ta sista delen före landet
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    // Antag att näst sista delen är staden
    return parts[parts.length - 2];
  }
  return "";
}

function extractZipcode(address: string): string {
  // Hitta svenskt postnummer (XXX XX format)
  const match = address.match(/\b\d{3}\s?\d{2}\b/);
  return match ? match[0].replace(/\s/g, "") : "";
}
