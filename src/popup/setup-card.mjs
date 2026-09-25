// First-run setup card in the side panel: choose a provider, add a key (or a
// local server URL), pick a model, then test and save. The values being
// typed are the shared ConfigStore's draft; test and save are its
// transitions. The card's own state is only what it shows:
//
//   editing ──submit──▶ busy ──saved──▶ success ──Done / navigation──▶ done
//      ▲                 │ invalid, test failed or save failed          │
//      └─────────────────┘                                              │
//      └───────────── reopen(): settings became unusable again ◀────────┘
//
// Once a key (or server URL) is entered, the provider's live model list
// fills the model suggestions and, unless the user picked a model or one was
// saved before, replaces the curated default with pickDefaultModel()'s
// choice. A list that can't be read changes nothing: the curated default
// stays, and "Test & save" reports a bad key as before.
import {
  LOCAL_PROVIDER_IDS,
  PROVIDER_BLURBS,
  PROVIDER_LINKS,
  RECOMMENDED_PROVIDERS,
  defaultLocalUrl,
  setupSuccessMessage,
  suggestSetupModels
} from '../shared/provider-setup.mjs';
import {
  requestServerAccess,
  serverAccessDeniedText,
  serverNeedsAccessPrompt
} from '../shared/forum-access.mjs';
import { announce } from './status-line.mjs';
import { modelCatalog, orderModelChoices, pickDefaultModel } from '../shared/model-catalog.mjs';

// Wait for a pause in typing before reading the provider's model list.
const MODEL_LIST_DEBOUNCE_MS = 600;
const MODEL_HINT = 'Prefilled with a fast, low-cost default. You can change it any time.';

const CHOICE_LABELS = {
  ollama: 'Local (Ollama)'
};

const FIELD_INPUTS = {
  apiKey: 'setupApiKey',
  url: 'setupServerUrl',
  model: 'setupModel'
};

const FIELD_ERRORS = {
  apiKey: 'setupApiKeyError',
  url: 'setupServerUrlError',
  model: 'setupModelError'
};

const $ = id => document.getElementById(id);

export class SetupCard {
  /**
   * @param {object} options
   * @param {object} options.config ConfigStore (draft, test and save)
   * @param {() => object|null} options.getPageContext the current page, for the success copy
   * @param {() => void|Promise<void>} options.onSaved re-renders the panel
   * @param {() => void} options.onStateChange re-renders the panel (card shown or hidden)
   * @param {() => void} options.openSettings
   * @param {object} [options.catalog] ModelCatalog (live model lists)
   */
  constructor({ config, getPageContext, onSaved, onStateChange, openSettings, catalog = modelCatalog }) {
    this.config = config;
    this.providerConfigs = config.providerConfigs;
    this.getPageContext = getPageContext;
    this.onSaved = onSaved;
    this.onStateChange = onStateChange;
    this.openSettings = openSettings;
    // editing | busy | success | done
    this.state = 'editing';
    this.provider = '';
    this.prepared = false;
    this.pointerChoice = false;
    this.catalog = catalog;
    // The live list for the provider shown (null until one was read).
    this.models = null;
    // The user typed a model since choosing the provider.
    this.modelTouched = false;
    this.modelRequestId = 0;
    this.modelListTimer = null;
  }

  get showsSuccess() {
    return this.state === 'success';
  }

