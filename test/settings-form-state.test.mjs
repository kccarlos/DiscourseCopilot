import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORM_PHASE,
  WELCOME_SAVED_MESSAGE,
  dirtyIndicatorText,
  initialFormState,
  isFormBusy,
  transitionForm
} from '../src/settings/settings-form-state.mjs';

const run = (events, state = initialFormState()) =>
  events.reduce((current, event) => transitionForm(current, event), state);

test('starts loading and busy with a loading message', () => {
  const state = initialFormState();
  assert.equal(state.phase, FORM_PHASE.LOADING);
  assert.equal(isFormBusy(state), true);
  assert.deepEqual(state.status, { message: 'Loading saved settings…', type: 'info', autoHide: false });
});

test('loaded → pristine with an auto-hiding confirmation, or quiet in welcome mode', () => {
  const loaded = run([{ type: 'loaded' }]);
  assert.equal(loaded.phase, FORM_PHASE.PRISTINE);
  assert.equal(isFormBusy(loaded), false);
  assert.deepEqual(loaded.status, { message: 'Settings loaded.', type: 'success', autoHide: true });
  assert.equal(run([{ type: 'loaded', welcomeMode: true }]).status, null);
});

test('load-failed → error with a sticky message', () => {
  const state = run([{ type: 'load-failed', message: 'denied' }]);
  assert.equal(state.phase, FORM_PHASE.ERROR);
  assert.deepEqual(state.status, { message: 'Could not load saved settings: denied', type: 'error', autoHide: false });
});

test('edited → dirty; typing keeps the status, switching provider clears it', () => {
  const loaded = run([{ type: 'loaded' }]);
  const typed = transitionForm(loaded, { type: 'edited' });
  assert.equal(typed.phase, FORM_PHASE.DIRTY);
  assert.equal(typed.edited, true);
  assert.equal(typed.revision, 1);
  assert.equal(typed.status, loaded.status, 'same status object: no re-render or timer restart');
  const switched = transitionForm(typed, { type: 'edited', clearStatus: true });
  assert.equal(switched.status, null);
  assert.equal(switched.revision, 2);
});

test('invalid → invalid with the joined validation errors', () => {
  const state = run([{ type: 'loaded' }, { type: 'invalid', errors: ['A is required.', 'B is required.'] }]);
  assert.equal(state.phase, FORM_PHASE.INVALID);
  assert.deepEqual(state.status, { message: 'A is required. B is required.', type: 'error', autoHide: false });
  assert.equal(run([{ type: 'edited' }], state).phase, FORM_PHASE.DIRTY);
});

test('testing → passed returns to pristine or dirty', () => {
  const testing = run([{ type: 'loaded' }, { type: 'test-started', providerName: 'OpenAI' }]);
  assert.equal(testing.phase, FORM_PHASE.TESTING);
  assert.equal(isFormBusy(testing), true);
  assert.equal(testing.status.message, 'Testing OpenAI…');
  const passed = transitionForm(testing, { type: 'test-passed', providerName: 'OpenAI' });
  assert.equal(passed.phase, FORM_PHASE.PRISTINE);
  assert.deepEqual(passed.status, { message: 'OpenAI connection successful.', type: 'success', autoHide: true });
  const dirtyPassed = run([{ type: 'edited' }, { type: 'test-started', providerName: 'X' }, { type: 'test-passed', providerName: 'X' }], passed);
  assert.equal(dirtyPassed.phase, FORM_PHASE.DIRTY);
});

test('testing → failed', () => {
  const state = run([{ type: 'loaded' }, { type: 'test-started', providerName: 'OpenAI' }, { type: 'test-failed', message: 'HTTP 401' }]);
  assert.equal(state.phase, FORM_PHASE.ERROR);
  assert.deepEqual(state.status, { message: 'Connection failed: HTTP 401', type: 'error', autoHide: false });
});

