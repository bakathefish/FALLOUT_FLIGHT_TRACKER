import { NextResponse } from "next/server";
import { getState } from "@/lib/getState";
import {
  STATE_EDGE_MAXAGE_S,
  STATE_STALE_WHILE_REVALIDATE_S,
} from "@/lib/config";

// the one endpoint that powers the map, board, and counter (SPEC section 6).
// we set our own cache-control so vercel's edge serves most viewer polls; on a
// miss this runs, refreshes the feed, and stamps last_seen.
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": `public, s-maxage=${STATE_EDGE_MAXAGE_S}, stale-while-revalidate=${STATE_STALE_WHILE_REVALIDATE_S}`,
    },
  });
}
