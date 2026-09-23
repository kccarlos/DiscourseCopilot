// Validation lives in the shared provider-setup module so the side panel's
// setup card and the settings page agree on what a usable configuration is.
export {
  LOCAL_PROVIDER_IDS,
  normalizeProviderSettings,
  validateProviderSettings
} from '../shared/provider-setup.mjs';

export function buildModelChoices(models = [], selectedModel = '') {
  const choices = [];
  const seen = new Set();
  const selected = typeof selectedModel === 'string' ? selectedModel.trim() : '';

  if (selected) {
    choices.push({ id: selected, name: `${selected} (saved/custom)` });
    seen.add(selected);
  }

  for (const model of Array.isArray(models) ? models : []) {
    const id = typeof model?.id === 'string' ? model.id.trim() : '';
    if (!id || seen.has(id)) continue;

    choices.push({
      ...model,
      id,
      name: (typeof model.name === 'string' && model.name.trim()) || id
    });
    seen.add(id);
  }

  return choices;
}

export function isLatestRequest(requestIds, provider, requestId) {
  return requestIds[provider] === requestId;
}