test('saving → saved clears the unsaved-changes flag', () => {
  const saving = run([{ type: 'loaded' }, { type: 'edited' }, { type: 'save-started' }]);
  assert.equal(saving.phase, FORM_PHASE.SAVING);
  assert.equal(isFormBusy(saving), true);
  assert.equal(saving.status.message, 'Saving settings…');
  const saved = transitionForm(saving, { type: 'save-succeeded' });
  assert.equal(saved.phase, FORM_PHASE.SAVED);
  assert.equal(saved.edited, false);
  assert.deepEqual(saved.status, { message: 'Settings saved successfully.', type: 'success', autoHide: true });
});

test('edits made while saving keep the form dirty after the save', () => {
  const state = run([{ type: 'loaded' }, { type: 'edited' }, { type: 'save-started' }, { type: 'edited' }]);
  assert.equal(state.phase, FORM_PHASE.SAVING, 'an edit does not interrupt the save phase');
  const saved = transitionForm(state, { type: 'save-succeeded' });
  assert.equal(saved.phase, FORM_PHASE.DIRTY);
  assert.equal(saved.edited, true);
});

test('welcome mode keeps the post-save guidance on screen', () => {
  const state = run([{ type: 'loaded', welcomeMode: true }, { type: 'save-started' }, { type: 'save-succeeded', welcomeMode: true }]);
  assert.deepEqual(state.status, { message: WELCOME_SAVED_MESSAGE, type: 'success', autoHide: false });
});

test('saving → error keeps the edits', () => {
  const state = run([{ type: 'loaded' }, { type: 'edited' }, { type: 'save-started' }, { type: 'save-failed', message: 'quota' }]);
  assert.equal(state.phase, FORM_PHASE.ERROR);
  assert.equal(state.edited, true);
  assert.equal(state.status.message, 'Could not save settings: quota');
});

test('resetting → pristine discards edits; failure → error', () => {
  const resetting = run([{ type: 'loaded' }, { type: 'edited' }, { type: 'reset-started' }]);
  assert.equal(resetting.phase, FORM_PHASE.RESETTING);
  assert.equal(isFormBusy(resetting), true);
  assert.equal(resetting.status.message, 'Resetting settings…');
  const reset = transitionForm(resetting, { type: 'reset-succeeded' });
  assert.equal(reset.phase, FORM_PHASE.PRISTINE);
  assert.equal(reset.edited, false);
  assert.deepEqual(reset.status, { message: 'Settings reset to defaults.', type: 'success', autoHide: true });
  const failed = transitionForm(resetting, { type: 'reset-failed', message: 'nope' });
  assert.equal(failed.phase, FORM_PHASE.ERROR);
  assert.equal(failed.status.message, 'Could not reset settings: nope');
});

test('notices change only the status line; success notices auto-hide by default', () => {
  const dirty = run([{ type: 'loaded' }, { type: 'edited' }]);
  const notice = transitionForm(dirty, { type: 'notice', message: 'Favorite model removed.', statusType: 'success' });
  assert.equal(notice.phase, FORM_PHASE.DIRTY);
  assert.deepEqual(notice.status, { message: 'Favorite model removed.', type: 'success', autoHide: true });
  const sticky = transitionForm(dirty, { type: 'notice', message: 'x', statusType: 'error', autoHide: false });
  assert.equal(sticky.status.autoHide, false);
  const cleared = transitionForm(notice, { type: 'clear-status' });
  assert.equal(cleared.status, null);
  assert.equal(transitionForm(cleared, { type: 'clear-status' }), cleared);
});

test('unknown events leave the state untouched', () => {
  const state = initialFormState();
  assert.equal(transitionForm(state, { type: 'nope' }), state);
});

test('the dirty indicator derives from edits and the saved configuration', () => {
  const pristine = run([{ type: 'loaded' }]);
  assert.equal(dirtyIndicatorText(pristine, true), 'All changes saved');
  assert.equal(dirtyIndicatorText(pristine, false), '');
  assert.equal(dirtyIndicatorText(run([{ type: 'edited' }], pristine), false), 'Unsaved changes');
});
