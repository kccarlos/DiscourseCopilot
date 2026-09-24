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
import {
  requestServerAccess,
  serverAccessDeniedText,
  serverNeedsAccessPrompt
} from '../shared/forum-access.mjs';
import { ConfigStore, PROVIDER_IDS } from '../shared/config-state.mjs';
import { FORUM_CONTEXT_LIMIT } from '../shared/chat-context-limit.mjs';
import {
  DEFAULT_PREFERENCES,
  HISTORY_RETENTION_OPTIONS,
  POSTS_PER_RAW_PAGE,
  researchRequestBudget,
  resolveResearchLimits,
  resolveRetention,
  validatePreferences
} from '../shared/preferences.mjs';
import { topicSessionDatabase } from '../popup/topic-session-db.mjs';
import { ForumAccessSection, customServerPatterns } from './forum-access-section.mjs';
import {
  dirtyIndicatorText,
  formStateLabel,
  initialFormState,
  isFormBusy,
  transitionForm
} from './settings-form-state.mjs';

const { PROVIDER_CONFIGS } = DiscourseCopilotConstants;
const LOCAL_PROVIDER_IDS_LIST = [...LOCAL_PROVIDER_IDS];
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

// Preference inputs (ids match the validation field names).
const CUSTOM_RESEARCH_FIELDS = ['searchQueries', 'searchPages', 'topicsRead'];
const PREFERENCE_NUMBER_FIELDS = [
  ...CUSTOM_RESEARCH_FIELDS,
  'topicPageLimit',
  'maxSavedTopics',
  'forumContextLimit'
];
const PREFERENCE_INPUT_IDS = new Set(PREFERENCE_NUMBER_FIELDS);

// "Restore defaults" per section: which preferences it resets.
const RESTORE_SECTIONS = {
  research: {
    label: 'Ask the forum',
    keys: ['researchDepth', 'customResearch'],
    fields: CUSTOM_RESEARCH_FIELDS
  },
  reading: {
    label: 'Reading topics',
    keys: ['topicPageMode', 'topicPageLimit'],
    fields: ['topicPageLimit', 'forumContextLimit'],
    forumContextLimit: true
  },
  history: {
    label: 'History & privacy',
    keys: ['historyRetention', 'maxSavedTopics'],
    fields: ['maxSavedTopics']
  }
};

const plural = (count, one, many = `${one}s`) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

