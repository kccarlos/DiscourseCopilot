import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveModelSwitcher, MODEL_SWITCHER_HINT } from '../src/popup/provider-header.mjs';
import { favoriteModelKey } from '../src/shared/favorite-models.mjs';

const NAMES = { openai: 'OpenAI', anthropic: 'Anthropic', ollama: 'Ollama' };
const base = {
  ready: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  favorites: [],
  providerName: id => NAMES[id] || id
};

test('without favorites the switcher is a chip naming the active provider and model', () => {
  const view = deriveModelSwitcher(base);
  assert.equal(view.mode, 'chip');
  assert.equal(view.showChip, true);
  assert.equal(view.showSelect, false);
  assert.equal(view.showSetupJump, false);
  assert.equal(view.label, 'OpenAI · gpt-4o-mini');
  assert.match(view.chipTitle, /OpenAI · gpt-4o-mini/);
  assert.ok(view.chipTitle.includes(MODEL_SWITCHER_HINT));
  assert.match(view.chipAriaLabel, /OpenAI · gpt-4o-mini/);
  assert.ok(!JSON.stringify(view).includes('No favorite models yet'));
});

test('with favorites the select shows the active favorite as selected', () => {
  const favorites = [
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'anthropic', model: 'claude-sonnet-5' }
  ];
  const view = deriveModelSwitcher({ ...base, favorites });
  assert.equal(view.mode, 'select');
  assert.equal(view.showSelect, true);
  assert.equal(view.showChip, false);
  assert.deepEqual(
    view.options.map(o => o.label),
    ['OpenAI · gpt-4o-mini', 'Anthropic · claude-sonnet-5']
  );
  assert.equal(view.selectedValue, favoriteModelKey('openai', 'gpt-4o-mini'));
  assert.equal(view.options.filter(o => o.selected).length, 1);
  assert.match(view.selectAriaLabel, /AI model: OpenAI · gpt-4o-mini/);
  assert.match(view.selectTitle, /^OpenAI · gpt-4o-mini/);
});

test('an active model that is not a favorite is prepended as the selection', () => {
  const favorites = [{ provider: 'anthropic', model: 'claude-sonnet-5' }];
  const view = deriveModelSwitcher({ ...base, model: 'gpt-5', favorites });
  assert.equal(view.options.length, 2);
  assert.equal(view.options[0].label, 'OpenAI · gpt-5');
  assert.equal(view.options[0].selected, true);
  assert.equal(view.selectedValue, favoriteModelKey('openai', 'gpt-5'));
  assert.equal(view.options[1].selected, false);
});

test('before setup the header shows "Not set up" and keeps favorites pickable', () => {
  const none = deriveModelSwitcher({ ...base, ready: false });
  assert.equal(none.mode, 'setup');
  assert.equal(none.showSetupJump, true);
  assert.equal(none.showChip, false);
  assert.equal(none.showSelect, false);

  const favorites = [{ provider: 'anthropic', model: 'claude-sonnet-5' }];
  const withFavorites = deriveModelSwitcher({ ...base, ready: false, favorites });
  assert.equal(withFavorites.showSetupJump, true);
  assert.equal(withFavorites.showSelect, true);
  assert.equal(withFavorites.options[0].disabled, true, 'a prompt, not a model');
  assert.equal(withFavorites.selectedValue, '');
  assert.equal(withFavorites.options.length, 2);
});

test('a missing model is named, and long names keep their full text for the tooltip', () => {
  assert.equal(deriveModelSwitcher({ ...base, model: '' }).label, 'OpenAI · No model selected');
  const long = 'meta-llama/llama-4-maverick-17b-128e-instruct-with-a-very-long-suffix';
  const view = deriveModelSwitcher({ ...base, provider: 'ollama', model: long });
  assert.equal(view.label, `Ollama · ${long}`);
  assert.ok(view.chipTitle.startsWith(view.label));
  assert.ok(view.chipAriaLabel.includes(long));
});
