"use client";

import Link from "next/link";
import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useSessionActions } from "@/components/auth/account-session";
import { buttonStyles } from "@/components/ui/styles";

export function AccountMenu() {
  const { pending, logout } = useSessionActions();
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const itemClass =
    "flex min-h-11 items-center gap-3 rounded-sm px-3 py-2 text-sm outline-none data-highlighted:bg-secondary data-disabled:opacity-55";
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Menu konta"
        disabled={pending}
        className={`${buttonStyles.ghost} px-3`}
      >
        <UserRound aria-hidden="true" size={18} />
        <span className="hidden sm:inline">Konto</span>
        <ChevronDown aria-hidden="true" size={14} />
      </Menu.Trigger>
      {/* A local portal preserves Base UI anatomy and the verified subtree privacy boundary. */}
      <div ref={portalContainerRef} className="contents" />
      <Menu.Portal container={portalContainerRef}>
        <Menu.Positioner align="end" sideOffset={8} className="z-30">
          <Menu.Popup className="w-60 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1.5 shadow-lg outline-none">
            <Menu.Item render={<Link href="/account" />} className={itemClass}>
              <UserRound aria-hidden="true" size={16} />
              Twoje konto
            </Menu.Item>
            <Menu.Separator className="my-1 border-t border-border" />
            <Menu.Item
              disabled={pending}
              onClick={() => void logout("local")}
              className={itemClass}
            >
              <LogOut aria-hidden="true" size={16} />
              Wyloguj tutaj
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
