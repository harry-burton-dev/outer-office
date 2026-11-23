# Add an admin panel

Some settings belong to whoever runs the workspace, not to every user. An admin panel is your app's own section on the admin page, beside **Users** and **Backups**. It reads rows and runs commands like a screen does.

**You will learn**

- Where a panel lives and how the admin page finds it
- How a panel reads, writes and redraws
- What can go wrong

## Write the panel

Create `app/src/admin/index.ts` and export `adminPanels`, a list of [`AdminPanel`](../reference/api.md#adminpanel). Each one has a title and a `render` that returns DOM nodes. The admin page has no React, so build the nodes with `ctx.el`, the page's own helper. Your panel then looks like the rest of the page.

```ts
// app/src/admin/index.ts
import type { AdminPanel } from "@trellis/framework";

const items: AdminPanel = {
  title: "Items",
  render(ctx) {
    const { el, data } = ctx;
    const count = data.view("items").rows().filter((row) => !row._deleted).length;
    const title = el("input", { id: "item-title", type: "text" });
    const status = el("p", { className: "muted" });
    const add = el("button", {}, "Add item");
    add.addEventListener("click", () => {
      const result = data.run("records.create", { table: "items", fields: { title: title.value, done: false } });
      if (!result.ok) return void (status.textContent = result.error);
      ctx.refresh();
    });
    return [el("p", {}, `${count} items.`), el("label", { htmlFor: title.id }, "Title"), title, add, status];
  },
};

export const adminPanels: readonly AdminPanel[] = [items];
```

To run your own commands, import the module that defines them. Importing it is enough to define them for the admin page too.

## Build and open it

1. Run `npm run build`. The admin page, `dist/admin.html`, now has your sections.
2. Open it and open the workspace. Your sections appear after **Invite a user**.

Without `app/src/admin/index.ts` the admin page is built exactly as before.

## How it saves

A command run from a panel writes as the admin page's own device, as user `admin`. Any run that changes something is saved to the shared folder straight away. Every user's app picks the change up like any other data.

Call `ctx.refresh()` after a change to draw the panel again with the new rows. Keep a message you want to show after the redraw outside `render`, for example in a variable the panel closes over.

## What can go wrong

- **The section says "This section could not be shown".** Its `render` threw. The message after the colon is the error. The rest of the page still works.
- **A click does nothing.** An error in a click handler is not caught for you. Show `result.error` when a command fails, as above.
- **Another user's change does not appear.** A panel is not redrawn on its own. Reopen the workspace, or call `ctx.refresh()`.
- **The command is unknown.** The module that defines it is not imported by `app/src/admin/index.ts` or anything it imports.
