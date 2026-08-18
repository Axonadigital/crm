import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Database,
  FileText,
  Handshake,
  LayoutDashboard,
  LineChart,
  Mail,
  Phone,
  Radar,
  Receipt,
  Repeat,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  /** When true, only matches the exact path (used for the dashboard root). */
  end?: boolean;
  icon: typeof LayoutDashboard;
  /** Extra paths that should also mark this item active. */
  alsoMatch?: string[];
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/**
 * Stable anchor for the guided tour. We can't rely on `a[href="…"]` because
 * react-admin mounts the router with a basename, so the rendered href is not
 * the literal `to` path. Exported so the tour anchor test can derive the same
 * set of anchors instead of duplicating the rule. See tours.desktop.ts.
 */
export function navTourAnchor(to: string): string {
  return to === "/"
    ? "nav-dashboard"
    : `nav-${to.replace(/^\//, "").replace(/_/g, "-")}`;
}

/**
 * Curated navigation for the CRM, grouped by purpose. Replaces the previous
 * horizontal top-tab navigation with a left sidebar. The route list mirrors the
 * original Header tabs so no destination is lost.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Översikt",
    items: [
      { label: "Dashboard", to: "/", end: true, icon: LayoutDashboard },
      { label: "Kundradar", to: "/customer-radar", icon: Radar },
      { label: "Ringlista", to: "/call-queue", icon: Phone },
      { label: "Kalender", to: "/calendar", icon: CalendarDays },
      { label: "Email-statistik", to: "/email-stats", icon: Mail },
    ],
  },
  {
    label: "Sälj",
    items: [
      { label: "Kontakter", to: "/contacts", icon: Users },
      { label: "Företag", to: "/companies", icon: Building2 },
      { label: "Deals", to: "/deals", icon: Handshake },
      { label: "Offerter", to: "/quotes", icon: FileText },
      { label: "Fakturor", to: "/invoices", icon: Receipt },
      { label: "Ekonomi", to: "/economy", icon: Wallet },
      { label: "Likviditet", to: "/liquidity", icon: LineChart },
      { label: "Abonnemang", to: "/subscriptions", icon: Repeat },
      { label: "Kundtäckning", to: "/customer-coverage", icon: ClipboardCheck },
    ],
  },
  {
    label: "Inflöde",
    items: [
      {
        label: "Leadimport",
        to: "/lead_import_sources",
        icon: Database,
        alsoMatch: ["/lead_import_runs"],
      },
    ],
  },
];
