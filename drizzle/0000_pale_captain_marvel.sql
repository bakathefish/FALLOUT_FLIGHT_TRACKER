CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"flight_number" text NOT NULL,
	"callsign_override" text,
	"origin_iata" text,
	"origin_city" text,
	"destination" text NOT NULL,
	"arrival_date" date,
	"slack_handle" text,
	"last_seen_airborne_at" timestamp with time zone,
	"edit_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_destination_check" CHECK ("participants"."destination" in ('HKG','SZX'))
);
