// The machinery under two-users.js: building and laying out the release, the
// admin page and the two users' pages on one stand-in folder (stand-in-folder.js),
// and driving saves and folder reads through the diagnostics view. Nothing here
// checks anything; two-users.js does.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sha256Hex, signManifest } from "../../runtime/loader/manifest.js";
import { exportBackup, newKeyring } from "../../runtime/identity/admin.js";
import { workspaceFileFor } from "../../runtime/identity/workspace.js";
import { appNames } from "../../runtime/names.ts";
import definition from "../app-definition.js";

export const { chromium } = createRequire(import.meta.url)("playwright");
const { subtle } = webcrypto;
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const VITE_CONFIG = join(ROOT, "framework", "build", "vite.config.js");
const VITE_BIN = join(ROOT, "node_modules", "vite", "bin", "vite.js");
const DIST = join(ROOT, "dist");
export const names = appNames(definition);
const version = JSON.parse(readFileSync(join(ROOT, "app", "package.json"), "utf8")).version;
const bundleName = names.bundleFile(version);
const SYNC_TIMEOUT_MS = 15000;
export const SLOW = { timeout: 30000 }; // unlocking a passport is 600,000 rounds of PBKDF2
const random = { bytes: (n) => webcrypto.getRandomValues(new Uint8Array(n)) };
/** Every page: the README's screenshot size, light mode, the office's zone. */
const CONTEXT = { viewport: { width: 1440, height: 900 }, colorScheme: "light", timezoneId: "Europe/London", acceptDownloads: true };
/** The app's frame is drawn: the sidebar's main navigation. */
export const APP_FRAME = 'nav[aria-label="Main"]';
export const ADMIN_PASS = "the admin's key backup phrase";
export const INVITE_PASS = "the admin's one-time invite phrase";

/** The release folder the smoke test lays out (bootstrap page, admin page, bundle, signed manifest), into `release`. */
export async function buildRelease(release) {
  const admin = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicJwk = JSON.stringify(await subtle.exportKey("jwk", admin.publicKey));
  // Vite's own script run with this Node, not through npx, so the build also starts on Windows.
  const vite = (mode) => execFileSync(process.execPath, [VITE_BIN, "build", "--config", VITE_CONFIG, "--mode", mode], { cwd: ROOT, stdio: "inherit", env: { ...process.env, TRELLIS_PUBLIC_KEY: publicJwk } });
  vite("bootstrap");
  vite("app");
  vite("admin");
  rmSync(release, { recursive: true, force: true });
  mkdirSync(join(release, "app"), { recursive: true });
  copyFileSync(join(DIST, "bootstrap.html"), join(release, names.bootstrapFile));
  copyFileSync(join(DIST, "admin.html"), join(release, names.adminFile));
  copyFileSync(join(DIST, "app", bundleName), join(release, "app", bundleName));
  const bundle = readFileSync(join(release, "app", bundleName));
  const body = { format: 1, serial: 1, channels: { stable: version }, bundles: { [version]: { file: bundleName, sha256: await sha256Hex(bundle, subtle), minBootstrap: 1 } } };
  writeFileSync(join(release, "app", "manifest.json"), await signManifest({ body, privateKey: admin.privateKey, subtle }));
}

/**
 * Runs in the page before its own scripts: the save picker keeps the passport
 * in the page (on this user's side, never in the shared folder). Marked standIn,
 * so the page's attempt to remember the handle stores nothing, as for the folder.
 */
function passportSaver() {
  window.savedPassports = {};
  window.showSaveFilePicker = async ({ suggestedName }) => ({
    kind: "file",
    name: suggestedName,
    standIn: true,
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    getFile: async () => new File([window.savedPassports[suggestedName] ?? ""], suggestedName),
    createWritable: async () => {
      let text = "";
      return { write: async (data) => { text += data; }, close: async () => { window.savedPassports[suggestedName] = text; } };
    },
  });
}

/** A browser context of its own on the stand-in folder (one device), and a page in it that records its errors. */
async function newDevice(browser, folder, label) {
  const context = await browser.newContext(CONTEXT);
  await folder.attach(context, label);
  await context.addInitScript(passportSaver);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(`${label}: ${err}`));
  return { label, context, page, errors };
}

