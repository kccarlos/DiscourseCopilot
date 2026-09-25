// Options page. Configuration state (persisted values, the draft being
// edited, test/save/reset) lives in the shared ConfigStore; the form's own
// lifecycle (pristine/dirty/testing/saving/…) is the reducer in
// settings-form-state.mjs. This file wires the page's sections to those two
// and renders the page-wide state (status line, save bar, busy state, the
// reset confirmation):
//
//   provider-section     provider picker, key/URL/model fields, model lists
//   preferences-section  research, reading and history preferences
//   favorites-section    favorite models for the side panel's switcher
//   forum-access-section enabled forums, Remove access
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { LOCAL_PROVIDER_IDS, describeSavedConfiguration } from '../shared/provider-setup.mjs';
import { RESPONSE_LANGUAGES } from '../shared/response-language.mjs';
import { requestServerAccess, serverAccessDeniedText, serverNeedsAccessPrompt } from '../shared/forum-access.mjs';
import { ConfigStore } from '../shared/config-state.mjs';
import { topicSessionDatabase } from '../shared/topic-session-db.mjs';
import { ForumAccessSection, customServerPatterns } from './forum-access-section.mjs';
import { INPUT_FIELDS, PROVIDER_FIELDS, ProviderSection } from './provider-section.mjs';
import { PREFERENCE_INPUT_IDS, PreferencesSection } from './preferences-section.mjs';
import { FavoritesSection } from './favorites-section.mjs';
import { dirtyIndicatorText, formStateLabel, initialFormState, isFormBusy, transitionForm } from './settings-form-state.mjs';

const { PROVIDER_CONFIGS } = DiscourseCopilotConstants;
const LOCAL_PROVIDER_IDS_LIST = [...LOCAL_PROVIDER_IDS];
const STATUS_AUTO_HIDE_MS = 5000;

const $ = id => document.getElementById(id);

class DiscourseCopilotSettings {
  constructor() {
    this.store = new ConfigStore();
    this.form = initialFormState();
    this.renderedStatus = undefined;
    this.renderedBusy = undefined;
    this.renderedConfirmingReset = undefined;
    this.hasSavedConfiguration = false;
    this.statusTimer = null;
    this.welcomeMode = new URLSearchParams(location.search).get('welcome') === '1';
    const isBusy = () => this.isBusy;
    this.provider = new ProviderSection({
      store: this.store,
      isBusy,
      onModelChanged: () => this.favorites.render()
    });
    this.preferences = new PreferencesSection({
      store: this.store,
      dispatch: event => this.dispatch(event),
      getForm: () => this.form,
      isBusy
    });
    this.favorites = new FavoritesSection({
      store: this.store,
      isBusy,
      notify: (message, type, autoHide) => this.notify(message, type, autoHide)
    });
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
    this.provider.renderLinks();
    this.preferences.renderRetentionOptions();
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
    this.preferences.populate();
    this.setupEventListeners();
    this.provider.render();
    this.favorites.render();
    this.renderSavedConfiguration();
    this.dispatch(loadError ? { type: 'load-failed', message: loadError.message } : { type: 'loaded', welcomeMode: this.welcomeMode });

    this.forumAccess = new ForumAccessSection({
      loadRecords: async () => {
        await topicSessionDatabase.open();
        const [sessions, activities] = await Promise.all([topicSessionDatabase.list(), topicSessionDatabase.listAgentActivities()]);
        return [...sessions, ...activities];
      },
      // A custom Ollama / LM Studio server is a granted host, not a forum.
      excludedPatterns: () => customServerPatterns(LOCAL_PROVIDER_IDS_LIST.map(provider => this.store.draftSettings(provider).url)),
      notify: (message, type) => this.notify(message, type, type === 'success')
    });
    void this.forumAccess.mount();

    // Follow changes made elsewhere (e.g. the side panel's model switcher).
    this.store.subscribe(event => {
      if (event.type === 'loaded' || event.type === 'saved' || event.type === 'active-model') {
        this.provider.renderModelWarning(this.currentProvider);
      }
      if (event.type === 'loaded') {
        this.renderSavedConfiguration();
        this.favorites.render();
        // Preferences saved elsewhere replace the fields unless being edited.
        if (!this.form.edited && !this.isBusy) {
          this.preferences.populate();
        }
      }
    });

    // Model discovery should never block editing the settings form.
    void this.provider.loadModels(this.currentProvider);
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
    if (this.form.confirmingReset !== this.renderedConfirmingReset) {
      this.renderedConfirmingReset = this.form.confirmingReset;
      this.renderResetConfirmation(this.form.confirmingReset);
    }
    this.renderDirtyState();
    this.preferences.renderFieldErrors(this.form.fieldErrors);
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
    this.provider.renderLoading();
    this.favorites.render();
    document.querySelector('.container')?.setAttribute('aria-busy', String(busy));
  }

  // The inline "Reset everything?" panel under Reset (form.confirmingReset).
  renderResetConfirmation(open) {
    const panel = $('resetConfirm');
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = !open;
    $('resetBtn').setAttribute('aria-expanded', String(open));
    $('resetBtn').closest('.danger-zone')?.classList.toggle('is-confirming', open);
    if (open) {
      $('resetConfirmBtn').focus();
    } else if (hadFocus) {
      $('resetBtn').focus();
    }
  }

