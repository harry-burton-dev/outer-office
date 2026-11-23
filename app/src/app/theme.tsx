// Light or dark, like Claude desktop. It follows the computer until someone
// picks one; the pick is kept on this computer only.
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const KEY = "outer-office.theme";

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

const systemDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? (systemDark() ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const choose = () => {
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private window: the pick lasts until the page closes.
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={choose} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
