// Settings → "Ask the forum", "Reading topics", "History & privacy" and the
// forum-button toggle (under "Forum access"): the
// preference fields, their inline errors, "Restore defaults" per section and
// the effective values shown under each section (derived from the draft the
// way the extension applies them once saved).
import { FORUM_CONTEXT_LIMIT } from '../shared/chat-context-limit.mjs';
import {
  DEFAULT_PREFERENCES,
  HISTORY_RETENTION_OPTIONS,
  POSTS_PER_RAW_PAGE,
  resolveAgentBudget,
  resolveRetention,
  validatePreferences
} from '../shared/preferences.mjs';
import { t, tn } from '../shared/i18n.mjs';

// Preference inputs (ids match the validation field names).
const CUSTOM_RESEARCH_FIELDS = ['maxSteps', 'maxTopicReads', 'maxCharsPerRead'];
export const PREFERENCE_NUMBER_FIELDS = [...CUSTOM_RESEARCH_FIELDS, 'topicPageLimit', 'maxSavedTopics', 'forumContextLimit'];
export const PREFERENCE_INPUT_IDS = new Set(PREFERENCE_NUMBER_FIELDS);

// "Restore defaults" per section: which preferences it resets.
const RESTORE_SECTIONS = {
  research: {
    label: () => t('settings.section.research'),
    keys: ['researchDepth', 'customBudget'],
    fields: CUSTOM_RESEARCH_FIELDS
  },
  reading: {
    label: () => t('settings.section.reading'),
    keys: ['topicPageMode', 'topicPageLimit'],
    fields: ['topicPageLimit', 'forumContextLimit'],
    forumContextLimit: true
  },
  history: {
    label: () => t('settings.section.history'),
    keys: ['historyRetention', 'maxSavedTopics'],
    fields: ['maxSavedTopics']
  }
};

// The retention choices' labels are English in the shared preferences module.
function retentionLabel(value, fallback) {
  switch (value) {
    case '1d':
      return t('settings.history.option.1d');
    case '3d':
      return t('settings.history.option.3d');
    case '7d':
      return t('settings.history.option.7d');
    case '30d':
      return t('settings.history.option.30d');
    case 'forever':
      return t('settings.history.option.forever');
    default:
      return fallback;
  }
}

// Renders text with **bold** segments as DOM nodes (no HTML parsing).
function setRichText(element, text) {
  element.replaceChildren(
    ...String(text)
      .split(/\*\*/)
      .map((part, index) => {
        if (index % 2 === 0) return document.createTextNode(part);
        const strong = document.createElement('strong');
        strong.textContent = part;
        return strong;
      })
  );
}

const $ = id => document.getElementById(id);

export class PreferencesSection {
  /**
   * @param {object} deps
   * @param {object} deps.store ConfigStore
   * @param {(event: object) => void} deps.dispatch form state machine events
   * @param {() => object} deps.getForm the current form state
   * @param {() => boolean} deps.isBusy
   */
  constructor({ store, dispatch, getForm, isBusy }) {
    this.store = store;
    this.dispatch = dispatch;
    this.getForm = getForm;
    this.isBusy = isBusy;
  }

