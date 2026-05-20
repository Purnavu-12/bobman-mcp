export type BobmanErrorCode =
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export class BobmanError extends Error {
  readonly code: BobmanErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: BobmanErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "BobmanError";
    this.code = code;
    this.details = details;
  }
}

export function toToolErrorResponse(err: unknown): {
  isError: true;
  content: { type: "text"; text: string }[];
} {
  if (err instanceof BobmanError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            code: err.code,
            message: err.message,
            details: err.details ?? null,
          }),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          code: "INTERNAL",
          message,
          details: null,
        }),
      },
    ],
  };
}

export function toolSuccess(data: unknown): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}
