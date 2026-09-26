// Web Worker entry point for the life survey (see surveyTask.ts).

import { runSurvey } from "./surveyTask";
import type { SurveyRequest, SurveyMessage } from "./surveyTask";

// The DOM typings describe `self` as a window; inside a worker it is the worker scope
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SurveyRequest>) => void) | null;
  postMessage(message: SurveyMessage): void;
};

scope.onmessage = (event) => runSurvey(event.data, (message) => scope.postMessage(message));
