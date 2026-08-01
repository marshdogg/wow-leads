"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { LeadCard } from "@/components/card/LeadCard";
import type { Deal, PipelineId, StageConfig, StageId } from "@/lib/types";
import { BoardColumn } from "./BoardColumn";

/** Column width + gap: one arrow press moves the card exactly one column. */
const COLUMN_STEP = 306 + 15;

const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates },
) => {
  switch (event.code) {
    case "ArrowRight":
      return { ...currentCoordinates, x: currentCoordinates.x + COLUMN_STEP };
    case "ArrowLeft":
      return { ...currentCoordinates, x: currentCoordinates.x - COLUMN_STEP };
    case "ArrowDown":
      return { ...currentCoordinates, y: currentCoordinates.y + 25 };
    case "ArrowUp":
      return { ...currentCoordinates, y: currentCoordinates.y - 25 };
    default:
      return undefined;
  }
};

export function BoardColumns({
  pipe,
  stages,
  deals,
  collapsed,
  onToggle,
  onMove,
}: {
  pipe: PipelineId;
  stages: StageConfig[];
  deals: Deal[];
  /** Keyed by stage id, for the current pipeline. */
  collapsed: Record<string, boolean>;
  onToggle: (stageId: StageId) => void;
  onMove: (dealId: string, stageId: StageId) => void;
}) {
  const [dragging, setDragging] = useState<Deal | null>(null);

  // A distance constraint keeps the card's own buttons clickable — without it
  // the sensor swallows the click before the CTA ever sees it.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardKeyboardCoordinates,
    }),
  );

  function handleStart(event: DragStartEvent) {
    setDragging(deals.find((d) => d.id === event.active.id) ?? null);
  }

  function handleEnd(event: DragEndEvent) {
    const deal = dragging;
    setDragging(null);
    // Resolve the droppable id back to a stage of this pipeline, which both
    // narrows it to a StageId and rejects anything that isn't a column.
    const stage = stages.find((s) => s.id === event.over?.id);
    if (!deal || !stage || deal.stage === stage.id) return;
    onMove(deal.id, stage.id);
  }

  return (
    <DndContext
      // A stable id: dnd-kit otherwise derives its aria ids from a global
      // counter, which differs between the server and client renders and
      // trips a hydration mismatch on aria-describedby.
      id="wow-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div
        data-testid="board-columns"
        className="px-4 sm:px-7"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 460,
          // The strip is meant to run past the viewport — it scrolls itself.
          overflowX: "auto",
          overflowY: "hidden",
          paddingTop: 18,
          paddingBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 15,
            height: "100%",
            alignItems: "stretch",
          }}
        >
          {stages.map((stage) => (
            <BoardColumn
              key={stage.id}
              pipe={pipe}
              stage={stage}
              cards={deals.filter((d) => d.stage === stage.id)}
              collapsed={Boolean(collapsed[stage.id])}
              onToggle={() => onToggle(stage.id)}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div style={{ width: 280, cursor: "grabbing" }}>
            <LeadCard
              deal={dragging}
              collapsed={Boolean(collapsed[dragging.stage])}
              draggable
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
