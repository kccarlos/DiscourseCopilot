export const MAX_FAVORITE_MODELS = 30;

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function favoriteModelKey(provider, model) {
  return `${encodeURIComponent(provider)}::${encodeURIComponent(model)}`;
}

export function normalizeFavoriteModel(value, providerConfigs) {
  const provider = cleanString(value?.provider, 80);
  const model = cleanString(value?.model, 300);
  if (!providerConfigs?.[provider] || !model) {
    return null;
  }
  return { provider, model };
}

export function normalizeFavoriteModels(values, providerConfigs, limit = MAX_FAVORITE_MODELS) {
  if (!Array.isArray(values)) {
    return [];
  }

  const favorites = [];
  const seen = new Set();
  for (const value of values) {
    const favorite = normalizeFavoriteModel(value, providerConfigs);
    if (!favorite) continue;
    const key = favoriteModelKey(favorite.provider, favorite.model);
    if (seen.has(key)) continue;
    seen.add(key);
    favorites.push(favorite);
    if (favorites.length >= limit) break;
  }
  return favorites;
}

export function addFavoriteModel(values, value, providerConfigs) {
  const favorites = normalizeFavoriteModels(values, providerConfigs);
  const favorite = normalizeFavoriteModel(value, providerConfigs);
  if (!favorite) {
    return favorites;
  }

  const key = favoriteModelKey(favorite.provider, favorite.model);
  if (favorites.some(item => favoriteModelKey(item.provider, item.model) === key)) {
    return favorites;
  }
  if (favorites.length >= MAX_FAVORITE_MODELS) {
    return favorites;
  }
  return [...favorites, favorite];
}

export function removeFavoriteModel(values, value, providerConfigs) {
  const favorite = normalizeFavoriteModel(value, providerConfigs);
  if (!favorite) {
    return normalizeFavoriteModels(values, providerConfigs);
  }
  const key = favoriteModelKey(favorite.provider, favorite.model);
  return normalizeFavoriteModels(values, providerConfigs).filter(item => favoriteModelKey(item.provider, item.model) !== key);
}

export function hasFavoriteModel(values, value, providerConfigs) {
  const favorite = normalizeFavoriteModel(value, providerConfigs);
  if (!favorite) return false;
  const key = favoriteModelKey(favorite.provider, favorite.model);
  return normalizeFavoriteModels(values, providerConfigs).some(item => favoriteModelKey(item.provider, item.model) === key);
}
