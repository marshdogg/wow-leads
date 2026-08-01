import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { metaRows, type RecordView } from "@/components/record/view-model";
import { PIPES } from "@/lib/pipelines";
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
      "sourcedFrom",
      "owner",
      "pipeline",
      "businessType",
      "preferredContact",
    ]);
    expect(META_FIELDS.map((f) => f.label)).toEqual([
      "Lead source",
      "Assigned by",
      "Sourced from",
      "Owner",
      "Pipeline",
      "Business type",
      "Preferred contact",
    ]);
  });

  it("keeps the two provenance rows adjacent", () => {
    // "Assigned by" and "Sourced from" answer the same question — where this
    // came from — so they read as a pair rather than being split by Owner.
    const keys = META_FIELDS.map((f) => f.key);
    expect(keys.indexOf("sourcedFrom")).toBe(keys.indexOf("assignedBy") + 1);
  });

  it("labels every contact channel", () => {
    expect(CHANNEL_LABELS).toEqual({
      SMS: "SMS",
      EMAIL: "Email",
      PHONE: "Phone",
    });
  });
});

describe("metaRows — the config turned into rows", () => {
  const view: RecordView = {
    deal: {
      id: "n3",
      pipe: "newleads",
      stage: "new",
      name: "Priya Raman",
      account: "2310 Tunlaw Rd NW",
      tags: ["DIRECT HOMEOWNER"],
      source: "Job Site",
      owner: { initials: "DK", name: "Dani Koval", agent: false },
      assignedBy: "Self-sourced",
      aiPending: false,
      stale: "",
      staleWarn: false,
      metrics: [],
      next: null,
      act: "Log Call",
      quick: true,
    },
    account: { id: "a-n3", name: "Raman residence", tags: [], details: [], accessNotes: "" },
    contacts: [],
    accessNotes: "",
    timeline: [],
  };

  it("omits the origin row entirely when the lead came off no job", () => {
    const keys = metaRows(view).map((r) => r.key);
    expect(keys).not.toContain("sourcedFrom");
    expect(keys).toContain("assignedBy");
  });

  it("renders the origin as a green, linked provenance row", () => {
    const rows = metaRows(view, { id: "r8", account: "2308 Tunlaw Rd NW" });
    const row = rows.find((r) => r.key === "sourcedFrom");
    expect(row).toBeDefined();
    expect(row?.label).toBe("Sourced from");
    expect(row?.value).toBe("Job at 2308 Tunlaw Rd NW");
    expect(row?.href).toBe("/record/r8");
    // Green is the provenance signal, same as a trigger or partner assignment.
    expect(row?.color).toBe("#b6f07a");
  });

  it("puts the origin directly after Assigned by", () => {
    const keys = metaRows(view, { id: "r8", account: "2308 Tunlaw Rd NW" }).map(
      (r) => r.key,
    );
    expect(keys.indexOf("sourcedFrom")).toBe(keys.indexOf("assignedBy") + 1);
  });

  it("names the pipeline in full, not by its rail label", () => {
    // `PIPES.resi.label` is "Re-marketing", which only makes sense under the
    // rail's RESIDENTIAL LEADS heading. This strip has no heading, so the row
    // must carry the standalone name.
    const resi = metaRows({
      ...view,
      deal: { ...view.deal, pipe: "resi" },
    }).find((r) => r.key === "pipeline");
    expect(resi?.value).toBe("Residential Re-marketing");
    expect(resi?.value).not.toBe(PIPES.resi.label);
  });

  it("leaves every other row unlinked", () => {
    const rows = metaRows(view, { id: "r8", account: "2308 Tunlaw Rd NW" });
    for (const r of rows.filter((x) => x.key !== "sourcedFrom")) {
      expect(r.href, r.key).toBeUndefined();
    }
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
