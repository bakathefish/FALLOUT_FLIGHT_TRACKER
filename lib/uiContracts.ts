import type { ParticipantState, AirportPoint } from "./apiState";
import type { Destination } from "./config";

// shared prop contracts so the components (built independently) and the
// FalloutApp orchestrator that wires them agree exactly.

export type AirportsMap = Record<Destination, AirportPoint>;

export interface MapHeroProps {
  participants: ParticipantState[];
  airports: AirportsMap;
  /** id of the participant to focus, e.g. after a board row click. */
  selectedId: string | null;
  onSelectParticipant: (id: string | null) => void;
}

export interface ArrivalsBoardProps {
  participants: ParticipantState[];
  /** find-flight search text; matching rows are highlighted. */
  query: string;
  selectedId: string | null;
  /** ids this browser holds an edit token for (show the edit affordance). */
  ownedIds: string[];
  onSelectParticipant: (id: string) => void;
  onEditParticipant: (id: string) => void;
}

export interface CounterProps {
  participants: ParticipantState[];
}

export interface FindFlightProps {
  query: string;
  onQueryChange: (q: string) => void;
  participants: ParticipantState[];
  onSelectParticipant: (id: string) => void;
}

export interface HeaderProps {
  onAddFlight: () => void;
}

export interface AddFlightDialogProps {
  open: boolean;
  /** when set, the dialog edits this participant instead of creating. */
  editId: string | null;
  participants: ParticipantState[];
  onClose: () => void;
  /** called after a successful create / edit / delete so the app refetches. */
  onSaved: () => void;
}

export interface AttributionProps {
  attribution: string;
}
