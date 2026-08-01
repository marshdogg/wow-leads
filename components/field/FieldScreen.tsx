"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BatteryCharging, ChevronLeft, Signal } from "lucide-react";
import { useUi } from "@/lib/store/ui";
import { SWITCHABLE_USERS } from "@/lib/current-user";
import {
  logOutcomeAction,
  parseVoiceAction,
  saveVoiceNoteAction,
} from "@/app/actions/voice";
import { useSpeechRecognition } from "@/lib/voice/useSpeechRecognition";
import { toEditableFields } from "@/lib/voice/types";
import type { EditableFields } from "@/lib/voice/types";
import type { Deal } from "@/lib/types";
import { LeadHeader } from "./LeadHeader";
import { OutcomeTaps } from "./OutcomeTaps";
import type { OutcomeKind } from "./OutcomeTaps";
import { VoiceCapture } from "./VoiceCapture";
import type { VoiceStage } from "./VoiceCapture";
import { WhyThisShape } from "./WhyThisShape";

/**
 * The one screen reps actually use standing in a driveway.
 *
 * Below 900px the phone chrome is dropped and the screen takes the whole
 * viewport — the framed desktop view is a presentation of the mobile layout,
 * not the other way round. The overlay covers the shell's rail and top bar, so
 * a back link stands in for navigation at that size.
 */
const RESPONSIVE_CSS = `
.wf-root { flex: 1; min-height: 560px; overflow-y: auto; padding: 18px 28px 30px; }
.wf-mobilebar { display: none; }
.wf-head { display: flex; align-items: baseline; gap: 14px; }
.wf-statusbar { display: flex; justify-content: space-between; align-items: center;
  padding: 12px 20px 8px; font-size: 12px; color: #8b948b;
  font-family: var(--font-plex-mono), 'IBM Plex Mono', monospace; }
.wf-statusbar > span { display: flex; align-items: center; gap: 6px; }
.wf-cols { display: flex; gap: 28px; margin-top: 22px; flex-wrap: wrap; align-items: flex-start; }
.wf-frame { width: 390px; flex: none; background: #0a0c0a; border: 1px solid #23271f;
  border-radius: 34px; padding: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.55); }
.wf-screen { background: #0d0f0d; border-radius: 26px; overflow: hidden; }
.wf-body { padding: 8px 16px 18px; display: flex; flex-direction: column; gap: 14px; }
.wf-aside { flex: 1; min-width: 320px; display: flex; flex-direction: column; gap: 16px; }

@media (max-width: 900px) {
  /* The overlay covers the shell, but the 252px rail behind it would still let
     the document scroll sideways. Scrolling belongs to .wf-root at this size. */
  html, body { overflow: hidden; }
  .wf-root { position: fixed; inset: 0; z-index: 40; background: #0d0f0d;
    padding: 0; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .wf-head { display: none; }
  .wf-statusbar { display: none; }
  .wf-mobilebar { display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 14px 16px 10px; position: sticky; top: 0; z-index: 1;
    background: #0d0f0d; border-bottom: 1px solid #191d18; }
  .wf-cols { display: block; margin-top: 0; }
  .wf-frame { width: 100%; padding: 0; border: none; border-radius: 0; box-shadow: none;
    background: transparent; }
  .wf-screen { border-radius: 0; }
  .wf-body { padding: 14px 16px 20px; gap: 14px; }
  .wf-aside { min-width: 0; padding: 4px 16px 28px; gap: 14px; }
  /* Thumb targets grow on a real phone; the framed desktop view keeps the
     prototype's exact 56/52/47px so the presentation stays pixel-faithful. */
  .wf-tap { min-height: 64px; }
  .wf-mic { width: 58px !important; height: 58px !important; }
  .wf-save { min-height: 56px; }
}
`;

