// Lifetime of the admin-sent account setup link, in one place so the
// email (server), the admin card (client), and the token signer agree.
// Kept apart from loginSetup.ts because that module imports node:crypto
// and the Resend client, which a client component must not pull in.

/** How long a setup link stays valid after the admin sends it. */
export const LOGIN_SETUP_LINK_TTL_MS = 48 * 60 * 60 * 1000;
/** The same span as the email and the admin card say it. */
export const LOGIN_SETUP_LINK_TTL_LABEL = '48 hours';
