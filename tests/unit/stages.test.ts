import { describe, expect, it } from "vitest";
import { PIPELINE_IDS, PIPES } from "@/lib/pipelines";
import {
  StageTransitionError,
  assertStageInPipeline,
  type StageLike,
} from "@/lib/repositories/rules";

/** The seeded `stages` table, as `moveDeal` reads it. */
const STAGE_ROWS: StageLike[] = PIPELINE_IDS.flatMap((pipelineId) =>
  PIPES[pipelineId].stages.map((s) => ({ id: s.id, pipelineId })),
);

describe("stage-transition validation", () => {
  it("accepts every in-pipeline move, including a no-op onto the same stage", () => {
    for (const pipelineId of PIPELINE_IDS) {
      for (const from of PIPES[pipelineId].stages) {
        for (const to of PIPES[pipelineId].stages) {
          const stage = assertStageInPipeline(
            `deal-${from.id}`,
            pipelineId,
            to.id,
            STAGE_ROWS,
          );
          expect(stage.pipelineId).toBe(pipelineId);
        }
      }
    }
  });

  it("throws StageTransitionError on every cross-pipeline stage pair", () => {
    let checked = 0;
    for (const pipelineId of PIPELINE_IDS) {
      for (const other of PIPELINE_IDS) {
        if (other === pipelineId) continue;
        for (const to of PIPES[other].stages) {
          checked += 1;
          expect(() =>
            assertStageInPipeline("d1", pipelineId, to.id, STAGE_ROWS),
          ).toThrow(StageTransitionError);
        }
      }
    }
    // 4 pipelines × 19 stages, minus each pipeline's own stages.
    expect(checked).toBe(PIPELINE_IDS.length * STAGE_ROWS.length - STAGE_ROWS.length);
  });

  it("names both pipelines in the error so the board can explain the refusal", () => {
    expect(() => assertStageInPipeline("r1", "resi", "hold", STAGE_ROWS)).toThrow(
      /belongs to pipeline "comm".*deal r1 is in "resi"/,
    );
  });

  it("rejects a stage id that is not in the stages table at all", () => {
    expect(() =>
      assertStageInPipeline("r1", "resi", "not-a-stage", STAGE_ROWS),
    ).toThrow(StageTransitionError);
  });

  it("validates against the rows, not the TypeScript union — a reconfigured stage works", () => {
    const reconfigured: StageLike[] = [
      ...STAGE_ROWS,
      { id: "warranty", pipelineId: "resi" },
    ];
    expect(
      assertStageInPipeline("r1", "resi", "warranty", reconfigured).pipelineId,
    ).toBe("resi");
    expect(() =>
      assertStageInPipeline("c1", "comm", "warranty", reconfigured),
    ).toThrow(StageTransitionError);
  });
});