export function FieldScreen({
  deal,
  prefersChannel,
}: {
  deal: Deal;
  prefersChannel: string | null;
}) {
  const router = useRouter();
  const showToast = useUi((s) => s.showToast);
  const currentUserId = useUi((s) => s.currentUserId);
  const user =
    SWITCHABLE_USERS.find((u) => u.id === currentUserId) ?? SWITCHABLE_USERS[0];

  const [stage, setStage] = useState<VoiceStage>("idle");
  const [transcript, setTranscript] = useState("");
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingTap, setPendingTap] = useState<OutcomeKind | null>(null);

  const onTranscript = useCallback(
    async (text: string) => {
      setTranscript(text);
      setStage("parsing");
      const result = await parseVoiceAction({ transcript: text });
      if (!result.ok) {
        showToast(result.error);
        setStage("idle");
        setTranscript("");
        return;
      }
      setFields(toEditableFields(result.data));
      setDueAt(result.data.dueAt);
      setStage("captured");
    },
    [showToast],
  );

  const speech = useSpeechRecognition(onTranscript);

  const toggleMic = useCallback(() => {
    if (stage === "listening") {
      speech.stop();
      return;
    }
    // From "captured" the copy promises another recording, so start straight in.
    setFields(null);
    setDueAt(null);
    setTranscript("");
    setStage("listening");
    speech.start();
  }, [speech, stage]);

  const handleTap = useCallback(
    async (kind: OutcomeKind) => {
      setPendingTap(kind);
      const result = await logOutcomeAction({
        dealId: deal.id,
        kind,
        actorUserId: user.id,
      });
      setPendingTap(null);
      showToast(
        result.ok
          ? `${kind} logged on ${deal.name} — no fields required, next step +2 days`
          : result.error,
      );
      if (result.ok) router.refresh();
    },
    [deal.id, deal.name, router, showToast, user.id],
  );

  const handleSave = useCallback(async () => {
    if (!fields) return;
    setSaving(true);
    const result = await saveVoiceNoteAction({
      dealId: deal.id,
      transcript,
      fields,
      dueAt,
      actorUserId: user.id,
    });
    setSaving(false);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setStage("idle");
    setFields(null);
    setTranscript("");
    showToast(
      `Note saved to ${deal.name} — structured by agent, logged to ${user.name}`,
    );
    router.push(result.data.redirectTo);
  }, [deal.id, deal.name, dueAt, fields, router, showToast, transcript, user]);

  // While listening we show live interim results; the final text lands on stop.
  const shownTranscript =
    stage === "listening" ? speech.interim : transcript;

  return (
    <div className="wf-root">
      <style>{RESPONSIVE_CSS}</style>

      <div className="wf-mobilebar">
        <Link
          href="/board"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "#8b948b",
          }}
        >
          <ChevronLeft size={15} strokeWidth={2} /> Pipelines
        </Link>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.9px",
            fontWeight: 600,
            color: "#7ea85c",
          }}
        >
          FIELD
        </span>
      </div>

      <div className="wf-head">
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.5px",
            whiteSpace: "nowrap",
          }}
        >
          Field view
        </div>
        <div style={{ fontSize: 13, color: "#7d877d" }}>
          Mobile is the primary logging surface — one tap, no required fields.
        </div>
      </div>

      <div className="wf-cols">
        <div className="wf-frame">
          <div className="wf-screen">
            <div className="wf-statusbar">
              <span>9:41</span>
              <span>
                <Signal size={13} strokeWidth={2.2} />
                <BatteryCharging size={15} strokeWidth={2} />
              </span>
            </div>

            <div className="wf-body">
              <LeadHeader
                deal={deal}
                prefersChannel={prefersChannel}
                initials={user.initials}
              />
              <OutcomeTaps pending={pendingTap} onTap={handleTap} />
              <VoiceCapture
                stage={stage}
                transcript={shownTranscript}
                fields={fields}
                saving={saving}
                loggedAs={user.name}
                onToggle={toggleMic}
                onFieldChange={(key, value) =>
                  setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
                }
                onSave={handleSave}
              />
            </div>
          </div>
        </div>

        <div className="wf-aside">
          <WhyThisShape />
        </div>
      </div>
    </div>
  );
}
