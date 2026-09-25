import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORM_PHASE,
  WELCOME_SAVED_MESSAGE,
  canSave,
  dirtyIndicatorText,
  formStateLabel,
  hasFieldErrors,
  initialFormState,
  isFormBusy,
  transitionForm
} from '../src/settings/settings-form-state.mjs';

const run = (events, state = initialFormState()) => events.reduce((current, event) => transitionForm(current, event), state);

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
  const dirtyPassed = run(
    [{ type: 'edited' }, { type: 'test-started', providerName: 'X' }, { type: 'test-passed', providerName: 'X' }],
    passed
  );
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
  const resetting = run([{ type: 'loaded' }, { type: 'edited' }, { type: 'reset-requested' }, { type: 'reset-started' }]);
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

// ---------- inline field errors (preferences) ----------

function pristineForm() {
  return transitionForm(initialFormState(), { type: 'loaded' });
}

test('an edit can set or clear one field error; save is blocked while any remain', () => {
  let state = transitionForm(pristineForm(), { type: 'edited', field: 'topicPageLimit', fieldError: 'Too big' });
  assert.equal(state.phase, FORM_PHASE.DIRTY);
  assert.deepEqual(state.fieldErrors, { topicPageLimit: 'Too big' });
  assert.equal(hasFieldErrors(state), true);
  assert.equal(canSave(state), false);
  assert.deepEqual(formStateLabel(state, true), { text: 'Fix the highlighted fields', tone: 'error' });
  state = transitionForm(state, { type: 'edited', field: 'topicPageLimit', fieldError: '' });
  assert.deepEqual(state.fieldErrors, {});
  assert.equal(canSave(state), true);
  assert.deepEqual(formStateLabel(state, true), { text: 'Unsaved changes', tone: 'dirty' });
});

test('invalid carries field errors; fixing the last one returns to dirty and clears the message', () => {
  let state = transitionForm(pristineForm(), { type: 'edited' });
  state = transitionForm(state, {
    type: 'invalid',
    errors: ['A is bad.', 'B is bad.'],
    fieldErrors: { searchQueries: 'A is bad.', topicsRead: 'B is bad.' }
  });
  assert.equal(state.phase, FORM_PHASE.INVALID);
  assert.equal(state.status.message, 'A is bad. B is bad.');
  state = transitionForm(state, { type: 'field-errors', fields: ['searchQueries'], fieldErrors: {} });
  assert.equal(state.phase, FORM_PHASE.INVALID);
  assert.deepEqual(Object.keys(state.fieldErrors), ['topicsRead']);
  state = transitionForm(state, { type: 'field-errors', fields: ['topicsRead'], fieldErrors: {} });
  assert.equal(state.phase, FORM_PHASE.DIRTY);
  assert.equal(state.status, null);
});

test('field-errors only touches the listed fields and never the phase otherwise', () => {
  let state = transitionForm(pristineForm(), {
    type: 'field-errors',
    fields: ['maxSavedTopics'],
    fieldErrors: { maxSavedTopics: 'x', other: 'y' }
  });
  assert.equal(state.phase, FORM_PHASE.PRISTINE);
  assert.deepEqual(state.fieldErrors, { maxSavedTopics: 'x' });
});

test('restoring a section to defaults is an edit that clears that section’s errors', () => {
  let state = transitionForm(pristineForm(), { type: 'edited', field: 'topicsRead', fieldError: 'bad' });
  state = transitionForm(state, { type: 'edited', field: 'maxSavedTopics', fieldError: 'bad' });
  state = transitionForm(state, { type: 'defaults-restored', section: 'Ask the forum', fields: ['topicsRead'] });
  assert.equal(state.phase, FORM_PHASE.DIRTY);
  assert.equal(state.edited, true);
  assert.deepEqual(Object.keys(state.fieldErrors), ['maxSavedTopics']);
  assert.equal(state.status.message, 'Ask the forum restored to defaults. Save to apply.');
});

test('save and reset clear field errors', () => {
  let state = transitionForm(pristineForm(), { type: 'edited', field: 'topicsRead', fieldError: 'bad' });
  state = transitionForm(state, { type: 'save-started' });
  assert.equal(canSave(state), false, 'busy');
  state = transitionForm(state, { type: 'save-succeeded' });
  assert.deepEqual(state.fieldErrors, {});
  assert.deepEqual(formStateLabel(state, true), { text: 'Saved', tone: 'success' });
  state = transitionForm(state, { type: 'edited', field: 'topicsRead', fieldError: 'bad' });
  state = run([{ type: 'reset-requested' }, { type: 'reset-started' }, { type: 'reset-succeeded' }], state);
  assert.deepEqual(state.fieldErrors, {});
});

test('a reset needs the explicit confirmation', () => {
  const pristine = pristineForm();
  assert.equal(pristine.confirmingReset, false);
  // Without the confirmation panel, reset-started does nothing.
  assert.equal(transitionForm(pristine, { type: 'reset-started' }), pristine);

  const confirming = transitionForm(pristine, { type: 'reset-requested' });
  assert.equal(confirming.confirmingReset, true);
  assert.equal(confirming.phase, FORM_PHASE.PRISTINE, 'asking is not a phase');
  assert.equal(confirming.status, null);
  assert.equal(isFormBusy(confirming), false);
  assert.equal(transitionForm(confirming, { type: 'reset-requested' }), confirming);

  const cancelled = transitionForm(confirming, { type: 'reset-cancelled' });
  assert.equal(cancelled.confirmingReset, false);
  assert.equal(transitionForm(cancelled, { type: 'reset-started' }), cancelled);

  const resetting = transitionForm(confirming, { type: 'reset-started' });
  assert.equal(resetting.phase, FORM_PHASE.RESETTING);
  assert.equal(resetting.confirmingReset, false);
});

test('starting anything else closes the reset confirmation; busy forms cannot open it', () => {
  const confirming = transitionForm(pristineForm(), { type: 'reset-requested' });
  for (const event of [
    { type: 'edited' },
    { type: 'defaults-restored', section: 'Reading topics', fields: [] },
    { type: 'test-started', providerName: 'X' },
    { type: 'save-started' }
  ]) {
    assert.equal(transitionForm(confirming, event).confirmingReset, false, event.type);
  }
  const saving = transitionForm(pristineForm(), { type: 'save-started' });
  assert.equal(transitionForm(saving, { type: 'reset-requested' }), saving);
  // Notices (favorites, model lists) leave it open.
  assert.equal(transitionForm(confirming, { type: 'notice', message: 'x' }).confirmingReset, true);
});

test('the save bar label follows every phase', () => {
  assert.equal(formStateLabel(initialFormState(), false).tone, 'busy');
  const pristine = pristineForm();
  assert.deepEqual(formStateLabel(pristine, true), { text: 'All changes saved', tone: 'neutral' });
  assert.deepEqual(formStateLabel(pristine, false), { text: 'Not set up yet', tone: 'neutral' });
  const saving = transitionForm(transitionForm(pristine, { type: 'edited' }), { type: 'save-started' });
  assert.deepEqual(formStateLabel(saving, true), { text: 'Saving…', tone: 'busy' });
  const failed = transitionForm(saving, { type: 'save-failed', message: 'x' });
  assert.deepEqual(formStateLabel(failed, true), { text: 'Unsaved changes · last action failed', tone: 'error' });
  assert.equal(formStateLabel(transitionForm(pristine, { type: 'test-started', providerName: 'X' }), true).text, 'Testing connection…');
});
