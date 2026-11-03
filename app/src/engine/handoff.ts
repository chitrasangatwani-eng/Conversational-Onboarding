import { ApiError, BACKEND, post } from "./api";

// Creates a handoff ticket for a person on the support team. In "local" mode
// (static demo) nothing is sent and the queue numbers are the design's examples.

export type HandoffResult =
  | { ok: true; ticketId: string; position: number; waitMinutes: number }
  | { ok: false; reason: "sensitive" | "unavailable" };

export async function createHandoff(input: {
  kind: "chat" | "callback"; share: boolean; summary: string[]; goal: string; language: string; mobileToken: string;
}): Promise<HandoffResult> {
  if (BACKEND === "local") return { ok: true, ticketId: "", position: 3, waitMinutes: 8 };
  try {
    const r = await post<{ ticketId: string; position: number; waitMinutes: number }>("/api/handoff", {
      kind: input.kind, share: input.share, language: input.language,
      summary: input.share ? input.summary : [], goal: input.share ? input.goal : "",
      mobileToken: input.mobileToken || undefined,
    });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, reason: e instanceof ApiError && e.body.error === "sensitive" ? "sensitive" : "unavailable" };
  }
}
