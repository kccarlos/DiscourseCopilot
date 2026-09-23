// The header's provider line ("OpenAI · gpt-4o-mini" or "Not set up"), the
// favorite-model quick switcher, and which parts of the topic view the
// configuration status shows (setup card vs. welcome panel).
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { favoriteModelKey } from '../shared/favorite-models.mjs';

const $ = id => document.getElementById(id);

export class ProviderHeader {
  /**
   * @param {object} deps
   * @param {object} deps.config ConfigStore
   * @param {object} deps.status StatusLine
   * @param {object} deps.setupCard SetupCard
   * @param {() => void} deps.onSetupJump "Not set up" was pressed
   */
  constructor({ config, status, setupCard, onSetupJump }) {
    this.config = config;
    this.status = status;
    this.setupCard = setupCard;
    this.onSetupJump = onSetupJump;
  }

  mount() {
    $('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    $('setupJumpBtn').addEventListener('click', () => {
      this.onSetupJump();
    });
    $('favoriteModelSelect').addEventListener('change', event => {
      void this.switchFavoriteModel(event.target.value);
    });
  }

  render() {
    const { status } = this.config;
    $('currentProvider').textContent = status.providerName;
    $('currentModel').textContent = this.config.activeSettings.model || 'No model selected';
    this.renderFavorites();
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
    $('providerContext').classList.toggle('hidden', needsSetup);
    $('setupJumpBtn').classList.toggle('hidden', !needsSetup);
    $('favoriteModelSelect').classList.toggle(
      'hidden',
      needsSetup && this.config.config.favorites.length === 0
    );
  }

  renderFavorites() {
    const select = $('favoriteModelSelect');
    if (!select) return;

    const favorites = this.config.config.favorites;
    const currentKey = favoriteModelKey(
      this.config.config.provider,
      this.config.activeSettings.model || ''
    );
    const hasCurrentFavorite = favorites.some(
      favorite => favoriteModelKey(favorite.provider, favorite.model) === currentKey
    );
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = favorites.length
      ? 'Switch favorite model…'
      : 'No favorite models yet';
    placeholder.disabled = favorites.length > 0;
    placeholder.selected = !hasCurrentFavorite;

    const options = favorites.map(favorite => {
      const option = document.createElement('option');
      option.value = favoriteModelKey(favorite.provider, favorite.model);
      option.textContent = `${this.config.providerName(favorite.provider)} · ${favorite.model}`;
      option.selected = option.value === currentKey;
      return option;
    });
    select.replaceChildren(placeholder, ...options);
    select.disabled = favorites.length === 0;
    select.title = favorites.length
      ? 'Switch the AI provider and model'
      : 'Add favorite models in Settings';
  }

  async switchFavoriteModel(key) {
    const favorite = this.config.config.favorites.find(
      item => favoriteModelKey(item.provider, item.model) === key
    );
    if (!favorite) {
      this.renderFavorites();
      return;
    }

    $('favoriteModelSelect').disabled = true;
    try {
      // The store notifies the panel, which re-renders the header.
      await this.config.setActiveModel(favorite.provider, favorite.model);
      this.status.show(`Using ${this.config.providerName(favorite.provider)} · ${favorite.model}`, 'success');
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to switch favorite model:', error);
      this.renderFavorites();
      this.status.show(`Unable to switch model: ${error.message}`, 'error');
    }
  }
}
