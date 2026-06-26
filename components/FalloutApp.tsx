"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { StateResponse } from "@/lib/apiState";
import { useFalloutState } from "@/lib/useFalloutState";
import { getEditTokens } from "@/lib/clientStore";
import Header from "@/components/Header";
import Counter from "@/components/Counter";
import FindFlight from "@/components/FindFlight";
import ArrivalsBoard from "@/components/Board/ArrivalsBoard";
import Attribution from "@/components/Attribution";
import AddFlightDialog from "@/components/AddFlightDialog";

// the map touches window/maplibre, so load it client-only.
const MapHero = dynamic(() => import("@/components/Map/MapHero"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-panel-2 text-sm text-muted">
      booting the radar...
    </div>
  ),
});

interface DialogState {
  open: boolean;
  editId: string | null;
}

export default function FalloutApp({
  initialState,
}: {
  initialState: StateResponse;
}) {
  const { data, error, refetch } = useFalloutState(initialState);
  const state = data ?? initialState;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    editId: null,
  });
  const [ownedIds, setOwnedIds] = useState<string[]>([]);

  // which rows this browser can edit (its edit tokens). recompute as the
  // roster changes (e.g. right after a create).
  useEffect(() => {
    const tokens = getEditTokens();
    setOwnedIds(
      state.participants.map((p) => p.id).filter((id) => id in tokens),
    );
  }, [state.participants]);

  const closeDialog = () => setDialog({ open: false, editId: null });
  const onSaved = () => {
    closeDialog();
    refetch();
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-bg text-text">
      <Header onAddFlight={() => setDialog({ open: true, editId: null })} />

      {error ? (
        <p
          role="status"
          className="border-y border-coral/40 bg-coral/10 px-4 py-1.5 text-center text-xs text-coral"
        >
          {error}
        </p>
      ) : null}

      <main className="grid min-h-0 flex-1 grid-rows-[55%_45%] lg:grid-cols-[1fr_400px] lg:grid-rows-1">
        <section
          className="relative min-h-0 border-line max-lg:border-b lg:border-r"
          aria-label="live flight map"
        >
          <MapHero
            participants={state.participants}
            airports={state.airports}
            selectedId={selectedId}
            onSelectParticipant={setSelectedId}
          />
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          <Counter participants={state.participants} />
          <FindFlight
            query={query}
            onQueryChange={setQuery}
            participants={state.participants}
            onSelectParticipant={setSelectedId}
          />
          <ArrivalsBoard
            participants={state.participants}
            query={query}
            selectedId={selectedId}
            ownedIds={ownedIds}
            onSelectParticipant={setSelectedId}
            onEditParticipant={(id) => setDialog({ open: true, editId: id })}
          />
        </aside>
      </main>

      <Attribution attribution={state.attribution} />

      <AddFlightDialog
        open={dialog.open}
        editId={dialog.editId}
        participants={state.participants}
        onClose={closeDialog}
        onSaved={onSaved}
      />
    </div>
  );
}