  mount() {
    // Native radios inside the fieldset give radio-group semantics and
    // arrow-key navigation; the legend names the group.
    const options = $('setupProviderOptions');
    options.replaceChildren(...RECOMMENDED_PROVIDERS.map(provider => {
      const label = document.createElement('label');
      label.className = 'setup-provider-option';
      label.dataset.provider = provider;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'setupProvider';
      input.value = provider;
      const name = document.createElement('strong');
      name.textContent = CHOICE_LABELS[provider] || this.providerConfigs[provider]?.name || provider;
      const blurb = document.createElement('small');
      blurb.textContent = PROVIDER_BLURBS[provider] || '';
      label.append(input, name, blurb);
      return label;
    }));

    const more = $('setupMoreProviders');
    const others = Object.keys(this.providerConfigs)
      .filter(provider => !RECOMMENDED_PROVIDERS.includes(provider));
    more.append(...others.map(provider => {
      const option = document.createElement('option');
      option.value = provider;
      option.textContent = this.providerConfigs[provider].name;
      return option;
    }));

    // Pointer choices move on to the key field; keyboard users keep arrowing
    // through the group and continue with Tab or Enter.
    options.addEventListener('pointerdown', () => {
      this.pointerChoice = true;
    });
    options.addEventListener('change', event => {
      if (event.target.name !== 'setupProvider') return;
      more.value = '';
      void this.chooseProvider(event.target.value, { focusNext: this.pointerChoice });
      this.pointerChoice = false;
    });
    options.addEventListener('keydown', event => {
      this.pointerChoice = false;
      if (event.key === 'Enter' && event.target.name === 'setupProvider') {
        // Enter would submit the form; treat it as "continue" instead.
        event.preventDefault();
        if (!event.target.checked) {
          event.target.checked = true;
          void this.chooseProvider(event.target.value, { focusNext: true });
        } else {
          this.focusCredential();
        }
      }
    });
    more.addEventListener('pointerdown', () => {
      this.pointerChoice = true;
    });
    more.addEventListener('change', () => {
      if (!more.value) return;
      for (const radio of document.querySelectorAll('input[name="setupProvider"]')) {
        radio.checked = false;
      }
      void this.chooseProvider(more.value, { focusNext: this.pointerChoice });
      this.pointerChoice = false;
    });

    $('setupKeyToggle').addEventListener('click', () => {
      const input = $('setupApiKey');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      $('setupKeyToggle').textContent = reveal ? 'Hide' : 'Show';
      $('setupKeyToggle').setAttribute('aria-label', reveal ? 'Hide API key' : 'Show API key');
    });

    for (const [field, id] of Object.entries(FIELD_INPUTS)) {
      $(id).addEventListener('input', () => {
        this.saveDraft();
        this.clearFieldError(field);
        this.clearFormError();
        if (field === 'model') {
          this.modelTouched = true;
        } else {
          this.scheduleModelList();
        }
      });
      if (field !== 'model') {
        // Leaving the field reads the list at once.
        $(id).addEventListener('change', () => this.scheduleModelList(0));
      }
    }

    $('setupForm').addEventListener('submit', event => {
      event.preventDefault();
      void this.submit({ test: true });
    });
    $('setupSaveOnlyBtn').addEventListener('click', () => {
      void this.submit({ test: false });
    });
    $('setupDoneBtn').addEventListener('click', () => {
      this.dismissSuccess({ restoreFocus: true });
    });
    $('setupAdvancedBtn').addEventListener('click', () => {
      this.openSettings();
    });
  }

  // Called while setup is needed; preselects a provider the user chose before.
  async prepare({ savedProvider = '' } = {}) {
    if (this.prepared) return;
    this.prepared = true;
    if (savedProvider && this.providerConfigs[savedProvider]) {
      await this.chooseProvider(savedProvider, { focusNext: false, syncInputs: true });
    } else {
      this.render();
    }
  }

  async chooseProvider(provider, { focusNext = false, syncInputs = false } = {}) {
    if (!this.providerConfigs[provider]) return;
    this.saveDraft();
    const changed = provider !== this.provider;
    this.provider = provider;
    // The draft starts from the saved settings (or the provider defaults).
    this.config.selectProvider(provider);
    if (changed) {
      this.models = null;
      this.modelTouched = false;
      this.modelRequestId += 1;
    }
    if (syncInputs) {
      const radio = document.querySelector(`input[name="setupProvider"][value="${provider}"]`);
      if (radio) {
        radio.checked = true;
        $('setupMoreProviders').value = '';
      } else {
        $('setupMoreProviders').value = provider;
      }
    }
    this.render();
    if (focusNext) {
      this.focusCredential();
    }
    // A key typed earlier (or a local server's default URL) is enough.
    if (changed) this.scheduleModelList(0);
  }

