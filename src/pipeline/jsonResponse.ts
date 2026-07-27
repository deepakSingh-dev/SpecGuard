import type { ZodType } from "zod";

/**
 * Providers often wrap JSON replies in markdown code fences. Strip that
 * before parsing, and surface the raw response in the thrown error when it
 * still doesn't parse or match the schema — callers need the raw text to
 * debug a misbehaving provider/prompt.
 */
export function parseJsonResponse<T>(raw: string, schema: ZodType<T>, stageName: string): T {
  const stripped = stripCodeFence(raw);

  let json: unknown;
  try {
    json = JSON.parse(stripped);
  } catch {
    throw new Error(`${stageName}: provider response was not valid JSON.\nRaw response:\n${raw}`);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new Error(
      `${stageName}: provider response did not match the expected shape: ${result.error.message}\nRaw response:\n${raw}`
    );
  }

  return result.data;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1] : trimmed;
}
