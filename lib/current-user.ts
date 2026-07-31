import type { User } from "./types";

/**
 * TODO(auth): v1 ships with no authentication. This module is the single
 * seam where real auth drops in — replace `getCurrentUser()` with a session
 * lookup and delete `SWITCHABLE_USERS`. Nothing else should read a user
 * identity directly.
 */

export const DEFAULT_USER_ID = "u-marshall";

export const SWITCHABLE_USERS: User[] = [
  {
    id: "u-marshall",
    name: "Marshall Behrns",
    initials: "MB",
    role: "manager",
    locationId: "loc-dc",
  },
  {
    id: "u-dani",
    name: "Dani Koval",
    initials: "DK",
    role: "rep",
    locationId: "loc-dc",
  },
  {
    id: "u-jorden",
    name: "Jorden Bhatt",
    initials: "JB",
    role: "rep",
    locationId: "loc-dc",
  },
  {
    id: "u-reese",
    name: "Reese Alvarado",
    initials: "RA",
    role: "rep",
    locationId: "loc-dc",
  },
];

/** The hard-coded current user for v1. */
export function getCurrentUser(): User {
  return SWITCHABLE_USERS[0];
}

export function getUserById(id: string): User {
  return SWITCHABLE_USERS.find((u) => u.id === id) ?? SWITCHABLE_USERS[0];
}

export const LOCATIONS = [
  { id: "loc-dc", name: "Washington DC", region: "DC · MD · NoVA" },
  { id: "loc-bal", name: "Baltimore", region: "MD" },
];
