type JsonObject = Record<string, unknown>;

const TERMINAL_STATE_NAMES = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "CANCELLED",
  "REJECTED",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_CANCELLED",
  "TASK_STATE_REJECTED",
]);

const TERMINAL_STATE_NUMBERS = new Set([3, 4, 5, 7]);

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function isTerminalTaskState(state: unknown): boolean {
  if (typeof state === "number") return TERMINAL_STATE_NUMBERS.has(state);
  const value = String(state ?? "").trim().toUpperCase();
  if (TERMINAL_STATE_NAMES.has(value)) return true;
  return /^\d+$/.test(value) && TERMINAL_STATE_NUMBERS.has(Number(value));
}

export interface TaskCorrelation {
  contextId?: string;
  taskId?: string;
  taskState?: unknown;
}

export interface ProtocolStatusEvidence {
  id: string;
  timestamp: string;
  taskId?: string;
  contextId?: string;
  state: unknown;
  message?: JsonObject;
}

export function extractTaskStatusUpdates(value: unknown): ProtocolStatusEvidence[] {
  const updates: ProtocolStatusEvidence[] = [];
  const visit = (candidate: unknown) => {
    if (!isObject(candidate)) return;
    if (isObject(candidate.status) && candidate.status.state !== undefined) {
      const taskId = typeof candidate.taskId === "string" ? candidate.taskId : typeof candidate.id === "string" ? candidate.id : undefined;
      const contextId = typeof candidate.contextId === "string" ? candidate.contextId : undefined;
      const timestamp = typeof candidate.status.timestamp === "string" ? candidate.status.timestamp : "";
      const message = isObject(candidate.status.message) ? candidate.status.message : undefined;
      updates.push({
        id: `${taskId ?? "task"}:${String(candidate.status.state)}:${timestamp}:${message?.messageId ?? ""}`,
        timestamp,
        taskId,
        contextId,
        state: candidate.status.state,
        message,
      });
    }
    for (const key of ["task", "statusUpdate", "taskStatusUpdate"]) visit(candidate[key]);
  };
  visit(value);
  return updates;
}

export function extractTaskCorrelation(value: unknown): TaskCorrelation {
  const correlation: TaskCorrelation = {};

  const visit = (candidate: unknown) => {
    if (!isObject(candidate)) return;
    if (typeof candidate.contextId === "string" && candidate.contextId) {
      correlation.contextId = candidate.contextId;
    }
    if (typeof candidate.taskId === "string" && candidate.taskId) {
      correlation.taskId = candidate.taskId;
    }
    if (isObject(candidate.status)) {
      if (typeof candidate.id === "string" && candidate.id) correlation.taskId = candidate.id;
      if (candidate.status.state !== undefined) correlation.taskState = candidate.status.state;
    }
    for (const key of ["task", "message", "statusUpdate", "taskStatusUpdate", "artifactUpdate", "taskArtifactUpdate"]) {
      visit(candidate[key]);
    }
  };

  visit(value);
  return correlation;
}

export function extractProtocolTimestamp(value: unknown): string | undefined {
  let timestamp: string | undefined;
  const visit = (candidate: unknown) => {
    if (!isObject(candidate)) return;
    if (isObject(candidate.status) && typeof candidate.status.timestamp === "string") timestamp = candidate.status.timestamp;
    if (isObject(candidate.metadata) && typeof candidate.metadata.timestamp === "string") timestamp = candidate.metadata.timestamp;
    for (const key of ["task", "statusUpdate", "taskStatusUpdate", "artifactUpdate", "taskArtifactUpdate", "artifact"]) visit(candidate[key]);
  };
  visit(value);
  return timestamp;
}

export function conversationalTaskId(taskId: string, taskState: unknown): string {
  return isTerminalTaskState(taskState) ? "" : taskId;
}
