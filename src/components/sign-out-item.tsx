"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function SignOutItem() {
  return (
    <DropdownMenuItem
      variant="destructive"
      onSelect={async (event) => {
        event.preventDefault();
        await signOut();
        // A full page load, not a client navigation: it drops every page the
        // router kept in memory for the person who just signed out.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      }}
    >
      <LogOut /> Đăng xuất
    </DropdownMenuItem>
  );
}
