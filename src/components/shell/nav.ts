export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/planner", label: "Planner" },
  { href: "/proposals", label: "Proposals" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/trello", label: "Trello" },
  { href: "/settings/integrations", label: "Integrations" },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
