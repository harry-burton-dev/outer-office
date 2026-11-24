// Test helper (not shipped): PlainFiles over an in-memory map of path → text,
// enough for the app's tests. The framework's own tests cover the real folder.
import type { JsonResult, PlainFile, PlainFiles, ReadResult } from "@trellis/framework";

export interface MemoryPlainFiles extends PlainFiles {
  /** Every file, path → text. */
  readonly files: Map<string, string>;
  /** How many times readJson ran, to check big files are read once. */
  reads: number;
}

const childrenOf = (paths: Iterable<string>, dir: string): string[][] => {
  const prefix = dir === "" ? "" : `${dir}/`;
  return [...paths].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split("/"));
};

export function memoryPlainFiles(folder = "automate", initial: Record<string, string> = {}): MemoryPlainFiles {
  const files = new Map(Object.entries(initial));
  const modified = new Map<string, number>();
  let clock = 1;
  const stat = (path: string, text: string): PlainFile => ({ name: path.split("/").pop() ?? path, path, size: text.length, lastModified: modified.get(path) ?? 0 });
  const api: MemoryPlainFiles = {
    folder,
    files,
    reads: 0,
    list: async (dir = "") => childrenOf(files.keys(), dir).filter((parts) => parts.length === 1)
      .map(([name]) => (dir === "" ? `${name}` : `${dir}/${name}`)).sort().map((path) => stat(path, files.get(path) ?? "")),
    listDirs: async (dir = "") => [...new Set(childrenOf(files.keys(), dir).filter((parts) => parts.length > 1).map(([name]) => name ?? ""))].sort(),
    read: async (path): Promise<ReadResult> => {
      const text = files.get(path);
      return text === undefined ? { ok: false, reason: "missing" } : { ok: true, text, size: text.length, lastModified: modified.get(path) ?? 0 };
    },
    readJson: async (path): Promise<JsonResult> => {
      api.reads += 1;
      const text = files.get(path);
      if (text === undefined) return { ok: false, reason: "missing" };
      try {
        return { ok: true, value: JSON.parse(text) as unknown, size: text.length, lastModified: modified.get(path) ?? 0 };
      } catch {
        return { ok: false, reason: "incomplete" };
      }
    },
    write: async (path, content) => {
      files.set(path, typeof content === "string" ? content : new TextDecoder().decode(content));
      modified.set(path, clock++);
    },
    writeJson: async (path, value) => api.write(path, JSON.stringify(value, null, 2)),
    delete: async (path) => files.delete(path),
  };
  for (const path of files.keys()) modified.set(path, clock++);
  return api;
}
