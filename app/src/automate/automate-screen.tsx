// Automate (OUT-91): every job the app expects a Power Automate flow to do,
// how each one is doing for each principal, and how to set it up. Read-only:
// it shows the inbox as this computer reads it and the run records the app
// keeps (flowRuns). The office's Power Automate setting is on the admin page.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Marked } from "marked";
import { useRecord, useRecords } from "@trellis/framework";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/app/app-state";
import { useActivePrincipals } from "@/app/principals";
import { DateText, PageHeader, TimeText } from "@/app/ui";
import { OFFICE_ID } from "@/domain/commands";
import { useDiaryInbox } from "./diary-inbox-state";
import { FLOWS, principalHealth, STATE_HELP, STATE_LABEL, type FlowDefinition, type FlowState, type PrincipalHealth } from "./flows";

const MINUTE_MS = 60_000;

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string, now: string): string {
  const minutes = Math.floor((Date.parse(now) - Date.parse(iso)) / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

const BADGE: Readonly<Record<FlowState, "secondary" | "destructive" | "outline">> = {
  off: "outline", never: "outline", arrived: "secondary", waiting: "secondary", ok: "secondary", partial: "outline", late: "destructive", refused: "destructive",
};

function When({ value, now }: { value: string | null; now: string }) {
  if (!value) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="flex flex-col">
      <span><DateText value={value} /> <TimeText value={value} /></span>
      <span className="text-xs text-muted-foreground">{ago(value, now)}</span>
    </span>
  );
}

function resultText(health: PrincipalHealth): ReactNode {
  if (health.state === "refused") return <span className="text-destructive">{health.reason ?? "The file can't be used."}</span>;
  const run = health.run;
  if (!run) return <span className="text-muted-foreground">–</span>;
  const events = `${run.events ?? 0} events in the file`;
  const note = run.reason ? <span className="block text-xs text-muted-foreground">{run.reason}.</span> : null;
  if (run.outcome === "unchanged") return <span>No changes <span className="text-muted-foreground">· {events}</span>{note}</span>;
  return <span>{run.added ?? 0} added, {run.changed ?? 0} changed, {run.gone ?? 0} gone <span className="text-muted-foreground">· {events}</span>{note}</span>;
}

function HealthTable({ flow, rows }: { flow: FlowDefinition; rows: readonly PrincipalHealth[] }) {
  const { now } = useApp();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No principals yet. Add them in the admin page.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Principal</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Last run</TableHead>
          <TableHead>Read by the app</TableHead>
          <TableHead>What the app did</TableHead>
          <TableHead>Folder</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.code}>
            <TableCell className="font-medium">{row.code}</TableCell>
            <TableCell><Badge variant={BADGE[row.state]} title={STATE_HELP[row.state]}>{STATE_LABEL[row.state]}</Badge></TableCell>
            <TableCell><When value={row.lastRunAt} now={now} /></TableCell>
            <TableCell><When value={row.readAt} now={now} /></TableCell>
            <TableCell className="max-w-80 whitespace-normal">{resultText(row)}</TableCell>
            <TableCell><code className="text-xs">{flow.folderOf(row.code)}</code></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// The guide's headings sit under the page's h1 and the flow's h2.
const marked = new Marked({ gfm: true, walkTokens: (token) => { if (token.type === "heading") token.depth = Math.min(6, token.depth + 2); } });

const GUIDE_CLASS = [
  "flex max-w-3xl flex-col gap-3 text-sm leading-6",
  "[&_h3]:pt-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:pt-3 [&_h4]:text-base [&_h4]:font-semibold",
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1 [&_li>p]:my-1",
  "[&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:text-[0.85em]",
  "[&_pre]:relative [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:pr-16 [&_pre]:text-xs",
  "[&_table]:w-full [&_table]:border-collapse [&_th]:border-b [&_th]:p-2 [&_th]:text-left [&_td]:border-b [&_td]:p-2 [&_td]:align-top",
].join(" ");

/** The guide rendered from its Markdown, with a copy button on each code block. */
export function Guide({ markdown }: { markdown: string }) {
  const html = useMemo(() => marked.parse(markdown, { async: false }), [markdown]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const link of root.querySelectorAll("a")) {
      // Web links open beside the app; a link to another repo file means nothing here.
      if (/^https?:/.test(link.getAttribute("href") ?? "")) Object.assign(link, { target: "_blank", rel: "noreferrer" });
      else link.removeAttribute("href");
    }
    for (const pre of root.querySelectorAll("pre")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Copy";
      button.className = "absolute top-2 right-2 rounded-md border bg-background px-2 py-0.5 text-xs";
      button.addEventListener("click", () => {
        void navigator.clipboard?.writeText(pre.querySelector("code")?.textContent?.trim() ?? "").then(() => { button.textContent = "Copied"; });
      });
      pre.append(button);
    }
  }, [html]);
  // The guide is this repository's own file, bundled at build time.
  return <div ref={ref} className={GUIDE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />;
}

