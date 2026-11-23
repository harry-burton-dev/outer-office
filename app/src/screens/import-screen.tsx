// Import: choose an .ics file for the chosen principal, review what it would
// change, apply it, then a reminder to delete the export. History below.
// Viewers see only the history.
import { useRecord } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/app/ui";
import { useApp } from "@/app/app-state";
import { useDiaryEntry } from "@/automate/diary-inbox-state";
import { ChooseStep } from "./import/choose-step";
import { ReviewStep } from "./import/review-step";
import { ImportHistory } from "./import/import-history";
import { useImportFlow } from "./import/use-import-flow";

interface ImportStepsProps {
  principal: string;
}

function ImportSteps({ principal }: ImportStepsProps) {
  const record = useRecord("principals", principal);
  const { state, policy, choose, apply, reset } = useImportFlow(principal);
  const diary = useDiaryEntry(principal);
  const label = record?.code ?? principal;
  if (state.step === "review") {
    return <ReviewStep {...state} policy={policy} onApply={apply} onCancel={reset} />;
  }
  if (state.step === "done") {
    return (
      <section aria-label="Done" className="flex flex-col items-start gap-4">
        <p role="status" className="text-sm">
          Imported. Now delete {state.fileName} from your Downloads folder: it is not encrypted.
        </p>
        <Button onClick={reset}>Dismiss</Button>
      </section>
    );
  }
  return (
    <>
      {diary && !diary.ok && (
        <section aria-label="Diary update" className="mb-6 flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-destructive">The latest diary update can't be used: {diary.reason}.</p>
        </section>
      )}
      <ChooseStep principalLabel={label} errors={state.errors} busy={state.busy} onFile={(file) => void choose(file)} />
    </>
  );
}

export function ImportScreen() {
  const { principalId, isViewer } = useApp();
  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader title="Import" />
        {principalId !== null && !isViewer && <ImportSteps key={principalId} principal={principalId} />}
      </div>
      {principalId !== null && <ImportHistory principal={principalId} />}
    </div>
  );
}
