// PLACEHOLDER: replace this file. Contract: keep the export name and its (prop-less) signature.
// The frame owns the <Dialog> root: it is open while a task screen (Inbox, Today, the project, Bin)
// is shown and the signed-in user has not acknowledged (hasAckedPrivacy in @/domain/selectors is
// false). Dismissing it without acknowledging (Escape, the close button, a click outside) sends the
// user back to Calendar. This component renders only <DialogContent> with a <DialogHeader>/<DialogTitle>,
// the notice, and one primary button that runs commands.ackPrivacy ({ now }); once the people record
// has privacyAckAt the frame closes the dialog. This placeholder renders nothing.
export function PrivacyNotice() {
  return null;
}
