// Every app command. Importing this module defines them all with the framework
// (defineCommand adds each to the registry TrellisApp's data runtime uses), so
// a screen can run one by name or, typed, with useCommand(commands.taskAdd).
import { officeSave, principalSave } from "./office";
import { importApply } from "./import";
import { overlaySet } from "./overlay";
import { seriesOverlaySet } from "./series-overlay";
import { taskAdd, taskComplete, taskLink, taskMove, taskRemove, taskUpdate } from "./tasks";
import { taskAssign } from "./task-assign";
import { projectSave, sectionSave } from "./projects";
import { ackPrivacy, setMode } from "./people";
import { categorySave, tagRemove, tagSave, tagsSet } from "./tags";
import { cardAdd, cardRemove, cardSet, cardUpdate, tabApply, tabCopyFrom, tabRemove, tabUpdate, tabTemplateRemove, tabTemplateSave, templateRemove, templateSave } from "./cards";
import { proposalDrop, proposalMove, proposalMoveGroup, proposalNew, proposalWithdraw } from "./proposals";
import { homeMarkSeen, homeSetWatch } from "./home";
import { wizardApply } from "./wizard";
import { suggestionDismiss, suggestionFromWizard, suggestionMake, suggestionTake } from "./suggestions";
import { automateRecordRun } from "./automate";
import { ruleSettingSet, updateSet } from "./alerts";
import { taskRetime } from "./tab-tasks";
import { tabKeep } from "./tab-triggers";

// One name per line, so threads adding a command don't conflict on one line.
export const commands = {
  officeSave,
  principalSave,
  importApply,
  overlaySet,
  seriesOverlaySet,
  taskAdd,
  taskUpdate,
  taskMove,
  taskComplete,
  taskAssign,
  taskLink,
  taskRemove,
  projectSave,
  sectionSave,
  ackPrivacy,
  setMode,
  tagSave,
  tagRemove,
  tagsSet,
  categorySave,
  proposalMove,
  proposalMoveGroup,
  proposalWithdraw,
  proposalNew,
  proposalDrop,
  templateSave,
  templateRemove,
  cardAdd,
  cardSet,
  cardRemove,
  homeMarkSeen,
  homeSetWatch,
  cardUpdate,
  tabTemplateSave,
  tabTemplateRemove,
  tabApply,
  tabRemove,
  tabUpdate,
  taskRetime,
  tabCopyFrom,
  tabKeep,
  ruleSettingSet,
  updateSet,
  automateRecordRun,
  wizardApply,
  suggestionMake,
  suggestionTake,
  suggestionDismiss,
  suggestionFromWizard,
} as const;

export {
  officeSave,
  principalSave,
  importApply,
  overlaySet,
  seriesOverlaySet,
  taskAdd,
  taskUpdate,
  taskMove,
  taskComplete,
  taskAssign,
  taskLink,
  taskRemove,
  projectSave,
  sectionSave,
  ackPrivacy,
  setMode,
  tagSave,
  tagRemove,
  tagsSet,
  categorySave,
  proposalMove,
  proposalMoveGroup,
  proposalWithdraw,
  proposalNew,
  proposalDrop,
  templateSave,
  templateRemove,
  cardAdd,
  cardSet,
  cardRemove,
  homeMarkSeen,
  homeSetWatch,
  cardUpdate,
  tabTemplateSave,
  tabTemplateRemove,
  tabApply,
  tabRemove,
  tabUpdate,
  taskRetime,
  tabCopyFrom,
  tabKeep,
  ruleSettingSet,
  updateSet,
  automateRecordRun,
};
export { wizardApply } from "./wizard";
export { suggestionMake, suggestionTake, suggestionDismiss, suggestionFromWizard } from "./suggestions";
export type { OfficeSaveInput, PrincipalSaveInput, PrivatePolicy } from "./office";
export type { ImportApplyInput, ImportResult } from "./import";
export type { OverlaySetInput, Prep } from "./overlay";
export type { SeriesOverlaySetInput } from "./series-overlay";
export type { TaskAddInput, TaskUpdateInput, TaskMoveInput, TaskCompleteInput, TaskLinkInput, TaskRemoveInput } from "./tasks";
export type { TaskAssignInput, AssignAction } from "./task-assign";
export type { ProjectSaveInput, SectionSaveInput } from "./projects";
export type { AckPrivacyInput, SetModeInput, PersonMode } from "./people";
export type { TagSaveInput, TagRemoveInput, TagsSetInput, CategorySaveInput } from "./tags";
export type { TemplateSaveInput, TabTemplateSaveInput, TabVia } from "./cards";
export type { ProposalMoveInput, ProposalMoveGroupInput, ProposalWithdrawInput, ProposalNewInput, NewMeeting } from "./proposals";
export type { HomeMarkSeenInput, HomeSetWatchInput } from "./home";
export type { WizardApplyInput } from "./wizard";
export type { SuggestionMakeInput, SuggestionKind } from "./suggestions";
export type { FlowRunInput, FlowOutcome } from "./automate";
export type { RuleSettingSetInput, UpdateSetInput, UpdateAction } from "./alerts";
export { OFFICE_ID } from "./office";
export { INBOX_NAME } from "./projects";
