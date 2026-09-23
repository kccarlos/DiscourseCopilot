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
//   (idle)       edited            dirty     (busy phases keep their phase)
//   (idle)       invalid           invalid   (Save/Test with field errors)
//   (idle)       test-started      testing
//   testing      test-passed       pristine, or dirty when there are edits
//   testing      test-failed       error
//   (idle)       save-started      saving
//   saving       save-succeeded    saved, or dirty when edited during the save
//   saving       save-failed       error
//   (idle)       reset-started     resetting
//   resetting    reset-succeeded   pristine
//   resetting    reset-failed      error
//   any          notice/clear-status  (status line only)
//
//   (idle) = pristine, dirty, invalid, saved or error. The busy phases
//   (loading, testing, saving, resetting) disable the buttons.
//
// `edited` tracks unsaved edits independently of the phase: edits made while
// a save is in flight keep the form dirty after that save succeeds.

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

const BUSY_PHASES = new Set([
  FORM_PHASE.LOADING,
  FORM_PHASE.TESTING,
  FORM_PHASE.SAVING,
  FORM_PHASE.RESETTING
]);

export const WELCOME_SAVED_MESSAGE =
  'Settings saved. You’re set — open any Discourse topic and press Create summary in the DiscourseCopilot side panel.';

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
    status: status('Loading saved settings…', 'info', false)
  };
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
        // First install (?welcome=1) starts with a quiet form.
        status: event.welcomeMode ? null : status('Settings loaded.', 'success')
      };
    case 'load-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        status: status(`Could not load saved settings: ${event.message}`, 'error', false)
      };
    case 'edited':
      return {
        ...state,
        phase: isFormBusy(state) ? state.phase : FORM_PHASE.DIRTY,
        edited: true,
        revision: state.revision + 1,
        // Switching provider or language clears the status; typing does not.
        status: event.clearStatus ? null : state.status
      };
    case 'invalid':
      return {
        ...state,
        phase: FORM_PHASE.INVALID,
        status: status(event.errors.join(' '), 'error', false)
      };
    case 'test-started':
      return {
        ...state,
        phase: FORM_PHASE.TESTING,
        status: status(`Testing ${event.providerName}…`, 'info', false)
      };
    case 'test-passed':
      return {
        ...state,
        phase: restingPhase(state),
        status: status(`${event.providerName} connection successful.`, 'success')
      };
    case 'test-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        status: status(`Connection failed: ${event.message}`, 'error', false)
      };
    case 'save-started':
      return {
        ...state,
        phase: FORM_PHASE.SAVING,
        savingRevision: state.revision,
        status: status('Saving settings…', 'info', false)
      };
    case 'save-succeeded': {
      const edited = state.revision !== state.savingRevision;
      return {
        ...state,
        phase: edited ? FORM_PHASE.DIRTY : FORM_PHASE.SAVED,
        edited,
        savingRevision: null,
        status: event.welcomeMode
          ? status(WELCOME_SAVED_MESSAGE, 'success', false)
          : status('Settings saved successfully.', 'success')
      };
    }
    case 'save-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        savingRevision: null,
        status: status(`Could not save settings: ${event.message}`, 'error', false)
      };
    case 'reset-started':
      return {
        ...state,
        phase: FORM_PHASE.RESETTING,
        status: status('Resetting settings…', 'info', false)
      };
    case 'reset-succeeded':
      return {
        ...state,
        phase: FORM_PHASE.PRISTINE,
        edited: false,
        revision: state.revision + 1,
        status: status('Settings reset to defaults.', 'success')
      };
    case 'reset-failed':
      return {
        ...state,
        phase: FORM_PHASE.ERROR,
        status: status(`Could not reset settings: ${event.message}`, 'error', false)
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

// "All changes saved" would be misleading before anything usable is saved.
export function dirtyIndicatorText(state, hasSavedConfiguration) {
  if (state.edited) return 'Unsaved changes';
  return hasSavedConfiguration ? 'All changes saved' : '';
}
