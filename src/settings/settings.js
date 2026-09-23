// Options page. Configuration state (persisted values, the draft being
// edited, test/save/reset) lives in the shared ConfigStore; the form's own
// lifecycle (pristine/dirty/testing/saving/…) is the reducer in
// settings-form-state.mjs. This file wires DOM events to those two and
// renders their state.
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { DiscourseCopilotModels } from '../shared/model-service.js';
import {
  MAX_FAVORITE_MODELS,
  addFavoriteModel,
  favoriteModelKey,
  hasFavoriteModel,
  removeFavoriteModel
} from '../shared/favorite-models.mjs';
import {
  buildModelChoices,
  isLatestRequest,
  normalizeProviderSettings
} from './settings-helpers.mjs';
import {
  LOCAL_PROVIDER_IDS,
  PROVIDER_LINKS,
  describeSavedConfiguration
} from '../shared/provider-setup.mjs';
import { RESPONSE_LANGUAGES } from '../shared/response-language.mjs';
import { ConfigStore, PROVIDER_IDS } from '../shared/config-state.mjs';
import {
  dirtyIndicatorText,
  initialFormState,
  isFormBusy,
  transitionForm
} from './settings-form-state.mjs';

const { PROVIDER_CONFIGS } = DiscourseCopilotConstants;
const STATUS_AUTO_HIDE_MS = 5000;

// Element IDs of each provider's inputs.
const PROVIDER_FIELDS = Object.fromEntries(PROVIDER_IDS.map(provider => [
  provider,
  {
    credential: LOCAL_PROVIDER_IDS.has(provider) ? `${provider}Url` : `${provider}ApiKey`,
    credentialField: LOCAL_PROVIDER_IDS.has(provider) ? 'url' : 'apiKey',
    model: `${provider}Model`,
    modelList: `${provider}ModelList`,
    modelStatus: `${provider}ModelStatus`
  }
]));

// Input ID → which draft field it edits.
const INPUT_FIELDS = new Map(PROVIDER_IDS.flatMap(provider => {
  const fields = PROVIDER_FIELDS[provider];
  return [
    [fields.credential, { provider, field: fields.credentialField }],
    [fields.model, { provider, field: 'model' }]
  ];
}));

const $ = id => document.getElementById(id);

class DiscourseCopilotSettings {
  constructor() {
    this.store = new ConfigStore();
    this.form = initialFormState();
    this.renderedStatus = undefined;
    this.renderedBusy = undefined;
    this.hasSavedConfiguration = false;
    this.modelRequestIds = {};
    this.loadingModelProviders = new Set();
    this.statusTimer = null;
    this.welcomeMode = new URLSearchParams(location.search).get('welcome') === '1';
  }

  // The provider whose section is shown (the draft's provider).
  get currentProvider() {
    return this.store.draft.provider;
  }

  get isBusy() {
    return isFormBusy(this.form);
  }

  async init() {
    this.renderWelcome();
    this.renderProviderLinks();
    this.renderForm();

    let loadError = null;
    try {
      await this.store.load();
    } catch (error) {
      console.error('DiscourseCopilot Settings: Failed to initialize:', error);
      loadError = error;
    }
    this.store.selectProvider(this.store.config.provider);
    this.populateAllFields();
    this.setupEventListeners();
    this.renderProvider();
    this.renderFavoriteModels();
    this.renderSavedConfiguration();
    this.dispatch(loadError
      ? { type: 'load-failed', message: loadError.message }
      : { type: 'loaded', welcomeMode: this.welcomeMode });

    // Follow changes made elsewhere (e.g. the side panel's model switcher).
    this.store.subscribe(event => {
      if (event.type === 'loaded') {
        this.renderSavedConfiguration();
        this.renderFavoriteModels();
      }
    });

    // Model discovery should never block editing the settings form.
    void this.loadModelsForProvider(this.currentProvider);
  }

  // ---------- Form state ----------

  dispatch(event) {
    this.form = transitionForm(this.form, event);
    this.renderForm();
  }

  renderForm() {
    const busy = this.isBusy;
    if (busy !== this.renderedBusy) {
      this.renderedBusy = busy;
      this.renderBusy(busy);
    }
    // Only a new status restarts the auto-hide timer.
    if (this.form.status !== this.renderedStatus) {
      this.renderedStatus = this.form.status;
      this.renderStatus(this.form.status);
    }
    this.renderDirtyState();
  }

  renderStatus(status) {
    clearTimeout(this.statusTimer);
    const element = $('status');
    if (!status) {
      element.textContent = '';
      element.className = 'status hidden';
      return;
    }
    element.textContent = status.message;
    element.className = `status ${status.type}`;
    if (status.autoHide) {
      this.statusTimer = setTimeout(() => this.dispatch({ type: 'clear-status' }), STATUS_AUTO_HIDE_MS);
    }
  }

