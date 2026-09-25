// Settings → "AI provider": the provider picker, each provider's key/URL and
// model fields, and the model suggestions read from the provider's live
// list (debounced while typing, "Refresh models", the default pick and the
// "no longer offered" warning).
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { isModelOffered, modelCatalog, modelMissingText, orderModelChoices, pickDefaultModel } from '../shared/model-catalog.mjs';
import { LOCAL_PROVIDER_IDS, PROVIDER_LINKS } from '../shared/provider-setup.mjs';
import { PROVIDER_IDS } from '../shared/config-state.mjs';
import { buildModelChoices, isLatestRequest, normalizeProviderSettings, plural } from './settings-helpers.mjs';

const { PROVIDER_CONFIGS } = DiscourseCopilotConstants;
// Wait for a pause in typing before reading a provider's model list.
const MODEL_LIST_DEBOUNCE_MS = 700;

// Element IDs of each provider's inputs.
export const PROVIDER_FIELDS = Object.fromEntries(
  PROVIDER_IDS.map(provider => [
    provider,
    {
      credential: LOCAL_PROVIDER_IDS.has(provider) ? `${provider}Url` : `${provider}ApiKey`,
      credentialField: LOCAL_PROVIDER_IDS.has(provider) ? 'url' : 'apiKey',
      model: `${provider}Model`,
      modelList: `${provider}ModelList`,
      modelStatus: `${provider}ModelStatus`,
      modelWarning: `${provider}ModelWarning`
    }
  ])
);

// Input ID → which draft field it edits.
export const INPUT_FIELDS = new Map(
  PROVIDER_IDS.flatMap(provider => {
    const fields = PROVIDER_FIELDS[provider];
    return [
      [fields.credential, { provider, field: fields.credentialField }],
      [fields.model, { provider, field: 'model' }]
    ];
  })
);

const $ = id => document.getElementById(id);

export class ProviderSection {
  /**
   * @param {object} deps
   * @param {object} deps.store ConfigStore
   * @param {() => boolean} deps.isBusy the form is testing/saving/resetting
   * @param {() => void} deps.onModelChanged the current provider's model field changed
   */
  constructor({ store, isBusy, onModelChanged }) {
    this.store = store;
    this.isBusy = isBusy;
    this.onModelChanged = onModelChanged;
    this.modelRequestIds = {};
    this.loadingModelProviders = new Set();
    // The last model list each provider returned (for the "no longer
    // offered" warning), and the model fields the user has edited.
    this.modelLists = {};
    this.touchedModelFields = new Set();
    this.modelListTimers = {};
  }

  // The provider whose section is shown (the draft's provider).
  get current() {
    return this.store.draft.provider;
  }

  renderLinks() {
    document.querySelectorAll('[data-provider-link]').forEach(anchor => {
      const link = PROVIDER_LINKS[anchor.dataset.providerLink];
      if (!link) return;
      anchor.href = link.url;
      anchor.textContent = link.label;
      anchor.rel = 'noopener noreferrer';
    });
  }

  populate() {
    for (const provider of PROVIDER_IDS) {
      const fields = PROVIDER_FIELDS[provider];
      const settings = this.store.draftSettings(provider);
      const credential = $(fields.credential);
      const model = $(fields.model);
      if (credential) credential.value = settings[fields.credentialField] || '';
      if (model) model.value = settings.model || '';
    }
  }

  render() {
    $('providerSelect').value = this.current;
    document.querySelectorAll('.provider-config').forEach(section => {
      section.classList.toggle('hidden', section.id !== `config-${this.current}`);
    });
  }

  mountRefreshButtons() {
    document.querySelectorAll('.btn-refresh').forEach(button => {
      button.addEventListener('click', () => {
        void this.refreshModels(button.dataset.provider);
      });
    });
  }

  // A provider input was edited (called from the page's input listener).
  handleInput(field, target) {
    this.store.updateField(target.provider, target.field, field.value);
    if (target.field === 'model') {
      this.touchedModelFields.add(target.provider);
      this.renderModelWarning(target.provider);
    } else {
      // A new key or server URL: read that provider's model list once
      // typing pauses (and at once when the field loses focus).
      this.scheduleModelList(target.provider);
    }
  }

  scheduleModelList(provider, delay = MODEL_LIST_DEBOUNCE_MS) {
    clearTimeout(this.modelListTimers[provider]);
    this.modelListTimers[provider] = setTimeout(() => {
      if (provider === this.current) void this.loadModels(provider);
    }, delay);
  }

  markInvalidFields(validation) {
    const fields = PROVIDER_FIELDS[this.current];
    const credential = $(fields.credential);
    const model = $(fields.model);
    credential?.removeAttribute('aria-invalid');
    model?.removeAttribute('aria-invalid');
    if (validation.fieldErrors.apiKey || validation.fieldErrors.url) {
      credential?.setAttribute('aria-invalid', 'true');
    }
    if (validation.fieldErrors.model) {
      model?.setAttribute('aria-invalid', 'true');
    }
  }

