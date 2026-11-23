// Small DOM pieces the app's admin panels share, built with the admin page's own helper.
import type { AdminPanelContext } from "@trellis/framework";

type El = AdminPanelContext["el"];

/** Now, as the commands take it: an ISO instant in UTC. */
export const nowIso = (): string => new Date().toISOString();

/** A text input with its label, as the admin page lays them out. */
export function textField(el: El, id: string, label: string, value: string, placeholder = ""): { input: HTMLInputElement; nodes: HTMLElement[] } {
  const input = el("input", { id, type: "text", value, placeholder, autocomplete: "off" });
  return { input, nodes: [el("label", { htmlFor: id }, label), input] };
}

/**
 * Gives a control its accessible name. The page's helper sets properties, and
 * "aria-label" is not one, so it is set as an attribute here.
 */
export function named<T extends HTMLElement>(node: T, label: string): T {
  node.setAttribute("aria-label", label);
  return node;
}

/** A status line for a panel's own messages. */
export const statusLine = (el: El, text: string): HTMLParagraphElement => el("p", { className: "muted" }, text);

/** Text from a stored field, or "" when it is not text. */
export const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