  renderDirtyState() {
    const indicator = $('dirtyIndicator');
    indicator.textContent = dirtyIndicatorText(this.form, this.hasSavedConfiguration);
    indicator.classList.toggle('hidden', !indicator.textContent);
    indicator.classList.toggle('dirty', this.form.edited);
  }

  renderBusy(busy) {
    document.querySelectorAll('button:not(.btn-refresh)').forEach(button => {
      button.disabled = busy;
    });
    for (const provider of PROVIDER_IDS) {
      this.setModelLoading(provider, this.loadingModelProviders.has(provider));
    }
    this.renderFavoriteModels();
    document.querySelector('.container')?.setAttribute('aria-busy', String(busy));
  }

  notify(message, statusType = 'info', autoHide) {
    this.dispatch({ type: 'notice', message, statusType, autoHide });
  }

  // ---------- Fields ----------

  renderResponseLanguageOptions() {
    const select = $('responseLanguage');
    select.replaceChildren(...RESPONSE_LANGUAGES.map(language => {
      const option = document.createElement('option');
      option.value = language.value;
      option.textContent = language.label;
      return option;
    }));
  }

  populateAllFields() {
    for (const provider of PROVIDER_IDS) {
      const fields = PROVIDER_FIELDS[provider];
      const settings = this.store.draftSettings(provider);
      const credential = $(fields.credential);
      const model = $(fields.model);
      if (credential) credential.value = settings[fields.credentialField] || '';
      if (model) model.value = settings.model || '';
    }

    $('systemPrompt').value = this.store.config.systemPrompt;
    const languageSelect = $('responseLanguage');
    if (languageSelect.options.length !== RESPONSE_LANGUAGES.length) {
      this.renderResponseLanguageOptions();
    }
    languageSelect.value = this.store.config.responseLanguage;
  }

  setupEventListeners() {
    $('providerSelect').addEventListener('change', event => {
      this.store.selectProvider(event.target.value);
      this.renderProvider();
      this.renderFavoriteModels();
      this.dispatch({ type: 'edited', clearStatus: true });
      void this.loadModelsForProvider(this.currentProvider);
    });

    $('responseLanguage').addEventListener('change', event => {
      this.store.updateDraft({ responseLanguage: event.target.value });
      this.dispatch({ type: 'edited', clearStatus: true });
    });

    $('saveBtn').addEventListener('click', () => {
      void this.saveSettings();
    });
    $('testBtn').addEventListener('click', () => {
      void this.testConnection();
    });
    $('resetBtn').addEventListener('click', () => {
      void this.resetSettings();
    });
    $('addFavoriteBtn').addEventListener('click', () => {
      void this.addCurrentFavorite();
    });

    document.querySelectorAll('.btn-refresh').forEach(button => {
      button.addEventListener('click', () => {
        void this.refreshModels(button.dataset.provider);
      });
    });

    document.querySelectorAll('input, textarea').forEach(field => {
      field.addEventListener('input', () => {
        field.removeAttribute('aria-invalid');
        const target = INPUT_FIELDS.get(field.id);
        if (target) {
          this.store.updateField(target.provider, target.field, field.value);
        } else if (field.id === 'systemPrompt') {
          this.store.updateDraft({ systemPrompt: field.value });
        }
        this.dispatch({ type: 'edited' });
        if (field.id === PROVIDER_FIELDS[this.currentProvider]?.model) {
          this.renderFavoriteModels();
        }
      });
    });
  }

  renderProvider() {
    $('providerSelect').value = this.currentProvider;
    document.querySelectorAll('.provider-config').forEach(section => {
      section.classList.toggle('hidden', section.id !== `config-${this.currentProvider}`);
    });
  }

  // First install opens this page with ?welcome=1.
  renderWelcome() {
    document.body.classList.toggle('welcome-mode', this.welcomeMode);
    $('welcomeHeader')?.classList.toggle('hidden', !this.welcomeMode);
  }

  renderProviderLinks() {
    document.querySelectorAll('[data-provider-link]').forEach(anchor => {
      const link = PROVIDER_LINKS[anchor.dataset.providerLink];
      if (!link) return;
      anchor.href = link.url;
      anchor.textContent = link.label;
      anchor.rel = 'noopener noreferrer';
    });
  }

  renderSavedConfiguration() {
    const { config } = this.store;
    const saved = describeSavedConfiguration(
      config.provider,
      config.providers[config.provider],
      PROVIDER_CONFIGS
    );
    this.hasSavedConfiguration = saved.valid;
    $('savedConfigurationLabel').textContent = saved.label;
    $('savedConfiguration').textContent = saved.text;
    document.querySelector('.saved-config')?.classList.toggle('not-set-up', !saved.valid);
    this.renderDirtyState();
  }