  notify(message, statusType = 'info', autoHide) {
    this.dispatch({ type: 'notice', message, statusType, autoHide });
  }

  // ---------- Fields ----------

  renderResponseLanguageOptions() {
    const select = $('responseLanguage');
    select.replaceChildren(
      ...RESPONSE_LANGUAGES.map(language => {
        const option = document.createElement('option');
        option.value = language.value;
        option.textContent = language.label;
        return option;
      })
    );
  }

  populateAllFields() {
    this.provider.populate();
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
      this.provider.render();
      this.favorites.render();
      this.dispatch({ type: 'edited', clearStatus: true });
      void this.provider.loadModels(this.currentProvider);
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
      this.dispatch({ type: this.form.confirmingReset ? 'reset-cancelled' : 'reset-requested' });
    });
    $('resetConfirmBtn').addEventListener('click', () => {
      void this.resetSettings();
    });
    $('resetCancelBtn').addEventListener('click', () => {
      this.dispatch({ type: 'reset-cancelled' });
    });
    $('resetConfirm').addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.dispatch({ type: 'reset-cancelled' });
      }
    });

    this.provider.mountRefreshButtons();
    this.favorites.mount();
    this.preferences.mount();

    document.querySelectorAll('input, textarea').forEach(field => {
      if (PREFERENCE_INPUT_IDS.has(field.id) || field.type === 'radio') {
        return;
      }
      const target = INPUT_FIELDS.get(field.id);
      field.addEventListener('input', () => {
        field.removeAttribute('aria-invalid');
        if (target) {
          this.provider.handleInput(field, target);
        } else if (field.id === 'systemPrompt') {
          this.store.updateDraft({ systemPrompt: field.value });
        }
        this.dispatch({ type: 'edited' });
        if (field.id === PROVIDER_FIELDS[this.currentProvider]?.model) {
          this.favorites.render();
        }
      });
      if (target && target.field !== 'model') {
        field.addEventListener('change', () => this.provider.scheduleModelList(target.provider, 0));
      }
    });
  }

  // First install opens this page with ?welcome=1.
  renderWelcome() {
    document.body.classList.toggle('welcome-mode', this.welcomeMode);
    $('welcomeHeader')?.classList.toggle('hidden', !this.welcomeMode);
  }

  renderSavedConfiguration() {
    const { config } = this.store;
    const saved = describeSavedConfiguration(config.provider, config.providers[config.provider], PROVIDER_CONFIGS);
    this.hasSavedConfiguration = saved.valid;
    $('savedConfigurationLabel').textContent = saved.label;
    $('savedConfiguration').textContent = saved.text;
    document.querySelector('.saved-config')?.classList.toggle('not-set-up', !saved.valid);
    this.renderDirtyState();
  }

  // Validates the draft for Save (provider + preferences) or Test (provider
  // only); on failure the form becomes invalid and nothing is written.
  checkDraft({ includePreferences = true } = {}) {
    const validation = includePreferences ? this.store.validateSave(this.currentProvider) : this.store.validateDraft(this.currentProvider);
    this.provider.markInvalidFields(validation);
    if (!validation.valid) {
      this.dispatch({
        type: 'invalid',
        errors: validation.errors,
        fieldErrors: Object.fromEntries(Object.entries(validation.fieldErrors).filter(([field]) => PREFERENCE_INPUT_IDS.has(field)))
      });
      document.querySelector('[aria-invalid="true"]')?.focus();
    }
    return validation.valid;
  }

  // ---------- Save / test / reset ----------

  // A custom Ollama / LM Studio server on another host needs its own
  // permission. Must be called before any await in the click.
  requestCustomServerAccess() {
    const provider = this.currentProvider;
    const serverUrl = LOCAL_PROVIDER_IDS.has(provider) ? this.store.draftSettings(provider).url : '';
    return {
      serverUrl,
      allowed: serverNeedsAccessPrompt(serverUrl) ? requestServerAccess(serverUrl) : Promise.resolve(true)
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
        this.preferences.populate();
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
        message: serverAllowed ? result.error?.message || 'unknown error' : serverAccessDeniedText(server.serverUrl)
      });
    }
  }

  // Runs from the confirmation panel's "Reset everything" only.
  async resetSettings() {
    if (this.isBusy || !this.form.confirmingReset) return;

    this.dispatch({ type: 'reset-started' });
    const result = await this.store.reset();
    if (!result.ok) {
      console.error('DiscourseCopilot Settings: Error resetting settings:', result.error);
      this.dispatch({ type: 'reset-failed', message: result.error?.message || 'unknown error' });
      $('resetBtn').focus();
      return;
    }

    this.store.selectProvider(this.store.config.provider);
    this.populateAllFields();
    this.preferences.populate();
    this.provider.render();
    this.favorites.render();
    this.renderSavedConfiguration();
    this.provider.resetModels();
    this.dispatch({ type: 'reset-succeeded' });
    $('resetBtn').focus();
    void this.provider.loadModels(this.currentProvider);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const settings = new DiscourseCopilotSettings();
  window.settingsInstance = settings;
  void settings.init();
});
