// Web Worker entry point for one chunk of the life survey (see surveyTask.ts).

import { runSurveyChunk } from "./surveyTask";
import type { ChunkRequest, ChunkMessage } from "./surveyTask";

// The DOM typings describe `self` as a window; inside a worker it is the worker scope
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ChunkRequest>) => void) | null;
  postMessage(message: ChunkMessage): void;
};

scope.onmessage = (event) => runSurveyChunk(event.data, (message) => scope.postMessage(message));