function FlowSection({ flow, on }: { flow: FlowDefinition; on: boolean }) {
  const { now, isViewer } = useApp();
  const principals = useActivePrincipals();
  const runs = useRecords("flowRuns");
  const { entries } = useDiaryInbox();
  const rows = useMemo(() => {
    const codeOf = (e: (typeof entries)[number]) => (e.ok ? e.update.principal : e.principal);
    const mine = runs.filter((r) => !r._deleted && r.flow === flow.id);
    // Active principals first, then any folder or run whose code no principal has.
    const codes = [...new Set([...principals.map((p) => p.code), ...entries.map(codeOf), ...mine.map((r) => r.principal ?? "")])].filter((code): code is string => Boolean(code));
    return codes.map((code) => principalHealth({
      flow, on, code, now, canApply: !isViewer,
      run: mine.find((r) => r.principal === code),
      entry: entries.find((e) => codeOf(e) === code) ?? null,
    }));
  }, [flow, on, now, isViewer, principals, runs, entries]);
  const late = rows.filter((r) => r.state === "late" || r.state === "refused").length;

  return (
    <section aria-labelledby={`flow-${flow.id}`} className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 id={`flow-${flow.id}`} className="text-lg font-semibold">{flow.name}</h2>
          {on && late > 0 && <Badge variant="destructive">{late} need a look</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{flow.summary}</p>
      </div>
      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="how">How it works</TabsTrigger>
          <TabsTrigger value="setup">Set up</TabsTrigger>
        </TabsList>
        <TabsContent value="health" className="pt-3">
          <HealthTable flow={flow} rows={rows} />
          <p className="pt-3 text-xs text-muted-foreground">
            The flow runs every {flow.everyMinutes} minutes. A principal is late when its newest file is more than {flow.lateAfterMinutes} minutes old.
          </p>
        </TabsContent>
        <TabsContent value="how" className="flex flex-col gap-4 pt-3">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">The flow</h3>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
              {flow.steps.map((step) => (
                <div key={step.label} className="contents">
                  <dt className="text-muted-foreground">{step.label}</dt>
                  <dd>{step.detail}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">The flow has no Parse JSON, Select, Filter, Condition or loop. Keep it that way: the app does all of that.</p>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">What the app does with each file</h3>
            <ul className="list-disc pl-6 text-sm leading-6">
              {flow.appDoes.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </TabsContent>
        <TabsContent value="setup" className="pt-3">
          <Guide markdown={flow.guide} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

export function AutomateScreen() {
  const office = useRecord("office", OFFICE_ID);
  const on = office?._deleted !== true && office?.automate === true;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Automate"
        description="Everything the app expects Power Automate to do. Each flow only reads from Outlook and saves the answer as a file in the shared folder. The app does the rest."
      />
      {!on && (
        <p role="status" className="rounded-xl border bg-muted p-4 text-sm">
          Power Automate is off, so the app reads nothing from the automate folder. An admin turns it on in the admin page, under <strong>Office</strong>.
        </p>
      )}
      {FLOWS.map((flow) => <FlowSection key={flow.id} flow={flow} on={on} />)}
    </div>
  );
}
