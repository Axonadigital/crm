import { useState } from "react";
import { Link } from "react-router";
import {
  LogOut,
  Mail,
  Menu,
  Moon,
  RotateCw,
  Settings as SettingsIcon,
  Smartphone,
  Sun,
  Users,
  Workflow,
} from "lucide-react";
import {
  useGetIdentity,
  useLoading,
  useLogout,
  useRefresh,
  useTranslate,
} from "ra-core";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/components/admin/use-theme";

/**
 * Hamburger-style user menu for the mobile layout.
 *
 * Opens a right-side sheet containing the user's identity, a theme switcher,
 * a refresh action, a settings shortcut, and logout. This complements the
 * bottom navigation by exposing account-level actions that desktop shows in
 * its top-right header but which mobile otherwise hides.
 */
export const MobileUserMenu = () => {
  const [open, setOpen] = useState(false);
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const { theme, setTheme } = useTheme();
  const refresh = useRefresh();
  const loading = useLoading();
  const logout = useLogout();

  const handleRefresh = () => {
    refresh();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
          aria-label={translate("crm.navigation.open_menu", {
            _: "Öppna meny",
          })}
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
        <SheetHeader className="p-4">
          <SheetTitle className="sr-only">
            {translate("crm.navigation.menu", { _: "Meny" })}
          </SheetTitle>
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              <AvatarImage src={identity?.avatar} role="presentation" />
              <AvatarFallback>
                {identity?.fullName?.charAt(0) ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium">
                {identity?.fullName ?? ""}
              </p>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {translate("crm.theme.label", { _: "Tema" })}
            </p>
            <ToggleGroup
              type="single"
              value={theme}
              onValueChange={(value) =>
                value && setTheme(value as "light" | "dark" | "system")
              }
              variant="outline"
              className="w-full"
            >
              <ToggleGroupItem
                value="system"
                aria-label={translate("crm.theme.system", { _: "System" })}
                className="flex-1 gap-2 h-11"
              >
                <Smartphone className="size-4" />
                <span className="text-sm">
                  {translate("crm.theme.system", { _: "System" })}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="light"
                aria-label={translate("crm.theme.light", { _: "Ljust" })}
                className="flex-1 gap-2 h-11"
              >
                <Sun className="size-4" />
                <span className="text-sm">
                  {translate("crm.theme.light", { _: "Ljust" })}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="dark"
                aria-label={translate("crm.theme.dark", { _: "Mörkt" })}
                className="flex-1 gap-2 h-11"
              >
                <Moon className="size-4" />
                <span className="text-sm">
                  {translate("crm.theme.dark", { _: "Mörkt" })}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start h-12 text-base"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RotateCw
                className={`size-5 mr-3 ${loading ? "animate-spin" : ""}`}
              />
              {translate("ra.action.refresh", { _: "Uppdatera" })}
            </Button>

            <Button
              asChild
              variant="outline"
              className="w-full justify-start h-12 text-base"
              onClick={() => setOpen(false)}
            >
              <Link to="/settings">
                <SettingsIcon className="size-5 mr-3" />
                {translate("crm.settings.title", { _: "Inställningar" })}
              </Link>
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {translate("crm.navigation.more", { _: "Mer" })}
            </p>
            <Button
              asChild
              variant="outline"
              className="w-full justify-start h-12 text-base"
              onClick={() => setOpen(false)}
            >
              <Link to="/sales">
                <Users className="size-5 mr-3" />
                {translate("resources.sales.name", {
                  smart_count: 2,
                  _: "Säljare",
                })}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full justify-start h-12 text-base"
              onClick={() => setOpen(false)}
            >
              <Link to="/sequences">
                <Workflow className="size-5 mr-3" />
                {translate("resources.sequences.name", {
                  smart_count: 2,
                  _: "Sekvenser",
                })}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full justify-start h-12 text-base"
              onClick={() => setOpen(false)}
            >
              <Link to="/email_templates">
                <Mail className="size-5 mr-3" />
                {translate("resources.email_templates.name", {
                  smart_count: 2,
                  _: "E-postmallar",
                })}
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-auto p-4">
          <Button
            type="button"
            variant="destructive"
            className="w-full h-12 text-base"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut className="size-5 mr-3" />
            {translate("ra.auth.logout", { _: "Logga ut" })}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