  // After "Reset all settings": forget every list and edit.
  resetModels() {
    modelCatalog.clear();
    this.modelLists = {};
    this.touchedModelFields.clear();
  }

  async loadModels(provider, { force = false } = {}) {
    const fields = PROVIDER_FIELDS[provider];
    const input = $(fields.model);
    const list = $(fields.modelList);
    const modelStatus = $(fields.modelStatus);
    if (!input || !list || !modelStatus) return;

    const requestId = (this.modelRequestIds[provider] || 0) + 1;
    this.modelRequestIds[provider] = requestId;
    const settings = normalizeProviderSettings(provider, { ...this.store.draftSettings(provider) });
    const providerConfig = PROVIDER_CONFIGS[provider];
    // Curated models stay offered even before (or without) a live model list.
    const curated = (providerConfig.recommendedModels || providerConfig.suggestedModels || []).map(id => ({ id, name: 'Recommended' }));
    delete this.modelLists[provider];
    this.renderModelWarning(provider);

    if (providerConfig.requiresApiKey && !settings.apiKey) {
      this.populateModelChoices(list, curated, input.value);
      modelStatus.textContent = 'Enter an API key to load the models it can use.';
      this.setModelLoading(provider, false);
      return;
    }

    this.setModelLoading(provider, true);
    modelStatus.textContent = `Loading ${providerConfig.name} models…`;

    try {
      const { models } = await modelCatalog.list(provider, settings, { force });
      if (!isLatestRequest(this.modelRequestIds, provider, requestId)) return;

      this.modelLists[provider] = models;
      // A provider whose model was never saved gets the best available
      // default, unless the user already picked one. Saved models are
      // never replaced.
      if (models.length && this.canPreselectModel(provider)) {
        const pick = pickDefaultModel(provider, models);
        if (pick && pick !== input.value) {
          input.value = pick;
          this.store.updateField(provider, 'model', pick);
          if (provider === this.current) this.onModelChanged();
        }
      }
      const choices = models.length ? orderModelChoices(provider, models) : curated;
      this.populateModelChoices(list, choices, input.value);
      const listsRecommended = choices.some(choice => choice.recommended);
      modelStatus.textContent = models.length
        ? `${plural(models.length, 'model')} available from ${providerConfig.name}${listsRecommended ? '; recommended (fast, low-cost) ones are listed first' : ''}. You can also enter any model ID.`
        : `${providerConfig.name} returned no models. You can enter a model ID yourself.`;
      this.renderModelWarning(provider);
    } catch (error) {
      if (!isLatestRequest(this.modelRequestIds, provider, requestId)) return;

      this.populateModelChoices(list, curated, input.value);
      modelStatus.textContent = `Couldn’t load the model list: ${error.message} You can keep or enter a model ID; Test Connection checks it.`;
    } finally {
      if (isLatestRequest(this.modelRequestIds, provider, requestId)) {
        this.setModelLoading(provider, false);
      }
    }
  }

  // Only a provider without a saved model whose field the user hasn't edited.
  canPreselectModel(provider) {
    return !this.store.config.savedModels?.[provider] && !this.touchedModelFields.has(provider);
  }

  // "No longer offered": the saved model, still in the field, is missing from
  // the list the provider just returned. Nothing is said without a list.
  renderModelWarning(provider) {
    const fields = PROVIDER_FIELDS[provider];
    const warning = fields && $(fields.modelWarning);
    if (!warning) return;
    const models = this.modelLists[provider];
    const saved = this.store.config.savedModels?.[provider] ? this.store.config.providers[provider]?.model || '' : '';
    const shown = $(fields.model)?.value.trim() || '';
    const missing = Boolean(models?.length && saved && shown === saved && !isModelOffered(provider, saved, models));
    warning.textContent = missing ? modelMissingText(provider) : '';
    warning.hidden = !missing;
  }

  populateModelChoices(list, models, selectedModel) {
    const choices = buildModelChoices(models, selectedModel);
    list.replaceChildren(
      ...choices.map(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.label = model.name || model.id;
        return option;
      })
    );
  }

  async refreshModels(provider) {
    if (!provider || this.isBusy()) return;
    await this.loadModels(provider, { force: true });
  }

  // Re-applies every provider's loading state (after the form's busy state changed).
  renderLoading() {
    for (const provider of PROVIDER_IDS) {
      this.setModelLoading(provider, this.loadingModelProviders.has(provider));
    }
  }

  setModelLoading(provider, loading) {
    if (loading) {
      this.loadingModelProviders.add(provider);
    } else {
      this.loadingModelProviders.delete(provider);
    }
    const button = document.querySelector(`.btn-refresh[data-provider="${provider}"]`);
    if (!button) return;
    button.disabled = this.loadingModelProviders.has(provider) || this.isBusy();
    button.textContent = loading ? 'Loading…' : 'Refresh models';
  }
}
