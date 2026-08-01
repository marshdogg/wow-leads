"use client";

import { useDraggable } from "@dnd-kit/core";
import { LeadCard } from "@/components/card/LeadCard";
import type { Deal } from "@/lib/types";

/**
 * The whole card is the drag handle, so the draggable listeners go on a bare
 * wrapper that wraps exactly the card and nothing else. The pointer sensor's
 * distance constraint lets clicks on the CTA, quick-log row and name link
 * through untouched.
 */
export function DraggableCard({
  deal,
  collapsed,
}: {
  deal: Deal;
  collapsed: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { stage: deal.stage },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-roledescription="Draggable lead card"
      aria-label={`${deal.name}. Press space to pick up, arrow keys to move between stages.`}
      style={{
        flex: "none",
        outline: "none",
        opacity: isDragging ? 0.35 : 1,
        touchAction: "manipulation",
      }}
    >
      <LeadCard deal={deal} collapsed={collapsed} draggable />
    </div>
  );
}
