import { sql } from "drizzle-orm";
import {
  check,
  date,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// the one table. mirrors SPEC section 6 exactly. camelCase fields map to
// snake_case columns. destination is a free text column guarded by a check so
// the database rejects anything that isn't HKG or SZX, even if a caller skips
// the zod layer.
export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    flightNumber: text("flight_number").notNull(),
    callsignOverride: text("callsign_override"),
    originIata: text("origin_iata"),
    originCity: text("origin_city"),
    destination: text("destination").notNull(),
    // mode defaults to string, so this round-trips as 'YYYY-MM-DD'.
    arrivalDate: date("arrival_date"),
    slackHandle: text("slack_handle"),
    // set whenever we observe the flight airborne. powers landed detection.
    lastSeenAirborneAt: timestamp("last_seen_airborne_at", {
      withTimezone: true,
    }),
    // returned to the creator so they can edit their own row later.
    editToken: uuid("edit_token").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "participants_destination_check",
      sql`${t.destination} in ('HKG','SZX')`,
    ),
  ],
);

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
