// Settings → "Favorite models": the models offered in the side panel's quick
// switcher. Adding and removing write at once (no Save needed).
import { DiscourseCopilotConstants } from '../shared/constants.js';
import {
  MAX_FAVORITE_MODELS,
  addFavoriteModel,
  favoriteModelKey,
  hasFavoriteModel,
  removeFavoriteModel
} from '../shared/favorite-models.mjs';

const { PROVIDER_CONFIGS } = DiscourseCopilotConstants;
const $ = id => document.getElementById(id);

export class FavoritesSection {
  /**
   * @param {object} deps
   * @param {object} deps.store ConfigStore
   * @param {() => boolean} deps.isBusy
   * @param {(message: string, type?: string, autoHide?: boolean) => void} deps.notify
   */
  constructor({ store, isBusy, notify }) {
    this.store = store;
    this.isBusy = isBusy;
    this.notify = notify;
  }

  // The favorite the "Add current model" button would add.
  currentFavorite() {
    const provider = this.store.draft.provider;
    return { provider, model: this.store.draftSettings(provider).model || '' };
  }

  mount() {
    $('addFavoriteBtn').addEventListener('click', () => {
      void this.addCurrent();
    });
  }

  render() {
    const list = $('favoriteModelList');
    const empty = $('favoriteModelEmpty');
    const addButton = $('addFavoriteBtn');
    if (!list || !empty || !addButton) return;

    const favorites = this.store.config.favorites;
    const current = this.currentFavorite();
    const alreadyFavorite = hasFavoriteModel(favorites, current, PROVIDER_CONFIGS);
    const atFavoriteLimit = favorites.length >= MAX_FAVORITE_MODELS;
    addButton.textContent = alreadyFavorite
      ? 'Already a favorite'
      : atFavoriteLimit
        ? 'Favorite limit reached'
        : 'Add current model';
    addButton.disabled =
      this.isBusy() || !current.model.trim() || alreadyFavorite || atFavoriteLimit;

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
      remove.disabled = this.isBusy();
      remove.setAttribute('aria-label', `Remove ${favorite.model} from favorite models`);
      remove.addEventListener('click', () => {
        void this.remove(favorite, remove);
      });

      item.append(copy, remove);
      list.appendChild(item);
    }
  }

  async addCurrent() {
    const favorites = this.store.config.favorites;
    const favorite = this.currentFavorite();
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
      this.render();
      this.notify('Favorite model added. It is now available in the quick switcher.', 'success');
    } catch (error) {
      console.error('DiscourseCopilot Settings: Unable to add favorite model:', error);
      this.render();
      this.notify(`Could not save favorite: ${error.message}`, 'error', false);
    }
  }

  async remove(favorite, button) {
    button.disabled = true;
    button.textContent = 'Removing…';
    try {
      await this.store.setFavorites(
        removeFavoriteModel(this.store.config.favorites, favorite, PROVIDER_CONFIGS)
      );
      this.render();
      this.notify('Favorite model removed.', 'success');
    } catch (error) {
      console.error('DiscourseCopilot Settings: Unable to remove favorite model:', error);
      this.render();
      this.notify(`Could not remove favorite: ${error.message}`, 'error', false);
    }
  }
}
