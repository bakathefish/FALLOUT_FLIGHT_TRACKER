import { getState } from "@/lib/getState";
import FalloutApp from "@/components/FalloutApp";

// render fresh server state for an instant first paint; the client then polls
// /api/state on its own. force-dynamic so this is never statically cached.
export const dynamic = "force-dynamic";

export default async function Home() {
  const initialState = await getState();
  return <FalloutApp initialState={initialState} />;
}
