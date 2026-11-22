// Test helper (not a test file): devices with the app's data runtime on one
// memory folder, built on the framework's data-layer fixture.
import { createData, type CommandDef, type Data, type RowOf } from "@trellis/framework";
import config from "../../../../app.config";
import { makeDataWorld } from "../../../../../framework/data/test/_world.js";

type TableName = keyof typeof config.tables & string;

export interface Device {
  readonly user: string;
  readonly data: Data;
  readonly engine: { tick(): Promise<unknown> };
}

export interface TestWorld {
  device(user: string): Promise<Device>;
  sync(devices: readonly Device[]): Promise<void>;
}

const SYNC_MS = 30000;

export async function makeTestWorld(): Promise<TestWorld> {
  const world = await makeDataWorld(config);
  let count = 0;
  return {
    async device(user) {
      count += 1;
      const deviceId = `${user.replace(/-/g, "")}-${String(count).padStart(8, "0")}`;
      const engine = await world.device(deviceId);
      const data = createData({ engine, config, deviceId, user, clock: world.clock, random: world.random });
      return { user, data, engine };
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
