import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscourseCopilotConstants } from '../src/shared/constants.js';
import {
  MAX_FAVORITE_MODELS,
  addFavoriteModel,
  favoriteModelKey,
  hasFavoriteModel,
  normalizeFavoriteModels,
  removeFavoriteModel
} from '../src/shared/favorite-models.mjs';

const configs = DiscourseCopilotConstants.PROVIDER_CONFIGS;

test('normalizes, deduplicates, and validates provider-model favorites', () => {
  assert.deepEqual(normalizeFavoriteModels([
    { provider: ' openai ', model: ' gpt-5 ' },
    { provider: 'openai', model: 'gpt-5' },
    { provider: 'missing', model: 'model' },
    { provider: 'anthropic', model: '' },
    null
  ], configs), [
    { provider: 'openai', model: 'gpt-5' }
  ]);
});

test('adds, detects, and removes favorites without conflating providers', () => {
  let favorites = addFavoriteModel([], {
    provider: 'openai',
    model: 'shared-name'
  }, configs);
  favorites = addFavoriteModel(favorites, {
    provider: 'openrouter',
    model: 'shared-name'
  }, configs);

  assert.equal(favorites.length, 2);
  assert.equal(hasFavoriteModel(favorites, favorites[0], configs), true);
  assert.notEqual(
    favoriteModelKey('openai', 'shared-name'),
    favoriteModelKey('openrouter', 'shared-name')
  );

  assert.deepEqual(removeFavoriteModel(
    favorites,
    { provider: 'openai', model: 'shared-name' },
    configs
  ), [
    { provider: 'openrouter', model: 'shared-name' }
  ]);
});

test('does not evict existing favorites when the list reaches its limit', () => {
  const favorites = Array.from({ length: MAX_FAVORITE_MODELS }, (_, index) => ({
    provider: 'openai',
    model: `model-${index}`
  }));

  assert.deepEqual(addFavoriteModel(
    favorites,
    { provider: 'openai', model: 'one-too-many' },
    configs
  ), favorites);
});
