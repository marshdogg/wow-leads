/**
 * Pipelines and stages read as data. The board renders whatever these rows
 * say, so a stage renamed or reordered in the database appears without a
 * deploy.
 */

import { asc } from "drizzle-orm";
import { db } from "@/db";
import { pipelines, stages } from "@/db/schema";
import type { PipelineConfig, PipelineId, StageConfig, StageId } from "@/lib/types";

export async function getPipelines(): Promise<PipelineConfig[]> {
  const [pipeRows, stageRows] = await Promise.all([
    db.select().from(pipelines).orderBy(asc(pipelines.sortOrder)),
    db.select().from(stages).orderBy(asc(stages.pipelineId), asc(stages.sortOrder)),
  ]);

  return pipeRows.map((p) => ({
    id: p.id as PipelineId,
    label: p.label,
    meta: p.meta,
    dot: p.dot,
    title: p.title,
    sub: p.sub,
    filter: p.filterLabel,
    tracks: p.hasTracks,
    showStageValue: p.showStageValue,
    neglectDays: p.neglectDays,
    stages: stageRows
      .filter((s) => s.pipelineId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map<StageConfig>((s) => ({
        id: s.id as StageId,
        label: s.label,
        hint: s.hint,
        ...(s.positive ? { positive: true } : {}),
        ...(s.titleColor ? { titleColor: s.titleColor } : {}),
      })),
  }));
}

export async function getPipelineConfig(id: PipelineId): Promise<PipelineConfig> {
  const all = await getPipelines();
  const found = all.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown pipeline "${id}".`);
  return found;
}
