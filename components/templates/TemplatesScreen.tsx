"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTemplateAction } from "@/app/actions/templates";
import { useUi } from "@/lib/store/ui";
import type { MessageTemplate, TemplateFacts } from "@/lib/templates/types";
import { previewTemplate, toDraft, type TemplateDraft } from "./draft";
import { TemplateEditor } from "./TemplateEditor";
import { TemplateList } from "./TemplateList";
import { TemplatePreview, type PreviewDeal } from "./TemplatePreview";
import { VariablePalette } from "./VariablePalette";

/**
 * The Templates screen: the franchise's own message copy, and the rule that
 * governs when each piece of it gets used.
 *
 * Facts for every preview record are loaded once by the page, so the preview
 * re-renders on each keystroke without a round trip — the resolver is pure
 * precisely so this can happen in the browser.
 */
export function TemplatesScreen({
  templates,
  deals,
  facts,
}: {
  templates: MessageTemplate[];
  deals: PreviewDeal[];
  /** Keyed by deal id. */
  facts: Record<string, TemplateFacts>;
}) {
  const router = useRouter();
  const showToast = useUi((s) => s.showToast);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<TemplateDraft | null>(
    templates[0] ? toDraft(templates[0]) : null,
  );
  const [dealId, setDealId] = useState<string>(deals[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  const select = (t: MessageTemplate) => {
    setSelectedId(t.id);
    setDraft(toDraft(t));
  };

  // Insert at the caret rather than appending — an author adding a name mid
  // sentence should not have to cut and paste it into place.
  const insertToken = (token: string) => {
    if (!draft) return;
    const snippet = `{{${token}}}`;
    const el = bodyRef.current;
    if (!el) {
      setDraft({ ...draft, body: draft.body + snippet });
      return;
    }
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? start;
    setDraft({
      ...draft,
      body: draft.body.slice(0, start) + snippet + draft.body.slice(end),
    });
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const dealFacts = facts[dealId] ?? null;
  const preview = draft && dealFacts ? previewTemplate(draft, dealFacts) : null;
  const blocked = Boolean(preview?.unknown.length);

  const save = () => {
    if (!draft || saving || blocked) return;
    setSaving(true);
    void (async () => {
      const res = await saveTemplateAction({
        // Omitting the id is the fork: the repository refuses to write over a
        // shipped default, so saving one creates the franchise's own row and
        // leaves ours for the next release to improve.
        ...(draft.isDefault ? {} : { id: draft.id }),
        name: draft.name,
        channel: draft.channel,
        triggerType: draft.triggerType,
        pipelineId: draft.pipelineId,
        stageId: draft.stageId,
        track: draft.track,
        subject: draft.channel === "EMAIL" ? draft.subject : null,
        body: draft.body,
        active: draft.active,
        allowAiAdaptation: draft.allowAiAdaptation,
      });

      try {
        if (res.ok) {
          showToast(
            draft.isDefault
              ? `Saved as your version of “${res.template.name}” — the shipped copy is untouched`
              : `“${res.template.name}” saved`,
          );
          // Re-point at the fork, or the next save would fork again.
          setSelectedId(res.template.id);
          setDraft(toDraft(res.template));
        } else {
          showToast(res.error);
        }
        router.refresh();
      } finally {
        // In a finally so a rejected action doesn't leave Save disabled with
        // no way back — the user would have to reload to try again.
        setSaving(false);
      }
    })();
  };

  return (
    <div
      className="px-4 pt-4 pb-8 sm:px-7"
      style={{ flex: 1, minHeight: 600, overflowY: "auto" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.5px",
            margin: 0,
          }}
        >
          Templates
        </h1>
        <div style={{ fontSize: 13, color: "#7d877d" }}>
          The copy every AI draft is built from. Yours to change — no deploy.
        </div>
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr]"
        style={{ gap: 18, marginTop: 18, alignItems: "start" }}
      >
        <div className="min-w-0">
          <TemplateList
            templates={templates}
            selectedId={selectedId}
            onSelect={select}
          />
        </div>

        {draft ? (
          <div
            className="flex min-w-0 flex-col"
            style={{ gap: 18 }}
          >
            <div
              style={{
                background: "#111411",
                border: "1px solid #23271f",
                borderRadius: 13,
                padding: 18,
              }}
            >
              <TemplateEditor
                draft={draft}
                onChange={setDraft}
                bodyRef={bodyRef}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 16,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  data-testid="template-save"
                  disabled={saving || blocked}
                  onClick={save}
                  className="hover:!bg-[#93e63a]"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0d0f0d",
                    background: blocked ? "#3f5c31" : "#7ed321",
                    border: "none",
                    padding: "11px 18px",
                    borderRadius: 10,
                    cursor: saving || blocked ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {draft.isDefault ? "Save as your version" : "Save template"}
                </button>
                {blocked ? (
                  <span style={{ fontSize: 12, color: "#f0a294" }}>
                    Unrecognised variables must be fixed first.
                  </span>
                ) : null}
              </div>
            </div>

            <div
              className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr]"
              style={{ gap: 18, alignItems: "start" }}
            >
              <div className="min-w-0">
                <TemplatePreview
                  draft={draft}
                  deals={deals}
                  dealId={dealId}
                  onDealChange={setDealId}
                  facts={dealFacts}
                />
              </div>
              <div
                className="min-w-0"
                style={{
                  background: "#111411",
                  border: "1px solid #23271f",
                  borderRadius: 13,
                  padding: 18,
                }}
              >
                <VariablePalette onInsert={insertToken} facts={dealFacts} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#7d877d" }}>
            No templates yet.
          </div>
        )}
      </div>
    </div>
  );
}
