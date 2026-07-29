import 'server-only';

import { cache } from 'react';
import {
  FEATURE_FLAG_KEYS,
  featureDisabledResult,
  featureFlagSettingKey,
  resolveFeatureFlags,
  type FeatureFlagKey,
  type FeatureFlags,
} from '@/lib/features';
import { settingsRepository } from '@/lib/repositories/settings';
import type { LogContext } from '@/lib/observability';

const FEATURE_FLAG_SETTING_KEYS = FEATURE_FLAG_KEYS.map(featureFlagSettingKey);

export const loadFeatureFlags = cache(async (ctx: LogContext): Promise<FeatureFlags> => {
  const settings = await settingsRepository.findByKeys(FEATURE_FLAG_SETTING_KEYS, ctx);
  return resolveFeatureFlags(settings);
});

export async function requireFeatureEnabled(
  ctx: LogContext,
  key: FeatureFlagKey,
) {
  const flags = await loadFeatureFlags(ctx);
  if (!flags[key]) return featureDisabledResult();
  return null;
}

export async function requireFeatureFlag(
  flags: FeatureFlags,
  key: FeatureFlagKey,
) {
  return flags[key] === true;
}
