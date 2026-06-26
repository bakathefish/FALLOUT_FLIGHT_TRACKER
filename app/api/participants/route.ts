import { NextResponse } from "next/server";
import { createBodySchema } from "@/lib/schema";
import { createParticipant } from "@/lib/db/repo";
import {
  jsonError,
  zodError,
  constantTimeEqual,
  writeRateLimit,
} from "@/lib/http";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

// POST /api/participants - create an entry. gated by the shared write passcode.
export async function POST(req: Request) {
  const limited = writeRateLimit(req);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("send a json body", 400);
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { passcode, ...input } = parsed.data;
  if (!constantTimeEqual(passcode, getServerEnv().WRITE_PASSCODE)) {
    return jsonError(
      "that passcode is wrong. grab it from the cohort chat.",
      403,
    );
  }

  const row = await createParticipant(input);
  // the browser stores editToken so this person can edit or remove their row.
  return NextResponse.json(
    { id: row.id, editToken: row.editToken },
    { status: 201 },
  );
}