/**
 * A workspace in the stand-in folder, made here in Node as the admin page makes
 * one, and its key backup: the admin then opens it on the admin page.
 */
export async function makeWorkspace(folder) {
  const keyring = newKeyring({ random });
  writeFileSync(join(folder.dir, "workspace.json"), await workspaceFileFor(keyring, { random }));
  return { name: `workspace-key-${keyring.current}.keybackup.json`, text: await exportBackup({ keyring, passphrase: ADMIN_PASS, random }) };
}

/** The admin page from disk, on the stand-in folder, with the workspace opened from its key backup. */
export async function openAdmin(browser, folder, release, backup, label) {
  const admin = await newDevice(browser, folder, label);
  const { page } = admin;
  await page.goto(pathToFileURL(join(release, names.adminFile)).href);
  await page.getByRole("button", { name: "Choose the shared folder" }).click();
  await page.getByLabel("Key backup (or a passport)").setInputFiles({ name: backup.name, mimeType: "application/json", buffer: Buffer.from(backup.text) });
  await page.getByLabel("Its passphrase").fill(ADMIN_PASS);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.waitForSelector("#admin-workspace", SLOW);
  return admin;
}

/** One of the app's sections on the admin page, by its heading. */
export const adminSection = (page, title) => page.locator("section.admin-panel").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/** Invites `name` on the admin page and returns the downloaded invite. */
export async function invite(page, name) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel(/^One-time passphrase/).fill(INVITE_PASS);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.getByRole("button", { name: "Invite", exact: true }).click()]);
  const text = readFileSync(await download.path(), "utf8");
  await page.getByText(`Invite for ${name} saved`).waitFor({ timeout: 10000 });
  return { name, file: download.suggestedFilename(), text };
}

/** One user: a device of its own, connected through the bootstrap, enrolled from its invite. */
export async function openUser(browser, folder, release, label, userInvite) {
  const user = await newDevice(browser, folder, label);
  const { page } = user;
  await page.goto(pathToFileURL(join(release, names.bootstrapFile)).href);
  await page.click("#boot-connect");
  await page.waitForSelector("#boot", { state: "detached", timeout: 10000 });
  await page.getByRole("button", { name: "Choose the shared folder" }).click();
  await page.click("#have-invite");
  await page.setInputFiles("#invite-file", { name: userInvite.file, mimeType: "application/json", buffer: Buffer.from(userInvite.text) });
  await page.fill("#invite-passphrase", INVITE_PASS);
  const own = `${userInvite.name}'s own passport phrase`;
  await page.fill("#new-passphrase", own);
  await page.fill("#confirm-passphrase", own);
  await page.click("#open-invite");
  await page.click("#save-passport", SLOW);
  await page.waitForSelector(APP_FRAME, SLOW);
  const saved = await page.evaluate(() => Object.keys(window.savedPassports));
  return { ...user, saved };
}

/** Opens the diagnostics view from the status badge's menu, presses `name`, and closes it again (it is modal). */
async function diagnostics(u, name) {
  await u.page.locator("#connection > button").click();
  await u.page.getByRole("menuitem", { name: "Diagnostics" }).click();
  const dialog = u.page.getByRole("dialog");
  await dialog.getByRole("button", { name }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
}
export const save = (u) => diagnostics(u, "Save now");
export const read = (u) => diagnostics(u, "Read folder now");

/** "Read folder now" on `u` until `probe(u)` passes `test` (the save on the other page may still be finishing). */
export async function readUntil(u, probe, test, timeoutMs = SYNC_TIMEOUT_MS) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await read(u);
    await u.page.waitForTimeout(250);
    if (test(await probe(u))) return true;
  }
  return false;
}

/** Save and read on both pages until `test` passes on what `probe` gives for each. */
export async function settle(a, b, probe, test) {
  const end = Date.now() + SYNC_TIMEOUT_MS;
  while (Date.now() < end) {
    await save(a);
    await save(b);
    await read(a);
    await read(b);
    await a.page.waitForTimeout(250);
    if (test(await probe(a)) && test(await probe(b))) return true;
  }
  return false;
}