  getFormValues(provider = this.currentProvider) {
    return { ...this.store.draftSettings(provider) };
  }

  markInvalidFields(validation) {
    const fields = PROVIDER_FIELDS[this.currentProvider];
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

  // Validates the draft for Save/Test; on failure the form becomes invalid.
  checkDraft() {
    const validation = this.store.validateDraft(this.currentProvider);
    this.markInvalidFields(validation);
    if (!validation.valid) {
      this.dispatch({ type: 'invalid', errors: validation.errors });
      document.querySelector('[aria-invalid="true"]')?.focus();
    }
    return validation.valid;
  }

  // ---------- Favorites ----------

  renderFavoriteModels() {
    const list = $('favoriteModelList');
    const empty = $('favoriteModelEmpty');
    const addButton = $('addFavoriteBtn');
    if (!list || !empty || !addButton) return;

    const favorites = this.store.config.favorites;
    const currentModel = this.getFormValues().model || '';
    const alreadyFavorite = hasFavoriteModel(
      favorites,
      { provider: this.currentProvider, model: currentModel },
      PROVIDER_CONFIGS
    );
    const atFavoriteLimit = favorites.length >= MAX_FAVORITE_MODELS;
    addButton.textContent = alreadyFavorite
      ? 'Already a favorite'
      : atFavoriteLimit
        ? 'Favorite limit reached'
        : 'Add current model';
    addButton.disabled =
      this.isBusy || !currentModel.trim() || alreadyFavorite || atFavoriteLimit;

    list.replaceChildren();
    empty.classList.toggle('hidden', favorites.length > 0);
    for (const favorite of favorites) {
      const item = document.createElement('div');
      item.className = 'favorite-model-item';
      item.dataset.favoriteKey = favoriteModelKey(favorite.provider, favorite.model);

      const copy = document.createElement('div');
      const model = document.createElement('strong');
      model.textContent = favorite.model;
      const provider = document.createElement('span');
      provider.textContent = PROVIDER_CONFIGS[favorite.provider]?.name || favorite.provider;
      copy.append(model, provider);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'favorite-remove';
      remove.textContent = 'Remove';
      remove.disabled = this.isBusy;
      remove.setAttribute('aria-label', `Remove ${favorite.model} from favorite models`);
      remove.addEventListener('click', () => {
        void this.removeFavorite(favorite, remove);
      });

      item.append(copy, remove);
      list.appendChild(item);
    }
  }

  async addCurrentFavorite() {
    const favorites = this.store.config.favorites;
    const favorite = {
      provider: this.currentProvider,
      model: this.getFormValues().model || ''
    };
    const alreadyFavorite = hasFavoriteModel(favorites, favorite, PROVIDER_CONFIGS);
    if (!favorite.model.trim() || alreadyFavorite) {
      this.notify(
        alreadyFavorite
          ? 'This model is already in your favorites.'
          : 'Choose or enter a model before adding a favorite.',
        alreadyFavorite ? 'info' : 'error',
        false
      );
      return;
    }
    if (favorites.length >= MAX_FAVORITE_MODELS) {
      this.notify(
        `You can save up to ${MAX_FAVORITE_MODELS} favorite models. Remove one before adding another.`,
        'error',
        false
      );
      return;
    }

    const button = $('addFavoriteBtn');
    button.disabled = true;
    button.textContent = 'Adding…';
    try {
      await this.store.setFavorites(addFavoriteModel(favorites, favorite, PROVIDER_CONFIGS));
      this.renderFavoriteModels();
      this.notify('Favorite model added. It is now available in the quick switcher.', 'success');
    } catch (error) {
      console.error('DiscourseCopilot Settings: Unable to add favorite model:', error);
      this.renderFavoriteModels();
      this.notify(`Could not save favorite: ${error.message}`, 'error', false);
    }
  }

  async removeFavorite(favorite, button) {
    button.disabled = true;
    button.textContent = 'Removing…';
    try {
      await this.store.setFavorites(
        removeFavoriteModel(this.store.config.favorites, favorite, PROVIDER_CONFIGS)
      );
      this.renderFavoriteModels();
      this.notify('Favorite model removed.', 'success');
    } catch (error) {
      console.error('DiscourseCopilot Settings: Unable to remove favorite model:', error);
      this.renderFavoriteModels();
      this.notify(`Could not remove favorite: ${error.message}`, 'error', false);
    }
  }

  // ---------- Save / test / reset ----------

  async saveSettings() {
    if (this.isBusy || !this.checkDraft()) return;

    this.dispatch({ type: 'save-started' });
    const result = await this.store.save(this.currentProvider);
    if (result.ok) {
      this.renderSavedConfiguration();
      this.dispatch({ type: 'save-succeeded', welcomeMode: this.welcomeMode });
    } else {
      console.error('DiscourseCopilot Settings: Error saving settings:', result.error);
      this.dispatch({ type: 'save-failed', message: result.error?.message || 'unknown error' });
    }
  }

  async testConnection() {
    if (this.isBusy || !this.checkDraft()) return;

    const provider = this.currentProvider;
    const providerName = PROVIDER_CONFIGS[provider].name;
    this.dispatch({ type: 'test-started', providerName });
    const result = await this.store.test(provider);
    if (result.ok) {
      this.dispatch({ type: 'test-passed', providerName });
    } else {
      console.error(`DiscourseCopilot Settings: ${provider} connection test failed:`, result.error);
      this.dispatch({ type: 'test-failed', message: result.error?.message || 'unknown error' });
    }
  }

  async resetSettings() {
    if (this.isBusy) return;
    if (!confirm('Reset all providers, API keys, models, favorites, URLs, the custom system prompt, and the response language?')) {
      return;
    }

    this.dispatch({ type: 'reset-started' });
    const result = await this.store.reset();
    if (!result.ok) {
      console.error('DiscourseCopilot Settings: Error resetting settings:', result.error);
      this.dispatch({ type: 'reset-failed', message: result.error?.message || 'unknown error' });
      return;
    }

    this.store.selectProvider(this.store.config.provider);
    this.populateAllFields();
    this.renderProvider();
    this.renderFavoriteModels();
    this.renderSavedConfiguration();
    for (const provider of PROVIDER_IDS) DiscourseCopilotModels.clearCache(provider);
    this.dispatch({ type: 'reset-succeeded' });
    void this.loadModelsForProvider(this.currentProvider);
  }

  // ---------- Model suggestions ----------

  async loadModelsForProvider(provider) {
    const fields = PROVIDER_FIELDS[provider];
    const input = $(fields.model);
    const list = $(fields.modelList);
    const modelStatus = $(fields.modelStatus);
    if (!input || !list || !modelStatus) return;

    const requestId = (this.modelRequestIds[provider] || 0) + 1;
    this.modelRequestIds[provider] = requestId;
    const selectedModel = input.value;
    const settings = normalizeProviderSettings(provider, this.getFormValues(provider));
    const providerConfig = PROVIDER_CONFIGS[provider];
    // Known-good models stay offered even before (or without) a live model list.
    const suggested = (providerConfig.suggestedModels || []).map(id => ({ id }));

    if (providerConfig.requiresApiKey && !settings.apiKey.trim()) {
      this.populateModelChoices(list, suggested, selectedModel);
      modelStatus.textContent = 'Enter an API key, then refresh model suggestions.';
      this.setModelLoading(provider, false);
      return;
    }

    this.setModelLoading(provider, true);
    modelStatus.textContent = 'Loading model suggestions…';

    try {
      const models = await DiscourseCopilotModels.getModels(provider, settings);
      if (!isLatestRequest(this.modelRequestIds, provider, requestId)) return;

      this.populateModelChoices(list, [...suggested, ...models], selectedModel);
      modelStatus.textContent = models.length
        ? `${models.length} model suggestion${models.length === 1 ? '' : 's'} loaded. You can also enter a custom model.`
        : 'No models were returned. The current value is still available.';
    } catch (error) {
      if (!isLatestRequest(this.modelRequestIds, provider, requestId)) return;

      this.populateModelChoices(list, suggested, selectedModel);
      modelStatus.textContent = `Suggestions unavailable: ${error.message}. The current value was preserved.`;
      if (provider === this.currentProvider) {
        this.notify(
          `Could not load ${providerConfig.name} models. You can keep or enter a model manually.`,
          'error',
          false
        );
      }
    } finally {
      if (isLatestRequest(this.modelRequestIds, provider, requestId)) {
        this.setModelLoading(provider, false);
      }
    }
  }

  populateModelChoices(list, models, selectedModel) {
    const choices = buildModelChoices(models, selectedModel);
    list.replaceChildren(...choices.map(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.label = model.name || model.id;
      return option;
    }));
  }

  async refreshModels(provider) {
    if (!provider || this.isBusy) return;
    DiscourseCopilotModels.clearCache(provider);
    await this.loadModelsForProvider(provider);
  }

  setModelLoading(provider, loading) {
    if (loading) {
      this.loadingModelProviders.add(provider);
    } else {
      this.loadingModelProviders.delete(provider);
    }
    const button = document.querySelector(`.btn-refresh[data-provider="${provider}"]`);
    if (!button) return;
    button.disabled = this.loadingModelProviders.has(provider) || this.isBusy;
    button.textContent = loading ? 'Loading…' : 'Refresh models';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const settings = new DiscourseCopilotSettings();
  window.settingsInstance = settings;
  void settings.init();
});
