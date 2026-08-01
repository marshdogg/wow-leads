"use client";

import { useTransition } from "react";
import { setTemplateActiveAction } from "@/app/actions/templates";
import type { MessageTemplate } from "@/lib/templates/types";
import { useUi } from "@/lib/store/ui";
import { PRECEDENCE_NOTE, scopeSummary, toDraft, triggerLabel } from "./draft";

/**
 * Templates grouped by the trigger they answer, because that is what an author
 * is looking for — "where does the 11-month copy live" — rather than by
 * channel or alphabetically.
 */
export function TemplateList({
  templates,
  selectedId,
  onSelect,
}: {
  templates: MessageTemplate[];
  selectedId: string | null;
  onSelect: (t: MessageTemplate) => void;
}) {
  const showToast = useUi((s) => s.showToast);
  const [pending, startTransition] = useTransition();

  const groups = new Map<string, MessageTemplate[]>();
  for (const t of templates) {
    const key = t.triggerType ? triggerLabel(t.triggerType) : "Any trigger";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const toggle = (t: MessageTemplate) => {
    if (pending) return;
    startTransition(async () => {
      const res = await setTemplateActiveAction({
        id: t.id,
        active: !t.active,
      });
      showToast(res.toast);
    });
  };

  return (
    <div
      data-testid="template-list"
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div
        data-testid="templates-scope-note"
        style={{
          border: "1px solid #23271f",
          background: "#111411",
          borderRadius: 11,
          padding: "13px 15px",
          fontSize: 12,
          color: "#8b948b",
          lineHeight: 1.55,
        }}
      >
        {PRECEDENCE_NOTE}
      </div>

      {[...groups].map(([group, rows]) => (
        <div key={group}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.8px",
              fontWeight: 700,
              color: "#6f7a6f",
              marginBottom: 8,
            }}
          >
            {group.toUpperCase()}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            {rows.map((t) => {
              const on = t.id === selectedId;
              return (
                <div
                  key={t.id}
                  data-testid={`template-row-${t.id}`}
                  className="hover:!border-[#4b9c2d]"
                  style={{
                    border: `1px solid ${on ? "#2f6b1f" : "#262b25"}`,
                    background: on ? "#0f1a0b" : "#141814",
                    borderRadius: 10,
                    padding: "11px 13px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: t.active ? 1 : 0.55,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(t)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      color: "#e9ede9",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {t.name}
                      </span>
                      {t.isDefault ? (
                        <span
                          title="Shipped with WOW Leads. Editing it creates your own copy."
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.8px",
                            fontWeight: 600,
                            padding: "3px 6px",
                            borderRadius: 4,
                            background: "#23271f",
                            color: "#98a298",
                          }}
                        >
                          SHIPPED
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.8px",
                            fontWeight: 600,
                            padding: "3px 6px",
                            borderRadius: 4,
                            background: "#101a0b",
                            color: "#a8ea6b",
                            border: "1px solid #2f6b1f",
                          }}
                        >
                          YOURS
                        </span>
                      )}
                    </div>
                    <div
                      style={{ fontSize: 11, color: "#8b948b", marginTop: 3 }}
                    >
                      {scopeSummary(toDraft(t))} · {t.channel}
                    </div>
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={t.active}
                    aria-label={`${t.active ? "Deactivate" : "Activate"} ${t.name}`}
                    data-testid={`template-active-${t.id}`}
                    disabled={pending}
                    onClick={() => toggle(t)}
                    style={{
                      flex: "none",
                      width: 38,
                      height: 22,
                      borderRadius: 11,
                      border: `1px solid ${t.active ? "#2f6b1f" : "#262b25"}`,
                      background: t.active ? "#1f2f16" : "#141814",
                      cursor: pending ? "progress" : "pointer",
                      padding: 2,
                      display: "flex",
                      justifyContent: t.active ? "flex-end" : "flex-start",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: t.active ? "#7ed321" : "#5c655c",
                        display: "block",
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
