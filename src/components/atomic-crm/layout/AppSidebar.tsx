import { Link, useMatch } from "react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { TourLauncher } from "../tour";
import { NAV_SECTIONS, navTourAnchor, type NavItem } from "./navSections";

export function AppSidebar() {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const { openMobile, setOpenMobile } = useSidebar();

  const handleClick = () => {
    if (openMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link to="/" onClick={handleClick}>
                <img
                  className="[.light_&]:hidden h-6 w-auto"
                  src={darkModeLogo}
                  alt={title}
                />
                <img
                  className="[.dark_&]:hidden h-6 w-auto"
                  src={lightModeLogo}
                  alt={title}
                />
                <span className="text-base font-semibold truncate">
                  {title}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavMenuItem
                    key={item.to}
                    item={item}
                    onClick={handleClick}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <TourLauncher />
      </SidebarFooter>
    </Sidebar>
  );
}

const NEVER_MATCH = "__never__";

const NavMenuItem = ({
  item,
  onClick,
}: {
  item: NavItem;
  onClick?: () => void;
}) => {
  const primaryMatch = useMatch({ path: item.to, end: item.end ?? false });
  const extraMatch = useMatch({
    path: item.alsoMatch?.[0] ?? NEVER_MATCH,
    end: false,
  });
  const isActive = !!primaryMatch || !!extraMatch;
  const Icon = item.icon;
  const tourAnchor = navTourAnchor(item.to);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <Link
          to={item.to}
          state={{ _scrollToTop: true }}
          onClick={onClick}
          data-tour={tourAnchor}
        >
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};