  scheduleModelList(delay = MODEL_LIST_DEBOUNCE_MS) {
    clearTimeout(this.modelListTimer);
    this.modelListTimer = setTimeout(() => {
      void this.loadModels();
    }, delay);
  }

  // Reads the provider's live model list for the key/URL in the draft.
  async loadModels() {
    const provider = this.provider;
    const config = this.providerConfigs[provider];
    if (!config || this.state !== 'editing') return;
    const draft = this.config.draftSettings(provider);
    const credential = LOCAL_PROVIDER_IDS.has(provider) ? draft.url : draft.apiKey;
    const requestId = ++this.modelRequestId;
    if (!String(credential || '').trim()) {
      this.models = null;
      this.renderModelChoices();
      return;
    }
    $('setupModelHint').textContent = `Checking ${config.name}’s current models…`;
    let models = null;
    try {
      ({ models } = await this.catalog.list(provider, draft));
    } catch {
      // Keep the curated default; Test & save reports a bad key.
      models = null;
    }
    if (requestId !== this.modelRequestId || provider !== this.provider) return;
    this.models = models?.length ? models : null;
    if (this.models && this.state === 'editing' && this.mayPreselect(provider)) {
      const pick = pickDefaultModel(provider, this.models, this.providerConfigs);
      if (pick && pick !== $('setupModel').value) {
        $('setupModel').value = pick;
        this.config.updateField(provider, 'model', pick);
        this.clearFieldError('model');
      }
    }
    this.renderModelChoices();
  }

  // Never replace a model the user typed or saved before.
  mayPreselect(provider) {
    return !this.modelTouched && !this.config.config.savedModels?.[provider];
  }

  // The datalist: the live list (recommended first) or the curated models.
  renderModelChoices() {
    const provider = this.provider;
    const config = this.providerConfigs[provider];
    if (!config) return;
    const choices = this.models
      ? orderModelChoices(provider, this.models, this.providerConfigs)
      : suggestSetupModels(provider, this.config.config.favorites, this.providerConfigs)
        .map((id, index) => ({ id, name: index === 0 ? 'Recommended' : '' }));
    $('setupModelList').replaceChildren(...choices.map(choice => {
      const option = document.createElement('option');
      option.value = choice.id;
      if (choice.name && choice.name !== choice.id) option.label = choice.name;
      return option;
    }));
    const hint = $('setupModelHint');
    hint.textContent = !this.models
      ? MODEL_HINT
      : this.mayPreselect(provider)
        ? `A fast, low-cost model from ${config.name}’s current list. You can change it any time.`
        : `Choose from ${config.name}’s current models; recommended ones are listed first.`;
    hint.dataset.source = this.models ? 'live' : 'curated';
  }

  focusCredential() {
    if (!this.provider) return;
    const input = LOCAL_PROVIDER_IDS.has(this.provider) ? $('setupServerUrl') : $('setupApiKey');
    input.focus();
  }

  focus() {
    const target = document.querySelector('input[name="setupProvider"]:checked')
      || (this.provider ? $('setupMoreProviders') : null)
      || document.querySelector('input[name="setupProvider"]');
    const card = $('setupCard');
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    (this.state === 'success' ? $('setupDoneBtn') : target || $('setupHeading')).focus({ preventScroll: true });
  }

  // Copies the inputs into the config draft for the chosen provider.
  saveDraft() {
    if (!this.provider) return;
    const credential = LOCAL_PROVIDER_IDS.has(this.provider) ? 'url' : 'apiKey';
    this.config.updateField(this.provider, credential, $(FIELD_INPUTS[credential]).value);
    this.config.updateField(this.provider, 'model', $('setupModel').value);
  }

