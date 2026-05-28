'use strict';

const Habits = (() => {
  // ─── Common Habit Catalogue ────────────────────────────────────────────────

  const COMMON_HABITS = {
    'Morning Routine': [
      'Wake up early', 'Make bed', 'Drink 8 glasses water',
      'Meditate', 'Journal', 'Eat breakfast', 'Take vitamins', 'Stretch',
    ],
    'Afternoon/Work': [
      'Deep work session', 'Take breaks', 'Healthy lunch',
    ],
    'Evening Routine': [
      'Plan tomorrow', 'Cook dinner', 'Exercise', 'Floss teeth', 'Get 8 hours sleep',
    ],
    'Anytime/Daily': [
      'Walk 10,000 steps', 'Track spending', 'Call family',
      'No impulse purchases', 'Pack lunch',
      'Less than 2 hours social media', 'Less than 2 hours video games',
    ],
  };

  // Ordered time-of-day groups for consistent rendering
  const TIME_OF_DAY_ORDER = ['Morning Routine', 'Afternoon/Work', 'Evening Routine', 'Anytime/Daily'];

  // Module-local checklist selections (Set of "timeOfDay:habitName" keys)
  let _checklistSelections = new Set();

  // Temp catalogue additions (custom habits added to checklist before saving)
  let _tempCatalogue = {};

  // Two-tap confirm state for deletes: habitId -> timeoutId
  const _pendingDeletes = new Map();

  // Delegated listener guard — only attach once per container render
  let _delegatedListenerAttached = false;

  // ─── Stats ─────────────────────────────────────────────────────────────────

  /**
   * Monthly completion rate + overall streak across all habits.
   */
  function getStats() {
    const now = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const dim   = Utils.daysInMonth(year, month);

    let totalCompletions = 0;
    let totalPossible    = 0;

    const today = Utils.getDateKey(now);

    Store.state.habits.forEach(habit => {
      for (let day = 1; day <= dim; day++) {
        const d = new Date(year, month, day);
        if (Utils.getDateKey(d) > today) break; // don't count future days
        totalPossible++;
        const key = Utils.getDateKey(d);
        if (habit.completions && habit.completions[key]) totalCompletions++;
      }
    });

    const completionRate = totalPossible > 0 ? (totalCompletions / totalPossible) * 100 : 0;
    const streak = getStreak();
    const todayKey = Utils.getDateKey(now);
    const totalHabits = Store.state.habits.length;
    const todayCompleted = Store.state.habits.filter(
      h => h.completions && h.completions[todayKey]
    ).length;

    return {
      totalCompletions, totalPossible, completionRate, streak,
      // aliases used by dashboard.js
      todayCompleted, totalHabits, monthRate: completionRate, currentStreak: streak,
    };
  }

  /**
   * Consecutive-day streak (audit fix #6):
   * - A day counts if ANY habit was completed that day.
   * - If today has no completions, check from yesterday.
   * - Walk backwards, stop at first empty day.
   * - Capped at 730 days.
   */
  function getStreak() {
    if (Store.state.habits.length === 0) return 0;

    const todayKey = Utils.getDateKey(new Date());
    const todayDone = Store.state.habits.some(
      h => h.completions && h.completions[todayKey]
    );

    const cursor = new Date();
    // If today has no completions, start checking from yesterday
    if (!todayDone) cursor.setDate(cursor.getDate() - 1);

    let streak = 0;
    const MAX_STREAK = 730;

    while (streak < MAX_STREAK) {
      const key     = Utils.getDateKey(cursor);
      const anyDone = Store.state.habits.some(h => h.completions && h.completions[key]);
      if (!anyDone) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  /**
   * Per-habit streak for a given habit's completions map.
   * Same logic as getStreak() but scoped to one habit.
   * Anchored to today (passed in as a Date so the habits page can use any selected date).
   */
  function _habitStreak(habit, anchorDate) {
    const todayKey  = Utils.getDateKey(anchorDate);
    const todayDone = !!(habit.completions && habit.completions[todayKey]);

    const cursor = new Date(anchorDate);
    if (!todayDone) cursor.setDate(cursor.getDate() - 1);

    let streak = 0;
    const MAX   = 730;

    while (streak < MAX) {
      const key  = Utils.getDateKey(cursor);
      const done = !!(habit.completions && habit.completions[key]);
      if (!done) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  function renderHabitsPage() {
    // Update the date display
    const habitDate = Store.state.habitDate instanceof Date ? Store.state.habitDate : new Date();
    const dateEl    = document.getElementById('habit-date');
    if (dateEl) {
      dateEl.textContent = habitDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
    }

    const listEl = document.getElementById('habits-list');
    if (!listEl) return;

    if (Store.state.habits.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#10024;</div>
          <div class="empty-state-text">No habits yet. Tap + Add to get started!</div>
        </div>`;
      _delegatedListenerAttached = false;
      return;
    }

    const dateKey = Utils.getDateKey(habitDate);

    // Group habits by time-of-day
    const groups = {};
    TIME_OF_DAY_ORDER.forEach(t => { groups[t] = []; });

    Store.state.habits.forEach(habit => {
      const slot = habit.timeOfDay || 'Anytime/Daily';
      if (!groups[slot]) groups[slot] = [];
      groups[slot].push(habit);
    });

    let html = '';

    TIME_OF_DAY_ORDER.forEach(timeSlot => {
      const habits = groups[timeSlot];
      if (!habits || habits.length === 0) return;

      const completed  = habits.filter(h => h.completions && h.completions[dateKey]).length;
      const total      = habits.length;
      const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;

      html += `
        <div style="margin-bottom:1.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <div class="habit-checklist-category">${Utils.escapeHtml(timeSlot)}</div>
            <div style="font-size:0.75rem;font-weight:600;color:var(--primary);">
              ${completed}/${total} (${pct}%)
            </div>
          </div>`;

      habits.forEach(habit => {
        const isChecked = !!(habit.completions && habit.completions[dateKey]);
        const streak    = _habitStreak(habit, habitDate);

        // Bug #12 fix: no habit name in onclick — use data attributes only
        html += `
          <div class="habit-item" data-id="${Utils.escapeHtml(String(habit.id))}">
            <div class="habit-checkbox${isChecked ? ' checked' : ''}"
                 data-action="toggle"
                 data-id="${Utils.escapeHtml(String(habit.id))}"
                 title="Toggle completion">
              ${isChecked ? '&#10003;' : ''}
            </div>
            <div class="habit-info">
              <div class="habit-name">${Utils.escapeHtml(habit.name)}</div>
              <div class="habit-category">${Utils.escapeHtml(timeSlot)}</div>
            </div>
            <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:0.25rem;">
              ${streak > 0 ? `<div class="habit-streak">${streak}&#128293;</div>` : ''}
              <button class="btn btn--icon"
                      data-action="delete-habit"
                      data-id="${Utils.escapeHtml(String(habit.id))}"
                      style="background:var(--error);color:#fff;"
                      title="Delete habit">&times;</button>
            </div>
          </div>`;
      });

      html += '</div>';
    });

    listEl.innerHTML = html;

    // Reattach delegated listener (onclick replaces any previous handler on the element)
    _delegatedListenerAttached = false;
    _attachDelegatedListener(listEl);
  }

  /**
   * Attach a single delegated listener to the habits list container.
   * Handles both toggle and delete-habit actions via data attributes.
   * Uses onclick (replaces any stale handler) to avoid closure-captured stale dateKey.
   */
  function _attachDelegatedListener(container) {
    if (_delegatedListenerAttached) return;
    _delegatedListenerAttached = true;

    container.onclick = e => {
      // Walk up to find the nearest element with data-action
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action  = target.dataset.action;
      const habitId = target.dataset.id;

      // Derive the current dateKey fresh from Store state each time
      const habitDate = Store.state.habitDate instanceof Date ? Store.state.habitDate : new Date();
      const currentDateKey = Utils.getDateKey(habitDate);

      if (action === 'toggle') {
        toggleHabit(habitId, currentDateKey);
      } else if (action === 'delete-habit') {
        deleteHabit(habitId);
      }
    };
  }

  // ─── Habit Actions ────────────────────────────────────────────────────────

  function toggleHabit(habitId, dateKey) {
    const habits = Store.state.habits.map(h => {
      if (String(h.id) !== String(habitId)) return h;
      const completions = { ...(h.completions || {}) };
      if (completions[dateKey]) {
        delete completions[dateKey];
      } else {
        completions[dateKey] = true;
      }
      return { ...h, completions };
    });

    Store.setState({ habits });
    renderHabitsPage();
  }

  function deleteHabit(habitId) {
    const key = String(habitId);
    if (_pendingDeletes.has(key)) {
      // Second tap — execute delete
      clearTimeout(_pendingDeletes.get(key));
      _pendingDeletes.delete(key);
      _resetDeleteButton(key);

      const updated = Store.state.habits.filter(h => String(h.id) !== key);
      Store.setState({ habits: updated });
      renderHabitsPage();
      Utils.showToast('Habit deleted.', 'info');
    } else {
      // First tap — arm confirm
      _markDeleteButton(key);
      const tid = setTimeout(() => {
        _pendingDeletes.delete(key);
        _resetDeleteButton(key);
      }, 3000);
      _pendingDeletes.set(key, tid);
    }
  }

  function _markDeleteButton(habitId) {
    const btn = document.querySelector(`[data-action="delete-habit"][data-id="${CSS.escape(habitId)}"]`);
    if (!btn) return;
    btn.textContent      = 'Tap again';
    btn.style.background = 'var(--warning)';
    btn.style.fontSize   = '0.65rem';
    btn.style.padding    = '0 4px';
  }

  function _resetDeleteButton(habitId) {
    const btn = document.querySelector(`[data-action="delete-habit"][data-id="${CSS.escape(habitId)}"]`);
    if (!btn) return;
    btn.textContent      = '×';
    btn.style.background = 'var(--error)';
    btn.style.fontSize   = '';
    btn.style.padding    = '';
  }

  // ─── Habit Checklist (Add Habits Modal) ───────────────────────────────────

  /**
   * Renders the common-habits checklist inside #habit-checklist.
   * Skips habits the user already has. Includes any temp custom additions.
   */
  function renderHabitChecklist() {
    const container = document.getElementById('habit-checklist');
    if (!container) return;

    const existingNames = new Set(
      Store.state.habits.map(h => h.name.toLowerCase())
    );

    // Merge COMMON_HABITS with any custom additions in _tempCatalogue
    const merged = {};
    TIME_OF_DAY_ORDER.forEach(slot => {
      merged[slot] = [...(COMMON_HABITS[slot] || [])];
    });
    Object.entries(_tempCatalogue).forEach(([slot, names]) => {
      if (!merged[slot]) merged[slot] = [];
      names.forEach(n => {
        if (!merged[slot].includes(n)) merged[slot].unshift(n);
      });
    });

    let html = '';

    TIME_OF_DAY_ORDER.forEach(slot => {
      const available = (merged[slot] || []).filter(
        name => !existingNames.has(name.toLowerCase())
      );
      if (available.length === 0) return;

      html += `<div class="habit-checklist-category">${Utils.escapeHtml(slot)}</div>`;

      available.forEach(habitName => {
        const selKey    = `${slot}:${habitName}`;
        const selected  = _checklistSelections.has(selKey);
        // Bug #12 fix: use data attributes, not onclick with user text
        html += `
          <div class="habit-checklist-item${selected ? ' selected' : ''}"
               data-checklist-key="${Utils.escapeHtml(selKey)}">
            <div class="habit-checklist-checkbox">
              ${selected ? '&#10003;' : ''}
            </div>
            <div class="habit-checklist-label">${Utils.escapeHtml(habitName)}</div>
          </div>`;
      });
    });

    if (!html) {
      html = '<div class="empty-state-text" style="padding:1rem;">All common habits already added! Use the custom form below.</div>';
    }

    container.innerHTML = html;

    // Use onclick (replaces any previous handler) to avoid listener pile-up
    // across re-renders, since the container element itself persists.
    container.onclick = e => {
      const item = e.target.closest('[data-checklist-key]');
      if (!item) return;
      const selKey = item.dataset.checklistKey;
      if (_checklistSelections.has(selKey)) {
        _checklistSelections.delete(selKey);
      } else {
        _checklistSelections.add(selKey);
      }
      renderHabitChecklist();
    };
  }

  /**
   * Adds a custom habit name to the checklist (temporary catalogue).
   * Called by the "Add Custom Habit to List" button in the modal.
   */
  function addCustomHabitToChecklist() {
    const nameEl    = document.getElementById('input-custom-habit-name');
    const slotEl    = document.getElementById('input-custom-habit-category');
    if (!nameEl || !slotEl) return;

    const nameResult = Utils.validateText(nameEl.value, 'Habit name', 100);
    if (!nameResult.valid) {
      Utils.showFieldError(nameEl, nameResult.error);
      return;
    }

    const name = nameEl.value.trim();
    const slot = slotEl.value;

    const existingNames = new Set(
      Store.state.habits.map(h => h.name.toLowerCase())
    );
    if (existingNames.has(name.toLowerCase())) {
      Utils.showFieldError(nameEl, 'This habit already exists in your list.');
      return;
    }

    // Check duplicates in temp catalogue too
    const tempNames = new Set(
      Object.values(_tempCatalogue).flat().map(n => n.toLowerCase())
    );
    const commonNames = new Set(
      Object.values(COMMON_HABITS).flat().map(n => n.toLowerCase())
    );
    if (tempNames.has(name.toLowerCase()) || commonNames.has(name.toLowerCase())) {
      // Already in catalogue — just auto-select it
      const selKey = `${slot}:${name}`;
      _checklistSelections.add(selKey);
      nameEl.value = '';
      renderHabitChecklist();
      return;
    }

    if (!_tempCatalogue[slot]) _tempCatalogue[slot] = [];
    _tempCatalogue[slot].unshift(name);

    const selKey = `${slot}:${name}`;
    _checklistSelections.add(selKey);

    nameEl.value = '';
    renderHabitChecklist();
  }

  /**
   * Saves all selected checklist habits to Store.state.habits.
   */
  function saveSelectedHabits() {
    if (_checklistSelections.size === 0) {
      Utils.showToast('Please select at least one habit.', 'error');
      return;
    }

    const newHabits = [];
    _checklistSelections.forEach(selKey => {
      // selKey format: "timeOfDay:habitName" — split on first colon only
      const colonIdx  = selKey.indexOf(':');
      const timeOfDay = selKey.slice(0, colonIdx);
      const habitName = selKey.slice(colonIdx + 1);

      newHabits.push({
        id:          Utils.generateId(),
        name:        habitName,
        timeOfDay,
        completions: {},
      });
    });

    const updated = [...Store.state.habits, ...newHabits];
    Store.setState({ habits: updated });

    // Reset modal state
    _checklistSelections.clear();
    _tempCatalogue = {};

    const modal = document.getElementById('modal-add-habit');
    if (modal) modal.classList.remove('active');

    renderHabitsPage();
    Utils.showToast(`${newHabits.length} habit${newHabits.length !== 1 ? 's' : ''} added.`, 'success');
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    getStats,
    getStreak,
    renderHabitsPage,
    toggleHabit,
    deleteHabit,
    saveSelectedHabits,
    addCustomHabitToChecklist,
    renderHabitChecklist,
  };
})();

window.Habits = Habits;
