"use client";

import { Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const t = useT();
  function toggle() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {}
    window.dispatchEvent(new Event("themechange"));
  }
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={t.common.toggleTheme} title={t.common.toggleTheme}>
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
