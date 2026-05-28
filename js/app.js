'use strict';

(() => {
  // ── Page registry ──────────────────────────────────────────────────────────
  const PAGES = ['dashboard', 'budget', 'habits', 'savings', 'projects'];

  const RENDERERS = {
    dashboard: () => Dashboard.renderDashboard(),
    budget:    () => Budget.renderBudgetPage(),
    habits:    () => Habits.renderHabitsPage(),
    savings:   () => Savings.renderSavingsPage(),
    projects:  () => Projects.renderProjectsPage(),
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navigateTo(page) {
    if (!PAGES.includes(page)) return;
    Store.setState({ currentPage: page }, false);

    PAGES.forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.hidden = (p !== page);
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('nav-btn--active', btn.dataset.page === page);
      btn.setAttribute('aria-current', btn.dataset.page === page ? 'page' : 'false');
    });

    try { RENDERERS[page](); } catch (e) { console.error('Render error on', page, e); }

    if (page === 'dashboard') {
      setTimeout(() => { try { Charts.redrawAll(); } catch (_) {} }, 80);
    }
  }

  // ── Modals ─────────────────────────────────────────────────────────────────
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    // Pre-fill date inputs to today
    el.querySelectorAll('input[type="date"]').forEach(input => {
      if (!input.value) input.value = Utils.getDateKey(new Date());
    });
    if (id === 'modal-add-habit') {
      try { Habits.renderHabitChecklist(); } catch (_) {}
    }
    if (id === 'modal-budget-settings') {
      const s = Store.state.budgetSettings;
      const salEl = document.getElementById('input-salary');
      const needsEl = document.getElementById('input-needs-pct');
      const wantsEl = document.getElementById('input-wants-pct');
      if (salEl) salEl.value = s.monthlySalary || 0;
      if (needsEl) needsEl.value = s.needsPct ?? 50;
      if (wantsEl) wantsEl.value = s.wantsPct ?? 30;
    }
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.setAttribute('aria-hidden', 'true');
  }

  // Close modal on backdrop click
  function _initModalBackdrops() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) closeModal(modal.id);
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
      }
    });
  }

  // ── Dark mode ──────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
  }

  function toggleTheme() {
    const next = Store.state.theme === 'dark' ? 'light' : 'dark';
    Store.setState({ theme: next });
    applyTheme(next);
  }

  // ── Transaction filters ────────────────────────────────────────────────────
  function _initFilters() {
    const ids = ['filter-search', 'filter-category', 'filter-type', 'filter-date-from', 'filter-date-to'];
    const keys = ['search', 'category', 'type', 'dateFrom', 'dateTo'];

    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const filter = { ...Store.state.txFilter, [keys[i]]: el.value };
        Store.setState({ txFilter: filter }, false);
        if (Store.state.currentPage === 'budget') {
          try { Budget.renderBudgetPage(); } catch (_) {}
        }
      });
    });

    const clearBtn = document.getElementById('filter-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        Store.setState({ txFilter: { search: '', category: '', type: '', dateFrom: '', dateTo: '' } }, false);
        if (Store.state.currentPage === 'budget') {
          try { Budget.renderBudgetPage(); } catch (_) {}
        }
      });
    }
  }

  // ── Habit date navigation ──────────────────────────────────────────────────
  function _initHabitDateNav() {
    const prevBtn = document.getElementById('habit-date-prev');
    const nextBtn = document.getElementById('habit-date-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const d = new Date(Store.state.habitDate);
        d.setDate(d.getDate() - 1);
        Store.setState({ habitDate: d }, false);
        try { Habits.renderHabitsPage(); } catch (_) {}
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const d = new Date(Store.state.habitDate);
        d.setDate(d.getDate() + 1);
        if (d <= new Date()) {
          Store.setState({ habitDate: d }, false);
          try { Habits.renderHabitsPage(); } catch (_) {}
        }
      });
    }
  }

  // ── Habit checklist custom add ─────────────────────────────────────────────
  function _initHabitCustomInput() {
    const addBtn = document.getElementById('habit-custom-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        try { Habits.addCustomHabitToChecklist(); } catch (_) {}
      });
    }
  }

  // ── Global button wiring ───────────────────────────────────────────────────
  function _bindButtons() {
    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // Budget page buttons
    _bindId('btn-open-budget-settings',   () => openModal('modal-budget-settings'));
    _bindId('btn-open-add-transaction',   () => openModal('modal-add-transaction'));
    _bindId('btn-open-add-bill',          () => openModal('modal-add-bill'));
    _bindId('btn-save-budget-settings',   () => { try { Budget.saveBudgetSettings(); } catch (e) { console.error(e); } });
    _bindId('btn-save-transaction',       () => { try { Budget.saveTransaction(); } catch (e) { console.error(e); } });
    _bindId('btn-save-bill',              () => { try { Budget.saveRecurringBill(); } catch (e) { console.error(e); } });
    _bindId('btn-export-data',            () => { try { Budget.triggerExport(); } catch (e) { console.error(e); } });

    // Import file input
    const importInput = document.getElementById('input-import-file');
    if (importInput) {
      importInput.addEventListener('change', e => {
        try { Budget.handleImport(e); } catch (err) { Utils.showToast('Import failed.', 'error'); }
      });
    }
    _bindId('btn-import-data', () => { if (importInput) importInput.click(); });

    // Habit page buttons
    _bindId('btn-open-add-habit',  () => openModal('modal-add-habit'));
    _bindId('btn-save-habits',     () => { try { Habits.saveSelectedHabits(); closeModal('modal-add-habit'); } catch (e) { console.error(e); } });
    _bindId('btn-cancel-habit-modal', () => closeModal('modal-add-habit'));

    // Modal close buttons (×)
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
  }

  function _bindId(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // ── PWA install prompt ─────────────────────────────────────────────────────
  let _deferredInstall = null;
  function _initPwa() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _deferredInstall = e;
      const btn = document.getElementById('btn-install-pwa');
      if (btn) btn.hidden = false;
    });
    _bindId('btn-install-pwa', () => {
      if (!_deferredInstall) return;
      _deferredInstall.prompt();
      _deferredInstall.userChoice.then(() => { _deferredInstall = null; });
      const btn = document.getElementById('btn-install-pwa');
      if (btn) btn.hidden = true;
    });
  }

  // ── Resize → redraw charts ─────────────────────────────────────────────────
  function _initResize() {
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        if (Store.state.currentPage === 'dashboard') {
          try { Charts.onResize(); } catch (_) {}
        }
      }, 200);
    });
  }

  // ── Store subscription (keep current page fresh) ───────────────────────────
  function _initSubscription() {
    Store.subscribe((state, changedKeys) => {
      // Re-render current page when relevant data changes
      const pageData = {
        dashboard: ['transactions', 'habits', 'savingsTransfers', 'budgetSettings', 'recurringBills', 'projects'],
        budget:    ['transactions', 'budgetSettings', 'recurringBills'],
        habits:    ['habits'],
        savings:   ['savingsTransfers', 'budgetSettings'],
        projects:  ['projects'],
      };
      const relevant = pageData[state.currentPage] || [];
      if (changedKeys.some(k => relevant.includes(k))) {
        try { RENDERERS[state.currentPage](); } catch (e) { console.error(e); }
      }
    });
  }

  // ── Service worker ─────────────────────────────────────────────────────────
  function _registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    Store.loadData();
    applyTheme(Store.state.theme);
    _initSubscription();
    _bindButtons();
    _initModalBackdrops();
    _initFilters();
    _initHabitDateNav();
    _initHabitCustomInput();
    _initResize();
    _initPwa();
    _registerSW();
    navigateTo('dashboard');
  });

  // Expose for inline HTML usage
  window.openModal  = openModal;
  window.closeModal = closeModal;
})();
