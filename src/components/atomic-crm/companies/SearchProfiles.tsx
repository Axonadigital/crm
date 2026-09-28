import { useState, useEffect, useCallback } from "react";
import { useNotify } from "ra-core";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Settings2,
  Plus,
  Trash2,
  Play,
  Loader2,
  Zap,
  Clock,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../providers/supabase/supabase";

interface SearchProfile {
  id?: number;
  name: string;
  query_template: string;
  branch: string;
  city: string;
  extra_keywords: string[];
  min_rating: number;
  max_results: number;
  is_active: boolean;
  auto_enrich: boolean;
  last_run_at?: string;
  last_run_results?: number;
  total_leads_generated?: number;
}

const DEFAULT_PROFILE: Omit<SearchProfile, "id"> = {
  name: "",
  query_template: "{bransch} i {stad}",
  branch: "",
  city: "",
  extra_keywords: [],
  min_rating: 0,
  max_results: 20,
  is_active: true,
  auto_enrich: true,
};

export const SearchProfiles = () => {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [editingProfile, setEditingProfile] = useState<SearchProfile | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const notify = useNotify();

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("search_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProfiles(data ?? []);
    } catch {
      notify("Kunde inte ladda sökprofiler", { type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (open) {
      fetchProfiles();
    }
  }, [open, fetchProfiles]);

  const handleSave = async () => {
    if (!editingProfile) return;

    if (!editingProfile.branch.trim() || !editingProfile.city.trim()) {
      notify("Bransch och stad krävs", { type: "warning" });
      return;
    }

    const profileName =
      editingProfile.name || `${editingProfile.branch} ${editingProfile.city}`;

    const profileData = {
      name: profileName,
      query_template: editingProfile.query_template,
      branch: editingProfile.branch,
      city: editingProfile.city,
      extra_keywords: editingProfile.extra_keywords,
      min_rating: editingProfile.min_rating,
      max_results: editingProfile.max_results,
      is_active: editingProfile.is_active,
      auto_enrich: editingProfile.auto_enrich,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingProfile.id) {
        const { error } = await supabase
          .from("search_profiles")
          .update(profileData)
          .eq("id", editingProfile.id);
        if (error) throw error;
        notify("Profil uppdaterad", { type: "success" });
      } else {
        const { error } = await supabase
          .from("search_profiles")
          .insert(profileData);
        if (error) throw error;
        notify("Profil skapad", { type: "success" });
      }

      setEditingProfile(null);
      setShowForm(false);
      fetchProfiles();
    } catch {
      notify("Kunde inte spara profil", { type: "error" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase
        .from("search_profiles")
        .delete()
        .eq("id", id);
      if (error) throw error;
      notify("Profil borttagen", { type: "success" });
      fetchProfiles();
    } catch {
      notify("Kunde inte ta bort profil", { type: "error" });
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("search_profiles")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p)),
      );
    } catch {
      notify("Kunde inte uppdatera profil", { type: "error" });
    }
  };

  const handleRunProfile = async (profileId: number) => {
    setIsRunning(profileId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        notify("Du måste vara inloggad", { type: "error" });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto_scrape`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ profile_id: profileId }),
        },
      );

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMsg = errorBody.message || errorMsg;
        } catch {
          errorMsg = await response.text().catch(() => errorMsg);
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();

      if (!result.summary) {
        notify(result.message || "Inga resultat", { type: "info" });
        fetchProfiles();
        return;
      }

      const summary = result.summary;
      notify(
        `${summary.total_new_leads} nya leads importerade, ${summary.total_enriched} enrichade, ${summary.total_duplicates_skipped} dubbletter skippade`,
        { type: "success" },
      );

      fetchProfiles();
    } catch (error) {
      notify(`Fel: ${(error as Error).message}`, { type: "error" });
    } finally {
      setIsRunning(null);
    }
  };

  const handleRunAll = async () => {
    setIsRunning(-1);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        notify("Du måste vara inloggad", { type: "error" });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto_scrape`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMsg = errorBody.message || errorMsg;
        } catch {
          errorMsg = await response.text().catch(() => errorMsg);
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();

      if (!result.summary) {
        notify(result.message || "Inga profiler att köra", { type: "info" });
        fetchProfiles();
        return;
      }

      const summary = result.summary;
      notify(
        `Klart! ${summary.profiles_processed} profiler körda: ${summary.total_new_leads} nya leads, ${summary.total_enriched} enrichade`,
        { type: "success" },
      );

      fetchProfiles();
    } catch (error) {
      notify(`Fel: ${(error as Error).message}`, { type: "error" });
    } finally {
      setIsRunning(null);
    }
  };

  const handleReEnrichAll = async () => {
    setIsRunning(-2);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        notify("Du måste vara inloggad", { type: "error" });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto_scrape`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "re_enrich" }),
        },
      );

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMsg = errorBody.message || errorMsg;
        } catch {
          errorMsg = await response.text().catch(() => errorMsg);
        }
        throw new Error(errorMsg);
      }

      const result = await response.json();
      notify(
        `Klart! ${result.re_enriched} av ${result.total_candidates} företag enrichade (sociala medier, webbkvalité, Allabolag)`,
        { type: "success" },
      );
    } catch (error) {
      notify(`Fel: ${(error as Error).message}`, { type: "error" });
    } finally {
      setIsRunning(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Aldrig";
    return new Date(dateStr).toLocaleString("sv-SE", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Sökprofiler
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automatiska sökprofiler</DialogTitle>
          <DialogDescription>
            Konfigurera vilka typer av företag som ska scrapes automatiskt.
            Varje profil söker efter en specifik bransch i en stad.
          </DialogDescription>
        </DialogHeader>

        {showForm && editingProfile ? (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bransch *</Label>
                <Input
                  placeholder="t.ex. restauranger, frisörer, tandläkare"
                  value={editingProfile.branch}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      branch: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Stad *</Label>
                <Input
                  placeholder="t.ex. Östersund, Stockholm"
                  value={editingProfile.city}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      city: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Sökmall</Label>
                <Input
                  value={editingProfile.query_template}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      query_template: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Använd {"{bransch}"} och {"{stad}"} som platshållare
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Extra nyckelord (kommaseparerat)</Label>
                <Input
                  placeholder="t.ex. litet, nystartat"
                  value={editingProfile.extra_keywords.join(", ")}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      extra_keywords: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Min Google-betyg</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  step={0.5}
                  value={editingProfile.min_rating}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      min_rating: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Max resultat</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={editingProfile.max_results}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      max_results: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingProfile.auto_enrich}
                    onCheckedChange={(checked) =>
                      setEditingProfile({
                        ...editingProfile,
                        auto_enrich: checked,
                      })
                    }
                  />
                  <Label>Auto-enrich</Label>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingProfile(null);
                }}
              >
                Avbryt
              </Button>
              <Button onClick={handleSave}>Spara profil</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditingProfile({ ...DEFAULT_PROFILE });
                  setShowForm(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ny profil
              </Button>
              {profiles.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRunAll}
                  disabled={isRunning !== null}
                >
                  {isRunning === -1 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Kör alla...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Kör alla profiler
                    </>
                  )}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleReEnrichAll}
                disabled={isRunning !== null}
              >
                {isRunning === -2 ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enrichar...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Enricha alla leads
                  </>
                )}
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Inga sökprofiler skapade. Skapa en för att börja automatisk
                scraping.
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Namn</TableHead>
                      <TableHead>Bransch</TableHead>
                      <TableHead>Stad</TableHead>
                      <TableHead>Max</TableHead>
                      <TableHead>Senaste körning</TableHead>
                      <TableHead>Totalt</TableHead>
                      <TableHead>Aktiv</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell className="font-medium">
                          {profile.name}
                          {profile.auto_enrich && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Auto-enrich
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{profile.branch}</TableCell>
                        <TableCell>{profile.city}</TableCell>
                        <TableCell>{profile.max_results}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDate(profile.last_run_at)}
                            {profile.last_run_results != null &&
                              profile.last_run_results > 0 && (
                                <Badge variant="secondary" className="ml-1">
                                  +{profile.last_run_results}
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {profile.total_leads_generated ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={profile.is_active}
                            onCheckedChange={(checked) =>
                              handleToggleActive(profile.id!, checked)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleRunProfile(profile.id!)}
                              disabled={isRunning !== null}
                            >
                              {isRunning === profile.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingProfile(profile);
                                setShowForm(true);
                              }}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(profile.id!)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Stäng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
