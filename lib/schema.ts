import { z } from "zod";
import { DESTINATIONS, type Destination } from "./config";
import { normalizeFlightNumber } from "./callsign";

// zod schemas shared by client and server. every write boundary validates here.
// see SPEC section 6.

/** treat empty / whitespace-only strings as "not provided". */
const emptyToUndef = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

/**
 * an optional field where "" or whitespace counts as omitted. the .optional()
 * lives inside the preprocess so a blanked field resolves to undefined instead
 * of running the inner validator on undefined.
 */
const blankable = <T extends z.ZodTypeAny>(
  schema: T,
): z.ZodEffects<z.ZodOptional<T>, z.infer<T> | undefined, unknown> =>
  z.preprocess(emptyToUndef, schema.optional());

export const flightNumberSchema = z
  .string()
  .trim()
  .min(1, "add your flight number")
  .transform(normalizeFlightNumber)
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9]{2,8}$/,
        "flight number looks off, try something like CX216",
      ),
  );

const destinationSchema = z.enum([...DESTINATIONS] as [
  Destination,
  ...Destination[],
]);

/** the editable flight fields. required ones are required only on create. */
export const participantInputSchema = z.object({
  name: z.string().trim().min(1, "add your name").max(60, "name is too long"),
  flightNumber: flightNumberSchema,
  destination: destinationSchema,
  callsignOverride: blankable(
    z
      .string()
      .trim()
      .toUpperCase()
      .pipe(
        z.string().regex(/^[A-Z0-9]{2,10}$/, "callsign override looks off"),
      ),
  ),
  originIata: blankable(
    z
      .string()
      .trim()
      .toUpperCase()
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{3}$/, "origin code should be 3 letters like DEL"),
      ),
  ),
  originCity: blankable(z.string().trim().max(80, "origin city is too long")),
  arrivalDate: blankable(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "use a date like 2026-07-01")
      .refine(
        (s) => !Number.isNaN(Date.parse(s)),
        "that date does not look real",
      ),
  ),
  slackHandle: blankable(z.string().trim().max(40, "slack handle is too long")),
});

export type ParticipantInput = z.infer<typeof participantInputSchema>;

/** the :id route param. db ids are uuids, so reject anything else early. */
export const idParamSchema = z.string().uuid();

/** POST /api/participants body. */
export const createBodySchema = participantInputSchema.extend({
  passcode: z.string().min(1, "passcode required"),
});
export type CreateBody = z.infer<typeof createBodySchema>;

/** auth half of edit/delete: an edit token or the admin passcode. */
const authShape = {
  editToken: z.string().uuid("bad edit token").optional(),
  passcode: z.string().min(1).optional(),
};

/** PATCH /api/participants/:id body: any subset of fields + auth. */
export const editBodySchema = participantInputSchema
  .partial()
  .extend(authShape)
  .refine((d) => Boolean(d.editToken || d.passcode), {
    message: "need an edit token or the admin passcode",
  });
export type EditBody = z.infer<typeof editBodySchema>;

/** DELETE /api/participants/:id body: auth only. */
export const deleteBodySchema = z
  .object(authShape)
  .refine((d) => Boolean(d.editToken || d.passcode), {
    message: "need an edit token or the admin passcode",
  });
export type DeleteBody = z.infer<typeof deleteBodySchema>;