  renderRetentionOptions() {
    const container = $('historyRetentionOptions');
    if (!container || container.childElementCount) return;
    container.replaceChildren(
      ...HISTORY_RETENTION_OPTIONS.map(option => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'historyRetention';
        input.value = option.value;
        const text = document.createElement('span');
        const optionLabel = retentionLabel(option.value, option.label);
        text.textContent =
          option.value === DEFAULT_PREFERENCES.historyRetention ? t('settings.history.defaultSuffix', { label: optionLabel }) : optionLabel;
        label.append(input, text);
        return label;
      })
    );
  }

  // The chat context value being edited (string while typing).
  get draftForumContextLimit() {
    return this.store.draft.forumContextLimit ?? this.store.config.forumContextLimit;
  }

  populate() {
    const preferences = this.store.draftPreferences;
    document.querySelectorAll('input[name="researchDepth"]').forEach(input => {
      input.checked = input.value === preferences.researchDepth;
    });
    document.querySelectorAll('input[name="historyRetention"]').forEach(input => {
      input.checked = input.value === preferences.historyRetention;
    });
    for (const field of CUSTOM_RESEARCH_FIELDS) {
      $(field).value = String(preferences.customBudget[field]);
    }
    document.querySelectorAll('input[name="topicPageMode"]').forEach(input => {
      input.checked = input.value === preferences.topicPageMode;
    });
    $('topicPageLimit').value = String(preferences.topicPageLimit);
    $('maxSavedTopics').value = String(preferences.maxSavedTopics);
    $('showForumButton').checked = preferences.showForumButton;
    $('forumContextLimit').value = String(this.draftForumContextLimit);
    this.render();
  }

  mount() {
    document.querySelectorAll('input[name="researchDepth"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.store.updatePreferences({ researchDepth: input.value });
        this.dispatch({ type: 'edited', clearStatus: true });
        this.syncErrors();
        this.render();
      });
    });
    document.querySelectorAll('input[name="topicPageMode"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.store.updatePreferences({ topicPageMode: input.value });
        this.dispatch({ type: 'edited', clearStatus: true });
        // Leaving limit mode clears a page-limit error (it is no longer checked).
        this.syncErrors();
        this.render();
      });
    });
    document.querySelectorAll('input[name="historyRetention"]').forEach(input => {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this.store.updatePreferences({ historyRetention: input.value });
        this.dispatch({ type: 'edited', clearStatus: true });
        this.render();
      });
    });
    for (const field of PREFERENCE_NUMBER_FIELDS) {
      const input = $(field);
      input.addEventListener('input', () => {
        this.updateField(field, input.value);
        this.dispatch({ type: 'edited' });
        // While typing, only update an error already shown (e.g. clear it
        // once fixed); a new error appears when the field is left.
        this.syncErrors();
        this.render();
      });
      input.addEventListener('change', () => {
        this.syncErrors(field);
      });
    }
    $('showForumButton').addEventListener('change', event => {
      this.store.updatePreferences({ showForumButton: event.target.checked });
      this.dispatch({ type: 'edited', clearStatus: true });
    });
    document.querySelectorAll('[data-restore]').forEach(button => {
      button.addEventListener('click', () => this.restoreDefaults(button.dataset.restore));
    });
  }

  updateField(field, value) {
    if (CUSTOM_RESEARCH_FIELDS.includes(field)) {
      this.store.updatePreferences({ customBudget: { [field]: value } });
    } else if (field === 'forumContextLimit') {
      this.store.updateDraft({ forumContextLimit: value });
    } else {
      this.store.updatePreferences({ [field]: value });
    }
  }

  // Re-derives inline errors from the draft: fields already showing an error
  // (and `reveal`, a field just left) show its current error or none.
  syncErrors(reveal = '') {
    const validation = this.store.validatePreferencesDraft();
    const shown = this.getForm().fieldErrors || {};
    const fields = PREFERENCE_NUMBER_FIELDS.filter(field => field === reveal || shown[field]);
    if (!fields.length) return;
    this.dispatch({ type: 'field-errors', fields, fieldErrors: validation.fieldErrors });
  }

  restoreDefaults(section) {
    const restore = RESTORE_SECTIONS[section];
    if (!restore || this.isBusy()) return;
    this.store.resetPreferencesDraft(restore.keys);
    if (restore.forumContextLimit) {
      this.store.updateDraft({ forumContextLimit: FORUM_CONTEXT_LIMIT.default });
    }
    this.populate();
    this.dispatch({ type: 'defaults-restored', section: restore.label(), fields: restore.fields });
  }

  // Inline errors for the preference fields, from the form state.
  renderFieldErrors(fieldErrors = {}) {
    for (const field of PREFERENCE_NUMBER_FIELDS) {
      const input = $(field);
      const error = $(`${field}Error`);
      if (!input || !error) continue;
      const message = fieldErrors[field] || '';
      error.textContent = message;
      error.hidden = !message;
      if (message) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    }
  }

  // The effective values below each section.
  render() {
    const draft = this.store.draftPreferences;
    const validation = validatePreferences(draft);
    const custom = draft.researchDepth === 'custom';
    $('customResearch').hidden = !custom;

    const research = $('researchEffective');
    const researchInvalid = CUSTOM_RESEARCH_FIELDS.some(field => validation.fieldErrors[field]);
    if (researchInvalid) {
      research.textContent = t('settings.research.fixField');
    } else {
      const budget = resolveAgentBudget(validation.preferences || draft);
      setRichText(
        research,
        t('settings.research.effective', {
          steps: tn('settings.unit.step', budget.maxSteps),
          topics: tn('settings.unit.topic', budget.maxTopicReads),
          chars: budget.maxCharsPerRead.toLocaleString('en-US')
        })
      );
    }

    const limitMode = draft.topicPageMode === 'limit';
    $('topicPageLimit').disabled = !limitMode;
    const reading = $('topicPageLimitEffective');
    if (!limitMode) {
      setRichText(reading, t('settings.reading.everyPage'));
    } else if (validation.fieldErrors.topicPageLimit) {
      reading.textContent = '';
    } else {
      const posts = (Number(draft.topicPageLimit) * POSTS_PER_RAW_PAGE).toLocaleString('en-US');
      setRichText(reading, t('settings.reading.limited', { posts }));
    }

    const history = $('historyEffective');
    if (validation.fieldErrors.maxSavedTopics) {
      history.textContent = '';
    } else {
      const retention = resolveRetention(validation.preferences || draft);
      const taskDays = Math.round(retention.taskMs / 86400000);
      const tasks = t('settings.history.tasks', { days: tn('settings.unit.day', taskDays) });
      setRichText(
        history,
        retention.forever
          ? t('settings.history.effectiveForever', { tasks, max: retention.maxSavedTopics })
          : t('settings.history.effectiveTimed', {
              label: retentionLabel(retention.historyRetention, retention.label),
              tasks,
              max: retention.maxSavedTopics
            })
      );
    }
  }
}
