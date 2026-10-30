"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Menu as MenuIcon, X } from "lucide-react";
import { AccountMenu } from "./account-menu";
import { SessionFeedback } from "@/components/auth/account-session";
import { Sidebar, SidebarNavigation } from "./sidebar";
import { buttonStyles } from "@/components/ui/styles";
import { QuickCapture } from "@/components/recruitment/quick-capture";

const collapseKey = "jobs-crm.sidebar-collapsed";
const listeners = new Set<() => void>();
let fallbackCollapsed = false;
function readCollapsed() {
  try {
    return sessionStorage.getItem(collapseKey) === "true";
  } catch {
    return fallbackCollapsed;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function toggleCollapsed() {
  fallbackCollapsed = !readCollapsed();
  try {
    sessionStorage.setItem(collapseKey, String(fallbackCollapsed));
  } catch {
    /* Navigation preference can stay in memory. */
  }
  listeners.forEach((listener) => listener());
}

export function AppShell({
  userId,
  title,
  description,
  children,
}: {
  userId: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const currentModule = pathname.startsWith("/recruitments")
    ? "Rekrutacje"
    : pathname === "/account"
      ? "Konto"
      : "Dashboard";
  return (
    <div className="flex min-h-dvh">
      <a
        href="#workspace-content"
        className="fixed left-4 top-4 z-100 -translate-y-24 rounded-md bg-primary px-4 py-3 text-sm text-primary-foreground focus:translate-y-0"
      >
        Przejdź do treści
      </a>
      <Sidebar
        pathname={pathname}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
      />
      <main className="min-w-0 flex-1">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2 md:min-h-[72px] md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
              <Dialog.Trigger
                aria-label="Otwórz nawigację"
                className={`${buttonStyles.ghost} px-2 md:hidden`}
              >
                <MenuIcon aria-hidden="true" size={20} />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Backdrop className="fixed inset-0 z-40 bg-overlay" />
                <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-y-auto border-r border-border bg-sidebar p-4 outline-none">
                  <div className="mb-6 flex items-center justify-between gap-3">
                    <Dialog.Title className="text-lg font-semibold">
                      Nawigacja
                    </Dialog.Title>
                    <Dialog.Close
                      aria-label="Zamknij nawigację"
                      className={`${buttonStyles.ghost} px-3`}
                    >
                      <X aria-hidden="true" size={18} />
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="mb-4 text-sm text-muted-foreground">
                    Jobs CRM · Twoja przestrzeń pracy
                  </Dialog.Description>
                  <SidebarNavigation
                    pathname={pathname}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
            <span className="text-sm font-semibold md:hidden">Jobs CRM</span>
            <p className="hidden items-center gap-3 text-sm text-muted-foreground md:flex">
              <span>Moja przestrzeń</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-foreground">
                {currentModule}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <QuickCapture userId={userId} />
            <span
              aria-hidden="true"
              className="mx-1 hidden h-5 border-l border-border sm:block"
            />
            <AccountMenu />
          </div>
        </header>
        <div
          id="workspace-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1280px] px-4 py-6 outline-none md:p-8"
        >
          <header className="mb-7 min-w-0">
            <h1 className="break-words text-2xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] md:text-[28px]">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            )}
          </header>
          <SessionFeedback />
          {children}
        </div>
      </main>
    </div>
  );
}