  render() {
    const provider = this.provider;
    const config = this.providerConfigs[provider];
    const card = $('setupCard');
    card.dataset.state = this.state;
    $('setupForm').classList.toggle('hidden', this.state === 'success');
    $('setupIntro').classList.toggle('hidden', this.state === 'success');
    $('setupSuccess').classList.toggle('hidden', this.state !== 'success');
    $('setupDetails').classList.toggle('hidden', !config);
    $('setupMoreProviders').classList.toggle(
      'has-value',
      Boolean(config) && !RECOMMENDED_PROVIDERS.includes(provider)
    );
    if (!config) return;

    const isLocal = LOCAL_PROVIDER_IDS.has(provider);
    const draft = this.config.draftSettings(provider);
    const link = PROVIDER_LINKS[provider];

    $('setupKeyStep').classList.toggle('hidden', isLocal);
    $('setupUrlStep').classList.toggle('hidden', !isLocal);
    if (isLocal) {
      $('setupServerUrlLabel').textContent = `${config.name.replace(/\s*\(Local\)$/, '')} server URL`;
      $('setupServerUrl').value = draft.url || '';
      $('setupServerUrl').placeholder = defaultLocalUrl(provider, this.providerConfigs);
      $('setupServerUrlHelp').textContent = provider === 'ollama'
        ? 'Start Ollama on this computer, then keep the default address.'
        : 'Start the local server in LM Studio (Developer tab), then keep the default address.';
      this.setLink($('setupDownloadLink'), link?.url, link?.label || 'Download');
      $('setupOllamaOrigins').classList.toggle('hidden', provider !== 'ollama');
      $('setupServerUrl').setAttribute('aria-describedby', provider === 'ollama'
        ? 'setupServerUrlHint setupOllamaOrigins setupServerUrlError'
        : 'setupServerUrlHint setupServerUrlError');
    } else {
      $('setupApiKeyLabel').textContent = `${config.name} API key`;
      $('setupApiKey').value = draft.apiKey || '';
      this.setLink($('setupKeyLink'), link?.url, 'Get a key');
      $('setupKeyLink').title = link ? `Get a ${config.name} API key at ${link.label}` : '';
    }
    $('setupModel').value = draft.model || '';
    this.renderModelChoices();
    for (const field of Object.keys(FIELD_INPUTS)) this.clearFieldError(field);
    this.clearFormError();
    this.setProgress('');
    this.setBusy(this.state === 'busy');
  }

  setLink(anchor, url, text) {
    if (!url) {
      anchor.classList.add('hidden');
      return;
    }
    anchor.classList.remove('hidden');
    anchor.href = url;
    anchor.firstChild.textContent = `${text} `;
  }

  showFieldError(field, message) {
    const input = $(FIELD_INPUTS[field]);
    const error = $(FIELD_ERRORS[field]);
    if (!input || !error) return false;
    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.classList.remove('hidden');
    return true;
  }

  clearFieldError(field) {
    $(FIELD_INPUTS[field])?.removeAttribute('aria-invalid');
    const error = $(FIELD_ERRORS[field]);
    if (error) {
      error.textContent = '';
      error.classList.add('hidden');
    }
  }

  showFormError(message) {
    const error = $('setupFormError');
    error.textContent = message;
    error.classList.remove('hidden');
  }

  clearFormError() {
    const error = $('setupFormError');
    error.textContent = '';
    error.classList.add('hidden');
  }

  setProgress(message) {
    const progress = $('setupProgress');
    progress.textContent = message;
    progress.classList.toggle('hidden', !message);
  }

  setBusy(busy) {
    const button = $('setupTestSaveBtn');
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    $('setupSaveOnlyBtn').disabled = busy;
    $('setupForm').setAttribute('aria-busy', String(busy));
  }

