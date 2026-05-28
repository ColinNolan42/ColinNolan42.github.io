'use strict';

const Store = (() => {
  const KEYS = {
    budget:    'lt_budgetSettings',
    transactions: 'lt_transactions',
    habits:    'lt_habits',
    bills:     'lt_recurringBills',
    savings:   'lt_savingsTransfers',
    projects:  'lt_projects',
    theme:     'lt_theme',
  };

  const DEFAULT_STATE = {
    budgetSettings: { monthlySalary: 0, needsPct: 50, wantsPct: 30 },
    transactions:   [],
    habits:         [],
    recurringBills: [],
    savingsTransfers: [],
    projects:       [],
    theme:          'light',
    // UI state (not persisted)
    currentPage:    'dashboard',
    habitDate:      new Date(),
    txFilter:       { search: '', category: '', type: '', dateFrom: '', dateTo: '' },
  };

  let state = structuredClone ? structuredClone(DEFAULT_STATE) : JSON.parse(JSON.stringify(DEFAULT_STATE));
  state.habitDate = new Date(); // Date objects don't survive structuredClone portably

  const subscribers = [];

  function subscribe(fn) {
    subscribers.push(fn);
    return () => { const i = subscribers.indexOf(fn); if (i > -1) subscribers.splice(i, 1); };
  }

  function notify(changedKeys) {
    subscribers.forEach(fn => { try { fn(state, changedKeys); } catch(e) { console.error('Store subscriber error', e); } });
  }

  function setState(updates, persist = true) {
    const changed = Object.keys(updates);
    Object.assign(state, updates);
    if (persist) saveData(changed);
    notify(changed);
  }

  // Persisted fields map
  const PERSIST_MAP = {
    budgetSettings:   KEYS.budget,
    transactions:     KEYS.transactions,
    habits:           KEYS.habits,
    recurringBills:   KEYS.bills,
    savingsTransfers: KEYS.savings,
    projects:         KEYS.projects,
    theme:            KEYS.theme,
  };

  function saveData(changedKeys) {
    try {
      changedKeys.forEach(key => {
        const lsKey = PERSIST_MAP[key];
        if (lsKey !== undefined) {
          localStorage.setItem(lsKey, JSON.stringify(state[key]));
        }
      });
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        Utils.showToast('Storage full — consider exporting and clearing old data.', 'error');
      }
    }
  }

  function loadData() {
    try {
      const parsedBudget = JSON.parse(localStorage.getItem(KEYS.budget));
      if (parsedBudget && typeof parsedBudget === 'object') {
        state.budgetSettings = { ...DEFAULT_STATE.budgetSettings, ...parsedBudget };
      }

      const parsedTx = JSON.parse(localStorage.getItem(KEYS.transactions));
      if (Array.isArray(parsedTx)) state.transactions = parsedTx;

      const parsedHabits = JSON.parse(localStorage.getItem(KEYS.habits));
      if (Array.isArray(parsedHabits)) state.habits = parsedHabits;

      const parsedBills = JSON.parse(localStorage.getItem(KEYS.bills));
      if (Array.isArray(parsedBills)) state.recurringBills = parsedBills;

      const parsedSavings = JSON.parse(localStorage.getItem(KEYS.savings));
      if (Array.isArray(parsedSavings)) state.savingsTransfers = parsedSavings;

      const parsedProjects = JSON.parse(localStorage.getItem(KEYS.projects));
      if (Array.isArray(parsedProjects)) state.projects = parsedProjects;

      const savedTheme = localStorage.getItem(KEYS.theme);
      if (savedTheme === 'dark' || savedTheme === 'light') state.theme = savedTheme;

    } catch (e) {
      console.error('Failed to load data from localStorage:', e);
      Utils.showToast('Could not load saved data. Starting fresh.', 'error');
    }
  }

  function exportData() {
    return {
      version: '3.0',
      exportDate: new Date().toISOString(),
      budgetSettings: state.budgetSettings,
      transactions:   state.transactions,
      habits:         state.habits,
      recurringBills: state.recurringBills,
      savingsTransfers: state.savingsTransfers,
      projects:       state.projects,
    };
  }

  function importData(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid file format.');
    const imported = {};

    // Explicit key picks to block prototype pollution
    if (raw.budgetSettings && typeof raw.budgetSettings === 'object') {
      const s = raw.budgetSettings;
      imported.budgetSettings = {
        monthlySalary: Number(s.monthlySalary) || 0,
        needsPct:      Number(s.needsPct)      || 50,
        wantsPct:      Number(s.wantsPct)      || 30,
      };
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    if (Array.isArray(raw.transactions)) {
      imported.transactions = raw.transactions.filter(t =>
        t && typeof t === 'object' &&
        typeof t.id === 'string' &&
        typeof t.amount === 'number' && isFinite(t.amount) &&
        typeof t.date === 'string' && DATE_RE.test(t.date) &&
        (t.type === 'expense' || t.type === 'income')
      );
    }

    if (Array.isArray(raw.habits)) {
      imported.habits = raw.habits.filter(h =>
        h && typeof h === 'object' &&
        typeof h.id === 'string' &&
        typeof h.name === 'string' && h.name.trim()
      );
    }

    if (Array.isArray(raw.recurringBills)) {
      imported.recurringBills = raw.recurringBills.filter(b =>
        b && typeof b === 'object' &&
        typeof b.id === 'string' &&
        typeof b.amount === 'number' && isFinite(b.amount) &&
        typeof b.dueDay === 'number' && b.dueDay >= 1 && b.dueDay <= 31
      );
    }

    if (Array.isArray(raw.savingsTransfers)) {
      imported.savingsTransfers = raw.savingsTransfers.filter(t =>
        t && typeof t === 'object' &&
        typeof t.id === 'string' &&
        typeof t.amount === 'number' && isFinite(t.amount) &&
        typeof t.date === 'string' && DATE_RE.test(t.date)
      );
    }

    if (Array.isArray(raw.projects)) {
      imported.projects = raw.projects.filter(p =>
        p && typeof p === 'object' &&
        typeof p.id === 'string' &&
        typeof p.title === 'string' && p.title.trim()
      );
    }

    setState(imported, true);
  }

  // Getters for computed views (keeps logic out of render functions)
  function getMonthTransactions(year = null, month = null) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth();
    return state.transactions.filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }

  function getMonthSavingsTransfers(year = null, month = null) {
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth();
    return state.savingsTransfers.filter(t => {
      const d = new Date(t.date + 'T00:00:00');
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }

  function getFilteredTransactions() {
    const { search, category, type, dateFrom, dateTo } = state.txFilter;
    return state.transactions.filter(t => {
      if (type && t.type !== type) return false;
      if (category && t.category !== category) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.category.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  return {
    get state() { return state; },
    subscribe,
    setState,
    loadData,
    exportData,
    importData,
    getMonthTransactions,
    getMonthSavingsTransfers,
    getFilteredTransactions,
  };
})();