// Renders text with **bold** segments as DOM nodes (no HTML parsing).
function setRichText(element, text) {
  element.replaceChildren(...String(text).split(/\*\*/).map((part, index) => {
    if (index % 2 === 0) return document.createTextNode(part);
    const strong = document.createElement('strong');
    strong.textContent = part;
    return strong;
  }));
}

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
    this.renderRetentionOptions();
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
    this.populatePreferenceFields();
    this.setupEventListeners();
    this.renderProvider();
    this.renderFavoriteModels();
    this.renderSavedConfiguration();
    this.dispatch(loadError
      ? { type: 'load-failed', message: loadError.message }
      : { type: 'loaded', welcomeMode: this.welcomeMode });

    this.forumAccess = new ForumAccessSection({
      loadRecords: async () => {
        await topicSessionDatabase.open();
        const [sessions, activities] = await Promise.all([
          topicSessionDatabase.list(),
          topicSessionDatabase.listAgentActivities()
        ]);
        return [...sessions, ...activities];
      },
      // A custom Ollama / LM Studio server is a granted host, not a forum.
      excludedPatterns: () => customServerPatterns(
        LOCAL_PROVIDER_IDS_LIST.map(provider => this.store.draftSettings(provider).url)
      ),
      notify: (message, type) => this.notify(message, type, type === 'success')
    });
    void this.forumAccess.mount();

    // Follow changes made elsewhere (e.g. the side panel's model switcher).
    this.store.subscribe(event => {
      if (event.type === 'loaded') {
        this.renderSavedConfiguration();
        this.renderFavoriteModels();
        // Preferences saved elsewhere replace the fields unless being edited.
        if (!this.form.edited && !this.isBusy) {
          this.populatePreferenceFields();
        }
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
    this.renderFieldErrors();
  }

  // Inline errors for the preference fields, from the form state.
  renderFieldErrors() {
    const fieldErrors = this.form.fieldErrors || {};
    for (const field of PREFERENCE_NUMBER_FIELDS) {
      const input = $(field);
      const error = $(`${field}Error`);
      if (!input || !error) continue;
      const message = fieldErrors[field] || '';
      error.textContent = message;
      error.hidden = !message;
      if (message) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    }
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
    // The save bar's state, derived from the same form state.
    const label = formStateLabel(this.form, this.hasSavedConfiguration);
    $('formStateText').textContent = label.text;
    $('formState').dataset.tone = label.tone;
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

    this.setupPreferenceListeners();

    document.querySelectorAll('input, textarea').forEach(field => {
      if (PREFERENCE_INPUT_IDS.has(field.id) || field.type === 'radio') {
        return;
      }
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

  // ---------- Preferences ----------

  renderRetentionOptions() {
    const container = $('historyRetentionOptions');
    if (!container || container.childElementCount) return;
    container.replaceChildren(...HISTORY_RETENTION_OPTIONS.map(option => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'historyRetention';
      input.value = option.value;
      const text = document.createElement('span');
      text.textContent = option.value === DEFAULT_PREFERENCES.historyRetention
        ? `${option.label} (default)`
        : option.label;
      label.append(input, text);
      return label;
    }));
  }

  // The chat context value being edited (string while typing).
  get draftForumContextLimit() {
    return this.store.draft.forumContextLimit ?? this.store.config.forumContextLimit;
  }

  populatePreferenceFields() {
    const preferences = this.store.draftPreferences;
    document.querySelectorAll('input[name="researchDepth"]').forEach(input => {
      input.checked = input.value === preferences.researchDepth;
    });
    document.querySelectorAll('input[name="historyRetention"]').forEach(input => {
      input.checked = input.value === preferences.historyRetention;
    });
    for (const field of CUSTOM_RESEARCH_FIELDS) {
      $(field).value = String(preferences.customResearch[field]);
    }
    document.querySelectorAll('input[name="topicPageMode"]').forEach(input => {
      input.checked = input.value === preferences.topicPageMode;
    });
    $('topicPageLimit').value = String(preferences.topicPageLimit);
    $('maxSavedTopics').value = String(preferences.maxSavedTopics);
    $('forumContextLimit').value = String(this.draftForumContextLimit);
    this.renderPreferences();
  }

  setupPreferenceListeners() {
    document.querySelectorAll('input[name="researchDepth"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.store.updatePreferences({ researchDepth: input.value });
        this.dispatch({ type: 'edited', clearStatus: true });
        this.syncPreferenceErrors();
        this.renderPreferences();
      });
    });
    document.querySelectorAll('input[name="topicPageMode"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.store.updatePreferences({ topicPageMode: input.value });
        this.dispatch({ type: 'edited', clearStatus: true });
        // Leaving limit mode clears a page-limit error (it is no longer checked).
        this.syncPreferenceErrors();
        this.renderPreferences();
      });
    });
    document.querySelectorAll('input[name="historyRetention"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.store.updatePreferences({ historyRetention: input.value });
        this.dispatch({ type: 'edited', clearStatus: true });
        this.renderPreferences();
      });
    });
    for (const field of PREFERENCE_NUMBER_FIELDS) {
      const input = $(field);
      input.addEventListener('input', () => {
        this.updatePreferenceField(field, input.value);
        this.dispatch({ type: 'edited' });
        // While typing, only update an error already shown (e.g. clear it
        // once fixed); a new error appears when the field is left.
        this.syncPreferenceErrors();
        this.renderPreferences();
      });
      input.addEventListener('change', () => {
        this.syncPreferenceErrors(field);
      });
    }
    document.querySelectorAll('[data-restore]').forEach(button => {
      button.addEventListener('click', () => this.restoreSectionDefaults(button.dataset.restore));
    });
  }

  updatePreferenceField(field, value) {
    if (CUSTOM_RESEARCH_FIELDS.includes(field)) {
      this.store.updatePreferences({ customResearch: { [field]: value } });
    } else if (field === 'forumContextLimit') {
      this.store.updateDraft({ forumContextLimit: value });
    } else {
      this.store.updatePreferences({ [field]: value });
    }
  }

  // Re-derives inline errors from the draft: fields already showing an error
  // (and `reveal`, a field just left) show its current error or none.
  syncPreferenceErrors(reveal = '') {
    const validation = this.store.validatePreferencesDraft();
    const shown = this.form.fieldErrors || {};
    const fields = PREFERENCE_NUMBER_FIELDS.filter(field => field === reveal || shown[field]);
    if (!fields.length) return;
    this.dispatch({ type: 'field-errors', fields, fieldErrors: validation.fieldErrors });
  }

  restoreSectionDefaults(section) {
    const restore = RESTORE_SECTIONS[section];
    if (!restore || this.isBusy) return;
    this.store.resetPreferencesDraft(restore.keys);
    if (restore.forumContextLimit) {
      this.store.updateDraft({ forumContextLimit: FORUM_CONTEXT_LIMIT.default });
    }
    this.populatePreferenceFields();
    this.dispatch({ type: 'defaults-restored', section: restore.label, fields: restore.fields });
  }

  // The effective values below each section, derived from the draft the way
  // the extension will apply them once saved.
  renderPreferences() {
    const draft = this.store.draftPreferences;
    const validation = validatePreferences(draft);
    const custom = draft.researchDepth === 'custom';
    $('customResearch').hidden = !custom;

    const research = $('researchEffective');
    const researchInvalid = CUSTOM_RESEARCH_FIELDS.some(field => validation.fieldErrors[field]);
    if (researchInvalid) {
      research.textContent = 'Fix the highlighted field to see what each question will do.';
    } else {
      const limits = resolveResearchLimits(validation.preferences || draft);
      const pages = limits.searchPages > 1 ? ` × ${plural(limits.searchPages, 'result page')}` : '';
      setRichText(research, `Each question: **up to ${plural(limits.searchQueries, 'search', 'searches')}${pages}**, reading **up to ${plural(limits.topicsRead, 'discussion')}** — at most ${plural(researchRequestBudget(limits), 'forum request')}.`);
    }

    const limitMode = draft.topicPageMode === 'limit';
    $('topicPageLimit').disabled = !limitMode;
    const reading = $('topicPageLimitEffective');
    if (!limitMode) {
      setRichText(reading, '**Every page** of a topic is read.');
    } else if (validation.fieldErrors.topicPageLimit) {
      reading.textContent = '';
    } else {
      const posts = (Number(draft.topicPageLimit) * POSTS_PER_RAW_PAGE).toLocaleString('en-US');
      setRichText(reading, `Topics up to **${posts} posts** are read in full; longer ones are summarized from their first ${posts} posts, and the summary says so.`);
    }

    const history = $('historyEffective');
    if (validation.fieldErrors.maxSavedTopics) {
      history.textContent = '';
    } else {
      const retention = resolveRetention(validation.preferences || draft);
      const taskDays = Math.round(retention.taskMs / 86400000);
      const tasks = `finished tasks leave the Tasks list after ${plural(taskDays, 'day')}`;
      setRichText(history, retention.forever
        ? `Unkept conversations and Agent answers stay **until you delete them**; ${tasks}. Past **${retention.maxSavedTopics} saved topics**, the oldest unkept summaries are removed.`
        : `Unkept conversations and Agent answers are removed **${retention.label} after their last activity**; ${tasks}. Up to **${retention.maxSavedTopics} saved topics** are kept.`);
    }
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

  // Validates the draft for Save (provider + preferences) or Test (provider
  // only); on failure the form becomes invalid and nothing is written.
  checkDraft({ includePreferences = true } = {}) {
    const validation = includePreferences
      ? this.store.validateSave(this.currentProvider)
      : this.store.validateDraft(this.currentProvider);
    this.markInvalidFields(validation);
    if (!validation.valid) {
      this.dispatch({
        type: 'invalid',
        errors: validation.errors,
        fieldErrors: Object.fromEntries(Object.entries(validation.fieldErrors)
          .filter(([field]) => PREFERENCE_INPUT_IDS.has(field)))
      });
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

  // A custom Ollama / LM Studio server on another host needs its own
  // permission. Must be called before any await in the click.
  requestCustomServerAccess() {
    const provider = this.currentProvider;
    const serverUrl = LOCAL_PROVIDER_IDS.has(provider)
      ? this.store.draftSettings(provider).url
      : '';
    return {
      serverUrl,
      allowed: serverNeedsAccessPrompt(serverUrl)
        ? requestServerAccess(serverUrl)
        : Promise.resolve(true)
    };
  }

  async saveSettings() {
    if (this.isBusy || !this.checkDraft()) return;
    const server = this.requestCustomServerAccess();

    this.dispatch({ type: 'save-started' });
    const serverAllowed = await server.allowed;
    const result = await this.store.save(this.currentProvider);
    if (result.ok) {
      this.renderSavedConfiguration();
      if (this.form.revision === this.form.savingRevision) {
        this.populatePreferenceFields();
      }
      this.dispatch({ type: 'save-succeeded', welcomeMode: this.welcomeMode });
      if (!serverAllowed) {
        this.notify(`Saved. ${serverAccessDeniedText(server.serverUrl)}`, 'warning', false);
      }
    } else {
      console.error('DiscourseCopilot Settings: Error saving settings:', result.error);
      this.dispatch({ type: 'save-failed', message: result.error?.message || 'unknown error' });
    }
  }

  async testConnection() {
    if (this.isBusy || !this.checkDraft({ includePreferences: false })) return;
    const server = this.requestCustomServerAccess();

    const provider = this.currentProvider;
    const providerName = PROVIDER_CONFIGS[provider].name;
    this.dispatch({ type: 'test-started', providerName });
    const serverAllowed = await server.allowed;
    const result = await this.store.test(provider);
    if (result.ok) {
      this.dispatch({ type: 'test-passed', providerName });
    } else {
      console.error(`DiscourseCopilot Settings: ${provider} connection test failed:`, result.error);
      this.dispatch({
        type: 'test-failed',
        message: serverAllowed
          ? result.error?.message || 'unknown error'
          : serverAccessDeniedText(server.serverUrl)
      });
    }
  }

  async resetSettings() {
    if (this.isBusy) return;
    if (!confirm('Reset all providers, API keys, models, favorites, URLs, the custom system prompt, the response language, and the research, reading and history preferences? Saved summaries and answers are not deleted.')) {
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
    this.populatePreferenceFields();
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
