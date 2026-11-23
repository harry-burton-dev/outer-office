// Test helper (not a test file): devices with the app's data runtime on one
// memory folder, built on the framework's data-layer fixture.
import { createData, type CommandDef, type Data, type RowOf } from "@trellis/framework";
import config from "../../../../app.config";
import { engineTables } from "../../../../../framework/data/test/_world.js";
import { makeWorld } from "../../../../../framework/engine/test/engine/_harness.js";
import { openTable } from "../../../../../framework/engine/src/records/index.js";
import { USERS_SCHEMA, USERS_TABLE } from "../../../../../framework/runtime/identity/admin.js";

type TableName = keyof typeof config.tables & string;

export interface Device {
  readonly user: string;
  readonly data: Data;
  readonly engine: { tick(): Promise<unknown>; table(name: string): unknown };
  /** Writes a users-table record, as the admin page would. */
  putUser(user: SeedUser): void;
}

export interface SeedUser {
  id: string;
  name: string;
  /** Default true. */
  active?: boolean;
}

export interface TestWorld {
  device(user: string): Promise<Device>;
  sync(devices: readonly Device[]): Promise<void>;
}

const SYNC_MS = 30000;

export async function makeTestWorld(): Promise<TestWorld> {
  // The app's tables and the framework's users table, as the host syncs them.
  const tables: Record<string, string> = { ...engineTables(config), [USERS_TABLE]: "yjs" };
  const world = await makeWorld({ tables: tables as { notes: string } });
  let count = 0;
  return {
    async device(user) {
      count += 1;
      const deviceId = `${user.replace(/-/g, "")}-${String(count).padStart(8, "0")}`;
      const engine = await world.device(deviceId);
      const data = createData({ engine, config, deviceId, user, clock: world.clock, random: world.random });
      const users = openTable({ adapter: undefined, migrations: {}, doc: engine.table(USERS_TABLE), schema: USERS_SCHEMA, deviceId, user: "admin", clock: world.clock });
      const putUser = ({ id, name, active = true }: SeedUser): void => users.put(id, { name, role: "member", status: active ? "active" : "inactive" });
      return { user, data, engine, putUser };
    },
    sync: (devices) => world.run(devices.map((d) => d.engine), SYNC_MS),
  };
}

/** One device for a user, on a fresh world. */
export async function oneDevice(user = "user-a"): Promise<Device> {
  const world = await makeTestWorld();
  return world.device(user);
}

/** Runs a command and returns its value; throws with the message when it fails. */
export function ok<I, V>(device: Device, command: CommandDef<I, V>, input: I): V {
  const result = device.data.run(command, input);
  if (!result.ok) throw new Error(`${command.name} failed: ${result.error}`);
  return result.value;
}

/** Runs a command that should fail and returns its message. */
export function fails<I, V>(device: Device, command: CommandDef<I, V>, input: I): string {
  const result = device.data.run(command, input);
  if (result.ok) throw new Error(`${command.name} should have failed`);
  return result.error;
}

/** A table's live rows (not removed). */
export function rows<T extends TableName>(device: Device, table: T): readonly RowOf<T>[] {
  return (device.data.view(table).rows() as unknown as readonly RowOf<T>[]).filter((row) => !row._deleted);
}

/** A table's rows including removed ones. */
export function allRows<T extends TableName>(device: Device, table: T): readonly RowOf<T>[] {
  return device.data.view(table).rows() as unknown as readonly RowOf<T>[];
}

export function byId<T extends TableName>(device: Device, table: T, id: string): RowOf<T> | undefined {
  return device.data.view(table).byId(id) as unknown as RowOf<T> | undefined;
}

/** Every table's rows as JSON, to show that a failed command wrote nothing. */
export function snapshot(device: Device): string {
  return JSON.stringify(device.data.tables.map((table) => device.data.view(table).rows()));
}

export const NOW = "2026-11-22T09:00:00.000Z";

const probeId: CommandDef<readonly string[], string> = { name: "test.id", handler: (tx, parts) => tx.id(...parts) };

/** What tx.id(...parts) gives, as the commands see it. */
export function idOf(device: Device, ...parts: string[]): string {
  return ok(device, probeId, parts);
}
