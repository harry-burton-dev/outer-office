// People by name: the framework's users table, and a way to show any stored
// user id as a name. Records keep ids; only what is shown changes.
import { useMemo } from "react";
import { useUsers, type WorkspaceUser } from "@trellis/framework";

/** The admin page writes as this user id. */
export const ADMIN_ID = "admin";

export interface People {
  /** Everyone in the users table, by name, inactive people included. */
  readonly list: readonly WorkspaceUser[];
  /** The user's name; "Admin" for the admin page; the id itself when unknown. */
  nameOf(id: string): string;
}

export function peopleFrom(list: readonly WorkspaceUser[]): People {
  const names = new Map(list.map((user) => [user.id, user.name]));
  return {
    list,
    nameOf: (id) => names.get(id) ?? (id === ADMIN_ID ? "Admin" : id),
  };
}

/** The people who can be offered as a choice now: active ones, by name. */
export const activePeople = (people: People): readonly WorkspaceUser[] => people.list.filter((user) => user.active);

export function usePeople(): People {
  const list = useUsers();
  return useMemo(() => peopleFrom(list), [list]);
}
