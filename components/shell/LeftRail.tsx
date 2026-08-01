"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { LOCATIONS, SWITCHABLE_USERS } from "@/lib/current-user";
import { useUi } from "@/lib/store/ui";
import type { PipelineCategory, PipelineConfig } from "@/lib/types";

/** Nav entries that aren't pipelines. Pipelines are grouped above these. */
const NAV = [
  { label: "Approvals", href: "/approvals" },
  { label: "Templates", href: "/templates" },
  { label: "Field view", href: "/field" },
  { label: "Manager dashboard", href: "/manager" },
  { label: "Switcher", href: "/switcher" },
];

/**
 * Category headings, derived from the pipelines rather than listed here, so a
 * franchise-created category appears in the rail without a code change. Order
 * follows the pipelines' own order — the first pipeline in a category fixes
 * where that heading sits.
 */
function categoriesIn(pipelines: PipelineConfig[]): PipelineCategory[] {
  const seen: PipelineCategory[] = [];
  for (const p of pipelines) {
    if (p.category && !seen.includes(p.category)) seen.push(p.category);
  }
  return seen;
}

const OUTER_NAV = [
  "Dashboard",
  "Funnel",
  "Customers",
  "Calendar",
  "Tasks",
  "Technicians",
];

export function LeftRail({
  approvalCount,
  neglectedCount,
  pipelines,
  pipelineCounts,
}: {
  approvalCount: number;
  neglectedCount: number;
  /** Ordered pipelines, grouped into categories by the rail. */
  pipelines: PipelineConfig[];
  /** Deal count per pipeline id, shown as the row badge. */
  pipelineCounts: Record<string, number>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The board reads its pipeline from the URL, so the rail's active row has to
  // as well — otherwise every pipeline row highlights on /board.
  const activePipeline = searchParams.get("pipeline") ?? "resi";
  const showToast = useUi((s) => s.showToast);
  const currentUserId = useUi((s) => s.currentUserId);
  const setCurrentUserId = useUi((s) => s.setCurrentUserId);
  const user =
    SWITCHABLE_USERS.find((u) => u.id === currentUserId) ?? SWITCHABLE_USERS[0];

  const counts: Record<string, { value: number; color: string }> = {
    "/approvals": { value: approvalCount, color: "#b6f07a" },
    "/manager": { value: neglectedCount, color: "#e0673f" },
  };

  return (
    // Hidden below md: 252px of chrome on a 390px phone leaves nothing for the
    // content. The Field view — the only screen reps use on a phone — carries
    // its own mobile header. `display` lives in the class, not the style
    // object, so the responsive variant isn't overridden by the inline value.
    <div
      className="hidden md:flex"
      style={{
        position: "sticky",
        top: 0,
        alignSelf: "stretch",
        height: "100vh",
        minHeight: 840,
        width: 252,
        flex: "none",
        flexDirection: "column",
        background: "#0a0c0a",
        borderRight: "1px solid #1f231e",
      }}
    >
      <div style={{ flex: "none", padding: "20px 20px 12px" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "#7ed321",
            color: "#0d0f0d",
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            letterSpacing: "-0.5px",
          }}
        >
          WOW
        </div>
      </div>

      <div style={{ flex: "none", padding: "6px 18px 14px" }}>
        <button
          type="button"
          onClick={() =>
            showToast(
              "Add Contact — pick or create the Account, source required, everything else optional",
            )
          }
          className="hover:!border-[#4b9c2d] hover:!bg-[#16290e]"
          style={{
            width: "100%",
            border: "1px solid #2f6b1f",
            background: "#0f1a0b",
            color: "#a8ea6b",
            fontSize: 15,
            fontWeight: 600,
            padding: "13px 12px",
            borderRadius: 10,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>+</span> Add Contact
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "4px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <OuterNavItem label={OUTER_NAV[0]} />

        <div
          style={{
            flex: "none",
            margin: "2px 0",
            borderRadius: 10,
            background: "#101a0b",
            border: "1px solid #2b4b1c",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "11px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#b6f07a",
              fontWeight: 600,
            }}
          >
            <span>Leads</span>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.5px",
                fontWeight: 700,
                background: "#7ed321",
                color: "#0d0f0d",
                padding: "2px 6px",
                borderRadius: 5,
              }}
            >
              NEW
            </span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "0 6px 8px",
              gap: 1,
            }}
          >
            {categoriesIn(pipelines).map((category) => {
              const inCategory = pipelines.filter(
                (p) => p.category === category,
              );
              if (!inCategory.length) return null;
              return (
                <div key={category}>
                  <div
                    style={{
                      padding: "10px 12px 5px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.8px",
                      color: "#6f7a6f",
                    }}
                  >
                    {category}
                  </div>
                  {inCategory.map((p) => {
                    const onBoard =
                      pathname === "/board" || pathname.startsWith("/record");
                    const on = onBoard && activePipeline === p.id;
                    const count = pipelineCounts[p.id] ?? 0;
                    return (
                      <Link
                        key={p.id}
                        href={`/board?pipeline=${p.id}`}
                        data-testid={`pipeline-${p.id}`}
                        aria-current={on ? "page" : undefined}
                        className="hover:!bg-[#1a2a12]"
                        style={{
                          padding: "8px 12px",
                          borderRadius: 7,
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          background: on ? "#1f2f16" : "transparent",
                          color: on ? "#d5f8a8" : "#93a08d",
                          fontWeight: on ? 600 : 400,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: p.dot,
                            flex: "none",
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.label}
                        </span>
                        {count > 0 ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: "var(--font-plex-mono), monospace",
                              color: on ? "#b6f07a" : "#8b948b",
                            }}
                          >
                            {count}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              );
            })}

            <div style={{ height: 6 }} />

            {NAV.map((n) => {
              const on = pathname === n.href;
              const count = counts[n.href];
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="hover:!bg-[#1a2a12]"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 7,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    background: on ? "#1f2f16" : "transparent",
                    color: on ? "#d5f8a8" : "#93a08d",
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  <span>{n.label}</span>
                  {count && count.value > 0 ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-plex-mono), monospace",
                        color: count.color,
                      }}
                    >
                      {count.value}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>

        {OUTER_NAV.slice(1).map((label) => (
          <OuterNavItem key={label} label={label} />
        ))}
      </div>

      <div
        style={{
          flex: "none",
          borderTop: "1px solid #1f231e",
          padding: "14px 18px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() =>
            showToast(
              `Franchise switcher — ${LOCATIONS.map((l) => l.name).join(" · ")}`,
            )
          }
          className="hover:!border-[#3b423a]"
          style={{
            border: "1px solid #262b25",
            borderRadius: 9,
            padding: "10px 12px",
            color: "#c6cdc6",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            background: "transparent",
            width: "100%",
          }}
        >
          Switch Franchise
          <ChevronDown size={14} strokeWidth={2} color="#5c655c" />
        </button>
        <div style={{ fontSize: 13, color: "#98a298" }}>Washington DC W1D</div>

        {/* Rep switcher — v1 demo affordance, replaced by real auth. */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: "#22301b",
              color: "#a8ea6b",
              fontSize: 11,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            {user.initials}
          </div>
          <select
            aria-label="Switch current user"
            data-testid="rep-switcher"
            value={currentUserId}
            onChange={(e) => {
              setCurrentUserId(e.target.value);
              const next = SWITCHABLE_USERS.find(
                (u) => u.id === e.target.value,
              );
              if (next) showToast(`Viewing as ${next.name} · ${next.role}`);
            }}
            style={{
              fontSize: 13,
              color: "#c6cdc6",
              background: "transparent",
              border: "none",
              outline: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: 0,
              minWidth: 0,
            }}
          >
            {SWITCHABLE_USERS.map((u) => (
              <option key={u.id} value={u.id} style={{ background: "#141814" }}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{ fontSize: 13, color: "#7d877d", cursor: "pointer" }}
          className="hover:!text-[#e9ede9]"
        >
          Sign Out
        </div>
      </div>
    </div>
  );
}

function OuterNavItem({ label }: { label: string }) {
  return (
    <div
      className="hover:!bg-[#131713] hover:!text-[#e9ede9]"
      style={{
        flex: "none",
        padding: "9px 12px",
        borderRadius: 8,
        color: "#98a298",
        cursor: "pointer",
      }}
    >
      {label}
    </div>
  );
}
