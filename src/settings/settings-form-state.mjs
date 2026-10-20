// The settings page form as an explicit state machine. The page dispatches
// events; the status line, the "Unsaved changes" indicator and whether the
// buttons are disabled are all derived from the resulting state.
//
//   loading ──▶ pristine ──edit──▶ dirty ──Save──▶ saving ──▶ saved ──edit──▶ dirty
//                  └───────Test───────┴──▶ testing ──▶ pristine | dirty
//
//   phase        event             next phase
//   loading      loaded            pristine
//   loading      load-failed       error
//   (idle)       edited            dirty     (busy phases keep their phase;
//                                            `field` + `fieldError` set or
//                                            clear that field's inline error)
//   (idle)       defaults-restored dirty     ("Restore defaults" on a section:
//                                            a draft edit, saved with Save)
//   (idle)       invalid           invalid   (Save/Test with field errors;
//                                            `fieldErrors` shown inline)
//   any          field-errors      (inline errors of `fields` only; a
//                                            field checked on blur, or errors
//                                            re-derived after an edit)
//   (idle)       test-started      testing
//   testing      test-passed       pristine, or dirty when there are edits
//   testing      test-failed       error
//   (idle)       save-started      saving
//   saving       save-succeeded    saved, or dirty when edited during the save
//   saving       save-failed       error
//   (idle)       reset-requested   (same phase; `confirmingReset` shows the
//                                            inline "Reset everything?" panel)
//   any          reset-cancelled   (closes that panel)
//   (idle)       reset-started     resetting (only from the panel)
//   resetting    reset-succeeded   pristine
//   resetting    reset-failed      error
//   any          notice/clear-status  (status line only)
//
//   (idle) = pristine, dirty, invalid, saved or error. The busy phases
//   (loading, testing, saving, resetting) disable the buttons.
//
// `edited` tracks unsaved edits independently of the phase: edits made while
// a save is in flight keep the form dirty after that save succeeds.
//
// `confirmingReset` is the explicit confirmation "Reset all settings" needs:
// reset-started is ignored unless it is set, and starting anything else
// (an edit, Test, Save, "Restore defaults") closes it.
//
// `fieldErrors` ({ field: message }) holds the inline errors. Save is
// blocked while any remain (canSave); fixing a field clears only its error.
//
//                     edit with an error ─┐
//   pristine ──edit──▶ dirty ◀──fix──── dirty + fieldErrors ──Save──▶ invalid
//                        │                                       (nothing written)
//                        └──Save──▶ saving ──▶ saved | dirty | error

import { t } from '../shared/i18n.mjs';

export const FORM_PHASE = Object.freeze({
  LOADING: 'loading',
  PRISTINE: 'pristine',
  DIRTY: 'dirty',
  INVALID: 'invalid',
  TESTING: 'testing',
  SAVING: 'saving',
  SAVED: 'saved',
  RESETTING: 'resetting',
  ERROR: 'error'
});

const BUSY_PHASES = new Set([FORM_PHASE.LOADING, FORM_PHASE.TESTING, FORM_PHASE.SAVING, FORM_PHASE.RESETTING]);

export const WELCOME_SAVED_MESSAGE = t('settings.status.welcomeSaved');

// status: null (hidden) or { message, type: info|success|error, autoHide }.
function status(message, type = 'info', autoHide = type === 'success') {
  return { message, type, autoHide };
}

export function initialFormState() {
  return {
    phase: FORM_PHASE.LOADING,
    edited: false,
    revision: 0,
    savingRevision: null,
    fieldErrors: {},
    confirmingReset: false,
    status: status(t('settings.status.loadingSaved'), 'info', false)
  };
}

export function hasFieldErrors(state) {
  return Object.keys(state.fieldErrors || {}).length > 0;
}

// Save is possible when idle and no field shows an error.
export function canSave(state) {
  return !isFormBusy(state) && !hasFieldErrors(state);
}

function withFieldError(fieldErrors = {}, field, message) {
  if (!field) return fieldErrors;
  const next = { ...fieldErrors };
  if (message) {
    next[field] = message;
  } else {
    delete next[field];
  }
  return next;
}

export function isFormBusy(state) {
  return BUSY_PHASES.has(state.phase);
}

function restingPhase(state) {
  return state.edited ? FORM_PHASE.DIRTY : FORM_PHASE.PRISTINE;
}

/**
 * @param {ReturnType<typeof initialFormState>} state
 * @param {{type: string} & Record<string, any>} event
 */