  async submit({ test }) {
    if (this.state === 'busy') return;
    if (!this.provider) {
      document.querySelector('input[name="setupProvider"]')?.focus();
      return;
    }
    this.saveDraft();
    const provider = this.provider;
    const config = this.providerConfigs[provider];
    for (const field of Object.keys(FIELD_INPUTS)) this.clearFieldError(field);
    this.clearFormError();

    const validation = this.config.validateDraft(provider);
    if (!validation.valid) {
      let firstField = '';
      for (const [field, message] of Object.entries(validation.fieldErrors)) {
        if (this.showFieldError(field, message) && !firstField) firstField = field;
      }
      if (firstField) $(FIELD_INPUTS[firstField]).focus();
      return;
    }

    // A custom server on another host needs its own permission; ask now,
    // while this is still the click (no await above this line).
    const serverUrl = LOCAL_PROVIDER_IDS.has(provider)
      ? this.config.draftSettings(provider).url
      : '';
    const serverAccess = serverNeedsAccessPrompt(serverUrl)
      ? requestServerAccess(serverUrl)
      : Promise.resolve(true);

    this.state = 'busy';
    this.setBusy(true);
    const serverAllowed = await serverAccess;
    if (test) {
      this.setProgress(`Testing ${config.name}…`);
      const result = await this.config.test(provider);
      if (!result.ok) {
        const failure = result.failure || { field: null, message: result.error?.message || 'The test did not run.' };
        if (!serverAllowed) {
          failure.field = 'url';
          failure.message = serverAccessDeniedText(serverUrl);
        }
        this.state = 'editing';
        this.setBusy(false);
        this.setProgress('');
        if (failure.field && this.showFieldError(failure.field, failure.message)) {
          $(FIELD_INPUTS[failure.field]).focus();
        } else {
          this.showFormError(`${failure.message} You can also save without testing.`);
          $('setupTestSaveBtn').focus();
        }
        return;
      }
    }

    this.setProgress(test ? 'Connection works. Saving…' : 'Saving…');
    // Set before the write: the saved configuration re-renders the panel,
    // which must keep the card open to show the success message.
    this.state = 'success';
    // Saved with the current system prompt and response language.
    const saved = await this.config.save(provider);
    if (!saved.ok) {
      this.state = 'editing';
      this.setBusy(false);
      this.setProgress('');
      this.showFormError(`Could not save: ${saved.error?.message || 'unknown error'}`);
      return;
    }
    this.setProgress('');
    this.setBusy(false);
    const message = setupSuccessMessage(this.getPageContext());
    $('setupSuccessText').textContent = message;
    this.render();
    await this.onSaved();
    $('setupDoneBtn').focus({ preventScroll: true });
    announce($('setupAnnouncer'), message);
  }

  // The success message collapses on Done, on navigation, or when the user
  // starts a task.
  dismissSuccess({ restoreFocus = false } = {}) {
    if (this.state !== 'success') return;
    const hadFocus = $('setupCard').contains(document.activeElement);
    this.state = 'done';
    this.onStateChange();
    if (restoreFocus || hadFocus) {
      const next = [$('summarizeBtn'), $('agentLaunchBtn'), $('forumAccessBtn'), $('settingsBtn')]
        .find(button => button && !button.disabled && button.offsetParent !== null);
      next?.focus();
    }
  }

  // Settings became invalid again (e.g. the key was removed elsewhere).
  reopen() {
    if (this.state === 'done' || this.state === 'success') {
      this.state = 'editing';
      // Re-read the saved settings: the old draft may hold a key that was
      // just removed.
      this.provider = '';
      this.models = null;
      this.modelTouched = false;
      this.modelRequestId += 1;
      this.config.discardDraft();
      this.prepared = false;
      $('setupAnnouncer').textContent = '';
      $('setupApiKey').type = 'password';
      $('setupKeyToggle').textContent = 'Show';
      $('setupKeyToggle').setAttribute('aria-label', 'Show API key');
    }
  }
}
