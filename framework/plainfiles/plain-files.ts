// Plain files: unencrypted files under one named subfolder of the workspace
// folder, for exchanging data with tools outside the app (for example Power
// Automate). The sync engine reads only data/ and status/, so it never sees
// these. Paths are relative to the subfolder and use "/" between parts.

export interface PlainFile {
  /** The file's name, for example "6f1c2a9e.json". */
  name: string;
  /** Its path inside the subfolder, for example "calls/6f1c2a9e.json". */
  path: string;
  size: number;
  /** Milliseconds since 1970, as the folder reports it. */
  lastModified: number;
}

/** missing: no such file. unreadable: the folder refused the read; try again on a later tick. */
export type ReadResult = { ok: true; text: string; size: number; lastModified: number } | { ok: false; reason: "missing" | "unreadable" };

/** incomplete: the text is not valid JSON yet, usually because the file is still arriving. Try again on a later tick. */
export type JsonResult = { ok: true; value: unknown; size: number; lastModified: number } | { ok: false; reason: "missing" | "unreadable" | "incomplete" };

export interface PlainFiles {
  /** The subfolder's name, for example "automate". */
  readonly folder: string;
  /** The files directly inside `dir` (the subfolder itself by default), sorted by name. Temporary and system files are left out, and so is a file the folder can't open just now. A missing folder lists as empty. */
  list(dir?: string): Promise<PlainFile[]>;
  /** The folders directly inside `dir`, sorted by name. A missing folder lists as empty. */
  listDirs(dir?: string): Promise<string[]>;
  /** A file's text, read as UTF-8, with a leading byte-order mark removed. */
  read(path: string): Promise<ReadResult>;
  /** A file's text parsed as JSON. */
  readJson(path: string): Promise<JsonResult>;
  /** Writes the whole file, replacing any file of that name, and creates the folders on its path. */
  write(path: string, content: string | Uint8Array<ArrayBuffer>): Promise<void>;
  /** Writes `value` as indented JSON, in UTF-8 with no byte-order mark. */
  writeJson(path: string, value: unknown): Promise<void>;
  /** Deletes a file. Resolves false when it was already gone. */
  delete(path: string): Promise<boolean>;
}

type Dir = FileSystemDirectoryHandle;

/** Top-level names the framework uses for itself, compared without case (Windows and OneDrive ignore it). */
export const RESERVED_FOLDERS: readonly string[] = ["app", "backups", "data", "status"];

const FOLDER = /^[a-z0-9][a-z0-9-]*$/;
// What Windows and OneDrive refuse in a name, plus control characters.
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;

/** Files that a browser, OneDrive or Office leave behind while writing. */
export function isTemporaryName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".crswap") || lower.endsWith(".tmp") || lower === "desktop.ini" || name.startsWith("~$") || name.startsWith(".");
}

function assertPart(part: string, path: string): void {
  if (part === "" || part === "." || part === ".." || BAD_CHARS.test(part) || part !== part.trim() || part.endsWith(".")) {
    throw new TypeError(`Plain file path ${JSON.stringify(path)}: each part must be a valid file name (no \\ / : * ? " < > |, no leading or trailing space, no trailing dot)`);
  }
}

function splitPath(path: string, { allowEmpty }: { allowEmpty: boolean }): string[] {
  if (typeof path !== "string") throw new TypeError("Plain file path must be a string");
  if (path === "" && allowEmpty) return [];
  const parts = path.split("/");
  for (const part of parts) assertPart(part, path);
  return parts;
}

const notFound = (err: unknown): boolean => (err as { name?: string } | null)?.name === "NotFoundError";

async function findDir(root: Dir, parts: string[]): Promise<Dir | null> {
  let dir = root;
  for (const part of parts) {
    try {
      dir = await dir.getDirectoryHandle(part, { create: false });
    } catch (err) {
      if (notFound(err)) return null;
      throw err;
    }
  }
  return dir;
}

async function ensureDir(root: Dir, parts: string[]): Promise<Dir> {
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
const BOM = "﻿";

/**
 * The plain-file API for `folder`, a subfolder of the workspace folder `root`.
 * `folder` is lower-case letters, digits and hyphens, and is not one of the
 * framework's own folders.
 */
export function createPlainFiles(root: Dir, folder: string): PlainFiles {
  if (typeof folder !== "string" || !FOLDER.test(folder) || RESERVED_FOLDERS.includes(folder)) {
    throw new TypeError(`Plain files folder ${JSON.stringify(folder)} must be lower-case letters, digits and hyphens, and not ${RESERVED_FOLDERS.join(", ")}`);
  }
  const base = [folder];

  async function entries(dir: string): Promise<[string, FileSystemHandle][]> {
    const handle = await findDir(root, [...base, ...splitPath(dir, { allowEmpty: true })]);
    if (!handle) return [];
    const out: [string, FileSystemHandle][] = [];
    for await (const entry of (handle as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) out.push(entry);
    return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }

  async function locate(path: string): Promise<{ dir: Dir | null; name: string }> {
    const parts = splitPath(path, { allowEmpty: false });
    const name = parts.pop() as string;
    return { dir: await findDir(root, [...base, ...parts]), name };
  }

  async function read(path: string): Promise<ReadResult> {
    const { dir, name } = await locate(path);
    if (!dir) return { ok: false, reason: "missing" };
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      const text = decoder.decode(await file.arrayBuffer());
      return { ok: true, text: text.startsWith(BOM) ? text.slice(1) : text, size: file.size, lastModified: file.lastModified };
    } catch (err) {
      return { ok: false, reason: notFound(err) ? "missing" : "unreadable" };
    }
  }

  async function write(path: string, content: string | Uint8Array<ArrayBuffer>): Promise<void> {
    const parts = splitPath(path, { allowEmpty: false });
    const name = parts.pop() as string;
    const dir = await ensureDir(root, [...base, ...parts]);
    const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
    try {
      await writable.write(typeof content === "string" ? encoder.encode(content) : content);
      await writable.close();
    } catch (err) {
      try {
        await writable.abort();
      } catch {
        // the original error matters more
      }
      throw err;
    }
  }

  return {
    folder,

    async list(dir = "") {
      const prefix = dir === "" ? "" : `${dir}/`;
      const out: PlainFile[] = [];
      for (const [name, handle] of await entries(dir)) {
        if (handle.kind !== "file" || isTemporaryName(name)) continue;
        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          out.push({ name, path: prefix + name, size: file.size, lastModified: file.lastModified });
        } catch {
          // gone or unreadable between listing and looking: left out until a later list
        }
      }
      return out;
    },

    async listDirs(dir = "") {
      return (await entries(dir)).filter(([name, handle]) => handle.kind === "directory" && !name.startsWith(".")).map(([name]) => name);
    },

    read,

    async readJson(path) {
      const result = await read(path);
      if (!result.ok) return result;
      try {
        return { ok: true, value: JSON.parse(result.text), size: result.size, lastModified: result.lastModified };
      } catch {
        return { ok: false, reason: "incomplete" };
      }
    },

    write,

    async writeJson(path, value) {
      await write(path, `${JSON.stringify(value, null, 2)}\n`);
    },

    async delete(path) {
      const { dir, name } = await locate(path);
      if (!dir) return false;
      try {
        await dir.removeEntry(name);
        return true;
      } catch (err) {
        if (notFound(err)) return false;
        throw err;
      }
    },
  };
}
