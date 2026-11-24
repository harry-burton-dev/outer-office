// The lens toggle on the diary toolbar: a menu tabbed by data category, with
// the lenses in each. Picking the lens that is on turns it off.
import { useState } from "react";
import { EyeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LENS_CATEGORIES, LENSES, lensById, type LensCategory } from "@/domain/lenses";

export interface LensMenuProps {
  /** The lens that is on, or null for none. */
  value: string | null;
  onChange(id: string | null): void;
}

export function LensMenu({ value, onChange }: LensMenuProps) {
  const on = lensById(value);
  const [tab, setTab] = useState<LensCategory>(on?.category ?? LENS_CATEGORIES[0] ?? "Quality");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant={on ? "secondary" : "outline"} aria-label={on ? `Lens: ${on.name}` : "Lens"} />}>
        <EyeIcon />
        {on ? on.name : "Lens"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <Tabs value={tab} onValueChange={(next: LensCategory) => setTab(next)}>
          <TabsList className="w-full">
            {LENS_CATEGORIES.map((category) => (
              <TabsTrigger key={category} value={category}>{category}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(id: string) => onChange(id === value ? null : id)}>
          {LENSES.filter((lens) => lens.category === tab).map((lens) => (
            <DropdownMenuRadioItem key={lens.id} value={lens.id} onClick={() => lens.id === value && onChange(null)} className="items-start">
              <span className="flex flex-col">
                <span>{lens.name}</span>
                <span className="text-xs text-muted-foreground">{lens.hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {on && (
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={() => onChange(null)}>
            Turn the lens off
          </Button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
