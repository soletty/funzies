// web/lib/clo/monte-carlo.worker.ts

import { runMonteCarlo, type MonteCarloResult } from "./monte-carlo";
import type { ProjectionInputs } from "./projection";

export interface MCWorkerInbound {
  type: "run";
  inputs: ProjectionInputs;
  runCount: number;
}

export interface MCWorkerProgress {
  type: "progress";
  completed: number;
  total: number;
}

export interface MCWorkerResult {
  type: "result";
  data: Omit<MonteCarloResult, "irrs"> & { irrs: number[] };
}

export type MCWorkerOutbound = MCWorkerProgress | MCWorkerResult;

const ctx = self as unknown as Worker;

ctx.addEventListener("message", (event: MessageEvent<MCWorkerInbound>) => {
  const { inputs, runCount } = event.data;

  const result = runMonteCarlo(inputs, runCount, (completed) => {
    ctx.postMessage({
      type: "progress",
      completed,
      total: runCount,
    } satisfies MCWorkerProgress);
  });

  // Convert Float64Array to regular array for structured clone transfer
  ctx.postMessage({
    type: "result",
    data: {
      ...result,
      irrs: Array.from(result.irrs),
    },
  } satisfies MCWorkerResult);
});
