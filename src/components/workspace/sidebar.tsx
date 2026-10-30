"use client";

import Link from "next/link";
import { Tooltip } from "@base-ui/react/tooltip";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  ListTodo,
  CalendarDays,
  Files,
  Building2,
  UsersRound,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/styles";

const modules: { name: string; icon: LucideIcon; href?: string }[] = [
  { name: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { name: "Rekrutacje", icon: BriefcaseBusiness, href: "/recruitments" },
  { name: "Zadania", icon: ListTodo },
  { name: "Kalendarz", icon: CalendarDays },
  { name: "Dokumenty", icon: Files },
  { name: "Firmy", icon: Building2 },
  { name: "Kontakty", icon: UsersRound },
];

export function SidebarNavigation({
  pathname,
  collapsed = false,
  onNavigate,
}: {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Tooltip.Provider delay={300}>
      <nav aria-label="Główna nawigacja" className="space-y-1">
        {modules.map(({ name, icon: Icon, href }) => {
          const current = Boolean(
            href && (pathname === href || pathname.startsWith(`${href}/`)),
          );
          const className = `flex min-h-11 min-w-0 items-center gap-3 rounded-md px-3 text-sm ${collapsed ? "justify-center" : ""} ${current ? "bg-accent font-semibold text-primary" : href ? "text-muted-foreground hover:bg-accent/60 hover:text-foreground" : "text-muted-foreground"}`;
          const content = (
            <>
              <Icon aria-hidden="true" size={18} className="shrink-0" />
              {!collapsed && <span>{name}</span>}
              {!href && !collapsed && (
                <span className="ml-auto text-[11px]">Niedostępne</span>
              )}
            </>
          );
          if (collapsed)
            return (
              <Tooltip.Root key={name}>
                <Tooltip.Trigger
                  aria-label={href ? name : `${name} — niedostępne`}
                  aria-current={current ? "page" : undefined}
                  aria-disabled={!href || undefined}
                  className={className}
                  render={
                    href ? (
                      <Link href={href} onClick={onNavigate} />
                    ) : (
                      <span tabIndex={0} />
                    )
                  }
                >
                  {content}
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Positioner
                    side="right"
                    sideOffset={10}
                    className="z-90"
                  >
                    <Tooltip.Popup className="rounded-md bg-foreground px-3 py-2 text-xs text-card shadow-sm">
                      {name}
                      {!href && " — niedostępne"}
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          return href ? (
            <Link
              key={name}
              href={href}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={className}
            >
              {content}
            </Link>
          ) : (
            <span key={name} aria-disabled="true" className={className}>
              {content}
            </span>
          );
        })}
      </nav>
    </Tooltip.Provider>
  );
}

export function Sidebar({
  pathname,
  collapsed,
  onToggle,
}: {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      aria-label="Panel boczny"
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar p-2 md:flex ${collapsed ? "w-16" : "w-[232px]"}`}
    >
      <Link
        href="/dashboard"
        aria-label="Jobs CRM — Dashboard"
        className={`flex h-16 items-center px-3 text-lg font-semibold tracking-tight ${collapsed ? "justify-center px-0" : ""}`}
      >
        {collapsed ? (
          <BriefcaseBusiness aria-hidden="true" size={22} />
        ) : (
          "Jobs CRM"
        )}
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto pt-4">
        <SidebarNavigation pathname={pathname} collapsed={collapsed} />
      </div>
      <div className="mt-5 border-t border-border pt-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Rozwiń nawigację" : "Zwiń nawigację"}
          title={collapsed ? "Rozwiń nawigację" : "Zwiń nawigację"}
          className={`${buttonStyles.ghost} w-full px-3 ${collapsed ? "justify-center" : "justify-start"}`}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" size={18} />
          ) : (
            <PanelLeftClose aria-hidden="true" size={18} />
          )}
          {!collapsed && <span>Zwiń nawigację</span>}
        </button>
        {!collapsed && (
          <p className="px-3 pb-3 pt-2 text-xs leading-5 text-muted-foreground">
            Prywatna przestrzeń pracy
          </p>
        )}
      </div>
    </aside>
  );
}
