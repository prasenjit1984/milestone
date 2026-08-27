// Kept well under Vercel Functions' hard 4.5MB request-body ceiling — leaves
// headroom for multipart/form-data framing overhead (see next.config.ts's
// matching serverActions.bodySizeLimit). Shared between the client-side
// pre-check (pdf-import-panel.tsx) and the authoritative server-side check
// (source-content.ts) so both enforce the same number.
//
// This lives in its own module (not exported from source-content.ts)
// because a "use server" file may only export async functions — a plain
// constant export there fails the build.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
