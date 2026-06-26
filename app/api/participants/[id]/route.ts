import { NextResponse } from "next/server";
import { editBodySchema, deleteBodySchema, idParamSchema } from "@/lib/schema";
import {
  getParticipant,
  updateParticipant,
  deleteParticipant,
} from "@/lib/db/repo";
import { jsonError, zodError, isAuthorized, writeRateLimit } from "@/lib/http";

export const dynamic = "force-dynamic";

// in next 15 route params arrive as a promise.
type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/participants/:id - edit. auth: edit token or admin passcode.
export async function PATCH(req: Request, { params }: RouteContext) {
  const limited = writeRateLimit(req);
  if (limited) return limited;

  const { id } = await params;
  if (!idParamSchema.safeParse(id).success) {
    return jsonError("no flight with that id", 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("send a json body", 400);
  }

  const parsed = editBodySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const { editToken, passcode, ...fields } = parsed.data;

  const row = await getParticipant(id);
  if (!row) return jsonError("no flight with that id", 404);
  if (!isAuthorized(row.editToken, editToken, passcode)) {
    return jsonError("that entry is not yours to edit", 403);
  }

  await updateParticipant(id, fields);
  return NextResponse.json({ ok: true });
}

// DELETE /api/participants/:id - remove. same auth as edit.
export async function DELETE(req: Request, { params }: RouteContext) {
  const limited = writeRateLimit(req);
  if (limited) return limited;

  const { id } = await params;
  if (!idParamSchema.safeParse(id).success) {
    return jsonError("no flight with that id", 404);
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine; it just will not carry auth, handled below.
  }

  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const row = await getParticipant(id);
  if (!row) return jsonError("no flight with that id", 404);
  if (
    !isAuthorized(row.editToken, parsed.data.editToken, parsed.data.passcode)
  ) {
    return jsonError("that entry is not yours to remove", 403);
  }

  await deleteParticipant(id);
  return NextResponse.json({ ok: true });
}
