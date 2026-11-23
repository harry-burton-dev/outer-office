// Every app command. Importing this module defines them all with the framework
// (defineCommand adds each to the registry TrellisApp's data runtime uses), so
// a screen can run one by name or, typed, with useCommand(commands.taskAdd).
import { officeSave, principalSave } from "./office";
import { importApply } from "./import";
import { overlaySet } from "./overlay";
import { taskAdd, taskComplete, taskLink, taskMove, taskRemove, taskUpdate } from "./tasks";
import { taskAssign } from "./task-assign";
import { projectSave, sectionSave } from "./projects";
import { ackPrivacy, setMode } from "./people";
import { tagRemove, tagSave, tagsSet } from "./tags";
import { proposalDrop, proposalMove, proposalNew, proposalWithdraw } from "./proposals";

export const commands = {
  officeSave, principalSave, importApply, overlaySet,
  taskAdd, taskUpdate, taskMove, taskComplete, taskAssign, taskLink, taskRemove,
  projectSave, sectionSave, ackPrivacy, setMode, tagSave, tagRemove, tagsSet,
  proposalMove, proposalWithdraw, proposalNew, proposalDrop,
} as const;

export { officeSave, principalSave, importApply, overlaySet, taskAdd, taskUpdate, taskMove, taskComplete, taskAssign, taskLink, taskRemove, projectSave, sectionSave, ackPrivacy, setMode, tagSave, tagRemove, tagsSet, proposalMove, proposalWithdraw, proposalNew, proposalDrop };
export type { OfficeSaveInput, PrincipalSaveInput, PrivatePolicy } from "./office";
export type { ImportApplyInput, ImportResult } from "./import";
export type { OverlaySetInput, Prep } from "./overlay";
export type { TaskAddInput, TaskUpdateInput, TaskMoveInput, TaskCompleteInput, TaskLinkInput, TaskRemoveInput } from "./tasks";
export type { TaskAssignInput, AssignAction } from "./task-assign";
export type { ProjectSaveInput, SectionSaveInput } from "./projects";
export type { AckPrivacyInput, SetModeInput, PersonMode } from "./people";
export type { TagSaveInput, TagRemoveInput, TagsSetInput } from "./tags";
export type { ProposalMoveInput, ProposalWithdrawInput, ProposalNewInput, NewMeeting } from "./proposals";
export { OFFICE_ID } from "./office";
export { INBOX_NAME } from "./projects";
