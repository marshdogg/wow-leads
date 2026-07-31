"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { LOCATIONS, SWITCHABLE_USERS } from "@/lib/current-user";
import { useUi } from "@/lib/store/ui";

const NAV = [
  { label: "Pipelines", href: "/board" },
  { label: "Approvals", href: "/approvals" },
  { label: "Field view", href: "/field" },
  { label: "Manager dashboard", href: "/manager" },
  { label: "Switcher", href: "/switcher" },
];

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
}: {
  approvalCount: number;
  neglectedCount: number;
}) {
  const pathname = usePathname();
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
    <div
      style={{
        position: "sticky",
        top: 0,
        alignSelf: "stretch",
        height: "100vh",
        minHeight: 840,
        width: 252,
        flex: "none",
        display: "flex",
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
            {NAV.map((n) => {
              const on =
                pathname === n.href ||
                (n.href === "/board" && pathname.startsWith("/record"));
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
