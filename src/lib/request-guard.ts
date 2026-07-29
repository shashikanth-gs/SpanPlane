import { DEMO_MAX_REQUEST_BYTES, isDemoDeployment } from "./deployment";

const LOCAL_MAX_REQUEST_BYTES = 16 * 1024 * 1024;

export class RequestValidationError extends Error {
  readonly status = 400;
}

function byteLimit(): number {
  return isDemoDeployment() ? DEMO_MAX_REQUEST_BYTES : LOCAL_MAX_REQUEST_BYTES;
}

/** Parse JSON while enforcing a byte limit before allocating an unbounded body. */
export async function readJsonRequest<T>(request: Request): Promise<T> {
  const limit = byteLimit();
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new RequestValidationError(`Request body exceeds the ${Math.floor(limit / 1024 / 1024)} MB limit.`);
  }
  if (!request.body) throw new RequestValidationError("Request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new RequestValidationError(`Request body exceeds the ${Math.floor(limit / 1024 / 1024)} MB limit.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) as T;
  } catch {
    throw new RequestValidationError("Invalid request JSON.");
  }
}