export function transitionForm(state, event) {
  switch (event.type) {
    case 'loaded':
      return {
        ...state,
        phase: FORM_PHASE.PRISTINE,
        edited: false,
        fieldErrors: {},
        // First install (?welcome=1) starts with a quiet form.
        status: event.welcomeMode ? null : status(t('settings.status.loaded'), 'success')
      };
    case 'load-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        status: status(t('settings.status.loadFailed', { error: event.message }), 'error', false)
      };
    case 'edited': {
      const fieldErrors = withFieldError(state.fieldErrors, event.field, event.fieldError);
      const fixedLast = state.phase === FORM_PHASE.INVALID && !Object.keys(fieldErrors).length;
      return {
        ...state,
        phase: isFormBusy(state) ? state.phase : FORM_PHASE.DIRTY,
        edited: true,
        revision: state.revision + 1,
        fieldErrors,
        confirmingReset: false,
        // Switching provider or language clears the status; typing does not,
        // except that fixing the last invalid field clears the error message.
        status: event.clearStatus || fixedLast ? null : state.status
      };
    }
    case 'defaults-restored':
      return {
        ...state,
        phase: isFormBusy(state) ? state.phase : FORM_PHASE.DIRTY,
        edited: true,
        confirmingReset: false,
        revision: state.revision + 1,
        fieldErrors: Object.fromEntries(Object.entries(state.fieldErrors || {}).filter(([field]) => !(event.fields || []).includes(field))),
        status: status(t('settings.restore.done', { section: event.section || t('settings.restore.fallbackSection') }), 'info', false)
      };
    case 'field-errors': {
      const fieldErrors = { ...(state.fieldErrors || {}) };
      for (const field of event.fields || []) {
        if (event.fieldErrors?.[field]) {
          fieldErrors[field] = event.fieldErrors[field];
        } else {
          delete fieldErrors[field];
        }
      }
      const fixedLast = state.phase === FORM_PHASE.INVALID && !Object.keys(fieldErrors).length;
      return {
        ...state,
        phase: fixedLast ? restingPhase(state) : state.phase,
        fieldErrors,
        status: fixedLast ? null : state.status
      };
    }
    case 'invalid':
      return {
        ...state,
        phase: FORM_PHASE.INVALID,
        fieldErrors: { ...(event.fieldErrors || {}) },
        status: status(event.errors.join(' '), 'error', false)
      };
    case 'test-started':
      return {
        ...state,
        phase: FORM_PHASE.TESTING,
        confirmingReset: false,
        status: status(t('settings.status.testing', { name: event.providerName }), 'info', false)
      };
    case 'test-passed':
      return {
        ...state,
        phase: restingPhase(state),
        status: status(t('settings.status.testPassed', { name: event.providerName }), 'success')
      };
    case 'test-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        status: status(t('settings.status.testFailed', { error: event.message }), 'error', false)
      };
    case 'save-started':
      return {
        ...state,
        phase: FORM_PHASE.SAVING,
        confirmingReset: false,
        savingRevision: state.revision,
        status: status(t('settings.status.saving'), 'info', false)
      };
    case 'save-succeeded': {
      const edited = state.revision !== state.savingRevision;
      return {
        ...state,
        phase: edited ? FORM_PHASE.DIRTY : FORM_PHASE.SAVED,
        edited,
        savingRevision: null,
        fieldErrors: {},
        status: event.welcomeMode ? status(WELCOME_SAVED_MESSAGE, 'success', false) : status(t('settings.status.saved'), 'success')
      };
    }
    case 'save-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        savingRevision: null,
        status: status(t('settings.status.saveFailed', { error: event.message }), 'error', false)
      };
    case 'reset-requested':
      return isFormBusy(state) || state.confirmingReset ? state : { ...state, confirmingReset: true, status: null };
    case 'reset-cancelled':
      return state.confirmingReset ? { ...state, confirmingReset: false } : state;
    case 'reset-started':
      // Only the confirmation panel's "Reset everything" starts a reset.
      if (!state.confirmingReset || isFormBusy(state)) {
        return state;
      }
      return {
        ...state,
        phase: FORM_PHASE.RESETTING,
        confirmingReset: false,
        status: status(t('settings.status.resetting'), 'info', false)
      };
    case 'reset-succeeded':
      return {
        ...state,
        phase: FORM_PHASE.PRISTINE,
        edited: false,
        revision: state.revision + 1,
        fieldErrors: {},
        status: status(t('settings.status.resetDone'), 'success')
      };
    case 'reset-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        status: status(t('settings.status.resetFailed', { error: event.message }), 'error', false)
      };
    // Messages that don't change the form (favorites, model suggestions).
    case 'notice':
      return {
        ...state,
        status: status(event.message, event.statusType || 'info', event.autoHide ?? event.statusType === 'success')
      };
    case 'clear-status':
      return state.status ? { ...state, status: null } : state;
    default:
      return state;
  }
}

/**
 * The save bar's summary of the form (a short label and a tone for styling).
 * @returns {{ text: string, tone: 'neutral'|'dirty'|'busy'|'success'|'error' }}
 */
export function formStateLabel(state, hasSavedConfiguration) {
  switch (state.phase) {
    case FORM_PHASE.LOADING:
      return { text: t('settings.formState.loading'), tone: 'busy' };
    case FORM_PHASE.SAVING:
      return { text: t('settings.formState.saving'), tone: 'busy' };
    case FORM_PHASE.TESTING:
      return { text: t('settings.formState.testing'), tone: 'busy' };
    case FORM_PHASE.RESETTING:
      return { text: t('settings.formState.resetting'), tone: 'busy' };
    case FORM_PHASE.INVALID:
      return { text: t('settings.formState.fixFields'), tone: 'error' };
    case FORM_PHASE.ERROR:
      return state.edited
        ? { text: t('settings.formState.unsavedFailed'), tone: 'error' }
        : { text: t('settings.formState.failed'), tone: 'error' };
    default:
  }
  if (hasFieldErrors(state)) {
    return { text: t('settings.formState.fixFields'), tone: 'error' };
  }
  if (state.edited) {
    return { text: t('settings.formState.unsaved'), tone: 'dirty' };
  }
  if (state.phase === FORM_PHASE.SAVED) {
    return { text: t('settings.formState.saved'), tone: 'success' };
  }
  return hasSavedConfiguration
    ? { text: t('settings.formState.allSaved'), tone: 'neutral' }
    : { text: t('settings.formState.notSetUp'), tone: 'neutral' };
}

// "All changes saved" would be misleading before anything usable is saved.
export function dirtyIndicatorText(state, hasSavedConfiguration) {
  if (state.edited) return t('settings.formState.unsaved');
  return hasSavedConfiguration ? t('settings.formState.allSaved') : '';
}
