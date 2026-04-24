/**
 * Secret resolver contract consumed by `POST /v1/fix`.
 *
 * The fix-request body carries `keyId` (LLM) and `tokenId` (git) references
 * into the BYOK key store being built in parallel under #48 (P4). This route
 * does NOT implement key storage — it depends on an opaque resolver whose
 * production implementation arrives in the #48 PR.
 *
 * Security contract (parent invariants from #44):
 *   - Resolvers MUST NOT log the secrets they return.
 *   - Resolvers MUST return `null` on any lookup miss (unknown ID, wrong
 *     project, expired key, decryption failure). The route converts any
 *     `null` into a generic 403/error event — never identifying which ID
 *     was bad (to avoid leaking which IDs exist).
 *   - Callers (i.e. the route) MUST NOT echo the returned secret in
 *     response bodies, traces, logs, or error messages.
 */
export interface SecretResolver {
  resolveLlmKey(projectId: string, keyId: string): Promise<string | null>;
  resolveGitToken(projectId: string, tokenId: string): Promise<string | null>;
}

/**
 * Env-backed stub resolver for dev/test only. Reads keys from:
 *   - `PATHLIGHT_TEST_LLM_KEY_<keyId>`
 *   - `PATHLIGHT_TEST_GIT_TOKEN_<tokenId>`
 *
 * Returns `null` when the env var is missing or empty. Never reads any
 * hardcoded key material. Not intended for production — the production
 * resolver is `createKeyStoreSecretResolver` from `@pathlight/keys`,
 * wired in `router.ts` whenever a `KeyStore` is configured (i.e.
 * `PATHLIGHT_SEAL_KEY` is set). This stub remains for tests and for
 * deployments that want to drive the engine without standing up BYOK.
 */
export function createEnvSecretResolver(): SecretResolver {
  return {
    async resolveLlmKey(_projectId: string, keyId: string): Promise<string | null> {
      const envName = `PATHLIGHT_TEST_LLM_KEY_${sanitizeIdForEnv(keyId)}`;
      const value = process.env[envName];
      return value && value.length > 0 ? value : null;
    },
    async resolveGitToken(_projectId: string, tokenId: string): Promise<string | null> {
      const envName = `PATHLIGHT_TEST_GIT_TOKEN_${sanitizeIdForEnv(tokenId)}`;
      const value = process.env[envName];
      return value && value.length > 0 ? value : null;
    },
  };
}

/**
 * Constrain an externally-supplied ID to a safe env-var suffix. Anything
 * outside `[A-Za-z0-9_]` is dropped. Prevents a caller from smuggling
 * characters that would let them read unrelated env vars.
 */
function sanitizeIdForEnv(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "");
}
