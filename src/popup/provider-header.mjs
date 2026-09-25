// The header's model switcher (the active "Provider · model", as a favorite
// quick switcher or a chip that opens Settings; "Not set up" before setup) and
// which parts of the topic view the configuration status shows (setup card vs.
// welcome panel).
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { favoriteModelKey } from '../shared/favorite-models.mjs';

const $ = id => document.getElementById(id);

export const MODEL_SWITCHER_HINT = 'Add favorite models in Settings to switch quickly';

/**
 * What the header's model switcher shows. Pure: derived from the config.
 *
 * - `select`: favorites exist; the select lists them with the active model
 *   selected (prepended when it isn't a favorite).
 * - `chip`: no favorites; a static chip names the active model and opens
 *   Settings.
 * - `setup`: no usable provider; "Not set up" replaces the chip, and the
 *   select still shows when favorites exist so one can be picked.
 *
 * @param {object} input
 * @param {boolean} input.ready
 * @param {string} input.provider active provider id
 * @param {string} input.model active model ('' when none)
 * @param {{provider: string, model: string}[]} input.favorites
 * @param {(provider: string) => string} input.providerName
 */
export function deriveModelSwitcher({ ready, provider, model, favorites, providerName }) {
  const labelOf = (id, name) => `${providerName(id)} · ${name || 'No model selected'}`;
  const label = labelOf(provider, model);
  const currentKey = favoriteModelKey(provider, model || '');
  const hasFavorites = favorites.length > 0;
  const mode = !ready ? 'setup' : hasFavorites ? 'select' : 'chip';

  let options = favorites.map(favorite => {
    const value = favoriteModelKey(favorite.provider, favorite.model);
    return { value, label: labelOf(favorite.provider, favorite.model), selected: value === currentKey };
  });
  let selectedValue = options.find(option => option.selected)?.value || '';
  if (hasFavorites && !selectedValue) {
    if (ready) {
      // The active model isn't a favorite: still name it, as the selection.
      options = [{ value: currentKey, label, selected: true }, ...options];
      selectedValue = currentKey;
    } else {
      options = [{ value: '', label: 'Choose a favorite model…', selected: true, disabled: true }, ...options];
    }
  }

  return {
    mode,
    showSetupJump: mode === 'setup',
    showSelect: hasFavorites,
    showChip: mode === 'chip',
    label,
    options,
    selectedValue,
    selectTitle: mode === 'select' ? `${label}\nSwitch to another favorite model` : 'Switch to a favorite model',
    selectAriaLabel: mode === 'select' ? `AI model: ${label}. Switch favorite model` : 'Switch to a favorite model',
    chipTitle: `${label}\n${MODEL_SWITCHER_HINT}`,
    chipAriaLabel: `AI model: ${label}. Open AI provider settings`
  };
}

export class ProviderHeader {
  /**
   * @param {object} deps
   * @param {object} deps.config ConfigStore
   * @param {object} deps.status StatusLine
   * @param {object} deps.setupCard SetupCard
   * @param {() => void} deps.onSetupJump "Not set up" was pressed
   * @param {() => void} deps.openSettings open the settings page
   */
  constructor({ config, status, setupCard, onSetupJump, openSettings }) {
    this.config = config;
    this.status = status;
    this.setupCard = setupCard;
    this.onSetupJump = onSetupJump;
    this.openSettings = openSettings;
  }

  mount() {
    $('settingsBtn').addEventListener('click', () => {
      this.openSettings();
    });
    $('modelChipBtn').addEventListener('click', () => {
      // The AI provider section is the top of the settings page.
      this.openSettings();
    });
    $('setupJumpBtn').addEventListener('click', () => {
      this.onSetupJump();
    });
    $('favoriteModelSelect').addEventListener('change', event => {
      void this.switchFavoriteModel(event.target.value);
    });
  }

  render() {
    this.renderSwitcher();
  }

  switcherState() {
    return deriveModelSwitcher({
      ready: this.config.isReady(),
      provider: this.config.config.provider,
      model: this.config.activeSettings.model || '',
      favorites: this.config.config.favorites,
      providerName: provider => this.config.providerName(provider)
    });
  }

  // The one writer of the switcher's controls and their visibility.
  renderSwitcher() {
    const view = this.switcherState();
    const select = $('favoriteModelSelect');
    const chip = $('modelChipBtn');

    const options = view.options.map(item => {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      option.selected = item.selected;
      option.disabled = Boolean(item.disabled);
      return option;
    });
    select.replaceChildren(...options);
    select.value = view.selectedValue;
    select.disabled = false;
    select.title = view.selectTitle;
    select.setAttribute('aria-label', view.selectAriaLabel);
    select.classList.toggle('hidden', !view.showSelect);

    $('modelChipLabel').textContent = view.label;
    chip.title = view.chipTitle;
    chip.setAttribute('aria-label', view.chipAriaLabel);
    chip.classList.toggle('hidden', !view.showChip);

    $('setupJumpBtn').classList.toggle('hidden', !view.showSetupJump);
  }

  // While no provider is usable, the setup card replaces the welcome panel and
  // the header says "Not set up" instead of a provider and model.
  renderSetupState() {
    const needsSetup = !this.config.isReady();
    const card = this.setupCard;
    if (needsSetup && (card.state === 'done' || card.state === 'success')) {
      card.reopen();
    }
    if (needsSetup) {
      void card.prepare({ savedProvider: this.config.config.providerChoice });
    }
    const showCard = needsSetup || card.showsSuccess;
    $('topicView').classList.toggle('needs-setup', needsSetup);
    $('setupCard').classList.toggle('hidden', !showCard);
    this.renderSwitcher();
  }

  async switchFavoriteModel(key) {
    const favorite = this.config.config.favorites.find(item => favoriteModelKey(item.provider, item.model) === key);
    if (!favorite) {
      this.renderSwitcher();
      return;
    }

    $('favoriteModelSelect').disabled = true;
    try {
      // The store notifies the panel, which re-renders the header.
      await this.config.setActiveModel(favorite.provider, favorite.model);
      this.status.show(`Using ${this.config.providerName(favorite.provider)} · ${favorite.model}`, 'success');
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to switch favorite model:', error);
      this.renderSwitcher();
      this.status.show(`Unable to switch model: ${error.message}`, 'error');
    }
  }
}
