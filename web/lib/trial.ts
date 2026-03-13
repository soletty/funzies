import { decryptApiKey } from "./crypto";
import { query } from "./db";

const FREE_TRIAL_INTERACTION_LIMIT = 5;

interface ApiKeyResult {
  apiKey: string;
  isTrial: boolean;
}

export async function getApiKeyForUser(userId: string): Promise<ApiKeyResult> {
  const rows = await query<{
    encrypted_api_key: Buffer | null;
    api_key_iv: Buffer | null;
    free_trial_used: boolean;
  }>(
    "SELECT encrypted_api_key, api_key_iv, free_trial_used FROM users WHERE id = $1",
    [userId]
  );

  if (!rows.length) {
    throw new Error("User not found");
  }

  const user = rows[0];

  // BYOK path — user has their own key
  if (user.encrypted_api_key && user.api_key_iv) {
    return {
      apiKey: decryptApiKey(user.encrypted_api_key, user.api_key_iv),
      isTrial: false,
    };
  }

  // Trial path — check if user has an active trial assembly (queued/running/complete)
  // This is needed because free_trial_used is set to true at creation time,
  // but the worker and interaction routes still need the platform key.
  const activeTrial = await query<{ id: string }>(
    `SELECT id FROM assemblies
     WHERE user_id = $1 AND is_free_trial = true AND status IN ('queued', 'running', 'complete')
     LIMIT 1`,
    [userId]
  );

  if (activeTrial.length > 0) {
    const platformKey = process.env.PLATFORM_API_KEY;
    if (!platformKey) {
      throw new Error("Free trial unavailable — please add your API key");
    }
    return { apiKey: platformKey, isTrial: true };
  }

  // No BYOK key and no active trial — check if trial is available
  if (!user.free_trial_used) {
    const platformKey = process.env.PLATFORM_API_KEY;
    if (!platformKey) {
      throw new Error("Free trial unavailable — please add your API key");
    }
    return { apiKey: platformKey, isTrial: true };
  }

  throw new Error("Free trial exhausted — add your API key to continue");
}

export async function claimFreeTrial(userId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    "UPDATE users SET free_trial_used = true WHERE id = $1 AND free_trial_used = false RETURNING id",
    [userId]
  );
  return result.length > 0;
}

export async function resetFreeTrial(userId: string): Promise<void> {
  await query(
    "UPDATE users SET free_trial_used = false WHERE id = $1",
    [userId]
  );
}

export async function claimTrialInteraction(assemblyId: string): Promise<{ remaining: number } | null> {
  const result = await query<{ trial_interactions_used: number }>(
    `UPDATE assemblies SET trial_interactions_used = trial_interactions_used + 1
     WHERE id = $1 AND is_free_trial = true AND trial_interactions_used < $2
     RETURNING trial_interactions_used`,
    [assemblyId, FREE_TRIAL_INTERACTION_LIMIT]
  );

  if (!result.length) return null;

  return { remaining: FREE_TRIAL_INTERACTION_LIMIT - result[0].trial_interactions_used };
}

export { FREE_TRIAL_INTERACTION_LIMIT };
