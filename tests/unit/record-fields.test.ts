import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHANNEL_LABELS,
  META_FIELDS,
  PROPERTY_FIELDS,
  propertyLabel,
  QUICK_LOG_ACTIONS,
  RECORD_FIELDS,
  RECORD_FIELD_KEYS,
  RECORD_TOASTS,
  SUGGESTIONS,
} from "@/lib/record-fields";

const ROOT = process.cwd();
const SOURCE_DIRS = [
  path.join(ROOT, "components", "record"),
  path.join(ROOT, "app", "(app)", "record"),
];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const RECORD_SOURCE = SOURCE_DIRS.flatMap(sourceFiles)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

function referencedKeys(prefix: string): string[] {
  const re = new RegExp(`${prefix}\\.([A-Za-z0-9_]+)`, "g");
  return [...new Set([...RECORD_SOURCE.matchAll(re)].map((m) => m[1]))];
}

describe("RECORD_FIELDS", () => {
  it("has a source to scan", () => {
    // Guards the two tests below from silently passing on an empty read.
    expect(RECORD_SOURCE.length).toBeGreaterThan(1000);
  });

  it("declares exactly the keys it exports", () => {
    expect([...RECORD_FIELD_KEYS].sort()).toEqual(
      Object.keys(RECORD_FIELDS).sort(),
    );
  });

  it("has non-empty copy for every key", () => {
    for (const key of RECORD_FIELD_KEYS) {
      expect(RECORD_FIELDS[key], key).toBeTruthy();
      expect(RECORD_FIELDS[key].trim(), key).toBe(RECORD_FIELDS[key]);
    }
  });

  it("covers every key the record screen renders", () => {
    for (const key of referencedKeys("RECORD_FIELDS")) {
      expect(Object.keys(RECORD_FIELDS), `RECORD_FIELDS.${key}`).toContain(key);
    }
  });

  it("has no unused keys — dead labels drift out of date", () => {
    const used = new Set(referencedKeys("RECORD_FIELDS"));
    expect([...RECORD_FIELD_KEYS].filter((k) => !used.has(k))).toEqual([]);
  });

  it("covers every toast the record fires, and no more", () => {
    const used = new Set(referencedKeys("RECORD_TOASTS"));
    const declared = Object.keys(RECORD_TOASTS);
    for (const key of used) expect(declared).toContain(key);
    expect(declared.filter((k) => !used.has(k))).toEqual([]);
  });
});

describe("PROPERTY_FIELDS", () => {
  const EXPECTED = [
    "PROPERTY TYPE",
    "SQUARE FOOTAGE",
    "PAINT USED",
    "TRIM / CEILINGS",
    "LAST JOB",
    "CREW",
  ];

  it("declares the full property-detail set in render order", () => {
    expect(PROPERTY_FIELDS.map((f) => f.label)).toEqual(EXPECTED);
  });

  it("has a unique key per field", () => {
    const keys = PROPERTY_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves stored labels regardless of casing or punctuation", () => {
    expect(propertyLabel("PROPERTY TYPE")).toBe("PROPERTY TYPE");
    expect(propertyLabel("Property type")).toBe("PROPERTY TYPE");
    expect(propertyLabel("Trim/Ceilings")).toBe("TRIM / CEILINGS");
    expect(propertyLabel("square_footage")).toBe("SQUARE FOOTAGE");
  });

  it("passes an unknown stored label through rather than dropping the field", () => {
    expect(propertyLabel("Roof pitch")).toBe("ROOF PITCH");
  });
});

describe("META_FIELDS", () => {
  it("declares the RECORD panel in order", () => {
    expect(META_FIELDS.map((f) => f.key)).toEqual([
      "source",
      "assignedBy",
      "owner",
      "pipeline",
      "businessType",
      "preferredContact",
    ]);
    expect(META_FIELDS.map((f) => f.label)).toEqual([
      "Lead source",
      "Assigned by",
      "Owner",
      "Pipeline",
      "Business type",
      "Preferred contact",
    ]);
  });

  it("labels every contact channel", () => {
    expect(CHANNEL_LABELS).toEqual({
      SMS: "SMS",
      EMAIL: "Email",
      PHONE: "Phone",
    });
  });
});

describe("QUICK_LOG_ACTIONS and SUGGESTIONS", () => {
  it("logs a call, a text and a visit", () => {
    expect(QUICK_LOG_ACTIONS.map((q) => q.key)).toEqual([
      "Call",
      "Text",
      "Visit",
    ]);
    expect(QUICK_LOG_ACTIONS.map((q) => q.label)).toEqual([
      "Log Call",
      "Log Text",
      "Log Visit",
    ]);
  });

  it("declares the three suggestion cards with distinct ids", () => {
    expect(SUGGESTIONS.map((s) => s.kind)).toEqual([
      "SUGGEST THE NEXT STEP",
      "SUMMARIZE HISTORY",
      "DRAFT THE FOLLOW-UP",
    ]);
    expect(SUGGESTIONS.map((s) => s.primary)).toEqual([
      "Accept suggestion",
      "Insert as note",
      "Review & send",
    ]);
    expect(new Set(SUGGESTIONS.map((s) => s.id)).size).toBe(SUGGESTIONS.length);
  });
});
