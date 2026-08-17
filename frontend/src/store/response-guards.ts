import { z, type ZodType } from "zod";

/**
 * Runtime checks on what the server actually sent.
 *
 * <p>
 * RTK Query response types are assertions, not verifications — nothing compares
 * them to the bytes on the wire. So a field declared {@code string} that arrives
 * {@code null} type-checks perfectly and then throws somewhere downstream, as
 * "cannot read properties of null", far from the seam that caused it. The
 * nullability audit found three such lies by comparing the TS types to the
 * database columns; this catches the ones a static comparison cannot see.
 *
 * <p>
 * <b>Dev-only, and warns rather than throws.</b> The goal is to fail loudly
 * where a developer will see it, not to break a screen for a user over a field
 * nobody reads. Production pays nothing: the check is behind {@code __DEV__} and
 * the schemas are only walked when one is registered for that endpoint.
 *
 * <p>
 * Coverage is deliberately partial and grows by need. Registering all ~118
 * response types would duplicate every type as a schema and rot the moment one
 * changed. The session boundary is here first because it is where a mismatch
 * hurts most — a bad token payload logs someone out or crashes the first render
 * after sign-in, which is exactly the failure that prompted this.
 */

const authUserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  // NOT NULL in auth.users, so a null here is a genuine server-side bug and
  // should be reported, not tolerated.
  fullName: z.string(),
  profilePhotoUrl: z.string().nullable().optional(),
  role: z.enum(["USER", "OWNER", "TENANT"]),
  activeTenant: z.boolean(),
  active: z.boolean(),
  phoneVerified: z.boolean(),
  profileCompleted: z.boolean(),
});

const tokenResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.string(),
  user: authUserSchema,
});

/** Endpoint name (as given to RTK Query) → schema for its success payload. */
const RESPONSE_SCHEMAS: Record<string, ZodType> = {
  confirmEmailLogin: tokenResponseSchema,
  confirmPinReset: tokenResponseSchema,
  loginWithPin: tokenResponseSchema,
  setPin: tokenResponseSchema,
};

/**
 * Warns when a response does not match its declared shape. No-op in production
 * and for endpoints with no registered schema.
 */
export function checkResponseShape(endpoint: string, data: unknown) {
  if (!__DEV__) {
    return;
  }

  const schema = RESPONSE_SCHEMAS[endpoint];
  if (!schema) {
    return;
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      `[api] "${endpoint}" returned a shape the client does not expect. ` +
        "The TypeScript type and the server disagree — fix the type or the DTO, " +
        "do not just guard the crash downstream.",
      result.error.issues,
    );
  }
}
