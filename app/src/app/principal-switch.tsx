// The global principal switch: nothing for one principal, a segmented control
// for two to four, a select for more. Each principal shows as its code.
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "./app-state";
import { useActivePrincipals, type Principal } from "./principals";

const MAX_SEGMENTS = 4;
const LABEL = "Principal";
/** The chosen principal in the theme's primary colours, so it stands out from the rest. */
const SELECTED = "aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground";

interface SwitchProps {
  principals: readonly Principal[];
  value: string | null;
  onChange: (id: string) => void;
}

function Segments({ principals, value, onChange }: SwitchProps) {
  return (
    <ToggleGroup
      aria-label={LABEL}
      variant="outline"
      size="sm"
      spacing={0}
      value={value ? [value] : []}
      onValueChange={(next: unknown[]) => typeof next[0] === "string" && onChange(next[0])}
    >
      {principals.map((p) => (
        <ToggleGroupItem key={p.id} value={p.id} className={SELECTED}>
          {p.code ?? p.id}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function Picker({ principals, value, onChange }: SwitchProps) {
  const items = principals.map((p) => ({ value: p.id, label: p.code ?? p.id }));
  return (
    <Select items={items} value={value} onValueChange={(next: unknown) => typeof next === "string" && onChange(next)}>
      <SelectTrigger aria-label={LABEL} size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PrincipalSwitch() {
  const { principalId, choosePrincipal } = useApp();
  const principals = useActivePrincipals();
  if (principals.length < 2) return null;
  const Control = principals.length <= MAX_SEGMENTS ? Segments : Picker;
  return (
    <div className="px-2 group-data-[collapsible=icon]:hidden">
      <Control principals={principals} value={principalId} onChange={choosePrincipal} />
    </div>
  );
}
