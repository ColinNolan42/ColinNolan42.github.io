'use strict';

const Budget = (() => {
  // Categories that count as "needs" vs "wants"
  const NEEDS_CATEGORIES = new Set([
    'Rent/Mortgage', 'Utilities', 'Groceries', 'Transportation',
    'Healthcare', 'Insurance', 'Phone', 'Internet',
  ]);
  const WANTS_CATEGORIES = new Set([
    'Dining Out', 'Entertainment', 'Shopping', 'Subscriptions',
    'Travel', 'Hobbies', 'Personal Care',
  ]);

  // Track pending-confirm state for delete buttons: id -> timeoutId
  const _pendingDeletes = new Map();

  // ─── Computed Stats ────────────────────────────────────────────────────────

  function getStats() {
    const { monthlySalary: salary, needsPct, wantsPct } = Store.state.budgetSettings;
    const totalBills   = getTotalMonthlyBills();
    const afterBills   = salary - totalBills;
    const needsBudget  = afterBills * (needsPct / 100);
    const wantsBudget  = afterBills * (wantsPct / 100);

    let needsSpent  = 0;
    let wantsSpent  = 0;
    let totalIncome = 0;

    Store.getMonthTransactions().forEach(t => {
      if (t.type === 'income') {
        totalIncome += t.amount;
      } else {
        const catType = getCategoryType(t.category);
        if (catType === 'needs') needsSpent += t.amount;
        else wantsSpent += t.amount;
      }
    });

    const totalSpent = needsSpent + wantsSpent;
    const monthlyTransfers = Store.getMonthSavingsTransfers().reduce((s, t) => s + t.amount, 0);
    const remaining  = salary + totalIncome - totalSpent - totalBills - monthlyTransfers;

    return {
      salary, totalBills, afterBills,
      needsBudget, wantsBudget,
      needsSpent, wantsSpent, totalSpent,
      totalIncome, remaining, monthlyTransfers,
      needsPct, wantsPct,
    };
  }

  // ─── Recurring Bills ───────────────────────────────────────────────────────

  /**
   * Returns bills sorted by daysUntil, correctly handling months shorter than 31 days.
   * daysUntil=0 means it's due today.
   */
  function getUpcomingBills() {
    const today     = new Date();
    const currentDay = today.getDate();
    const dim        = Utils.daysInMonth(today.getFullYear(), today.getMonth()); // correct days in current month

    return Store.state.recurringBills.map(bill => {
      // Clamp the bill's dueDay to valid range for this month
      const effectiveDue = Math.min(bill.dueDay, dim);
      let daysUntil;
      if (effectiveDue >= currentDay) {
        daysUntil = effectiveDue - currentDay;
      } else {
        // Already passed this month — count days to next month's occurrence
        const nextMonthDim = Utils.daysInMonth(
          today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(),
          (today.getMonth() + 1) % 12
        );
        const nextEffective = Math.min(bill.dueDay, nextMonthDim);
        daysUntil = (dim - currentDay) + nextEffective;
      }
      return { ...bill, daysUntil };
    }).sort((a, b) => a.daysUntil - b.daysUntil);
  }

  function getTotalMonthlyBills() {
    return Store.state.recurringBills.reduce((sum, b) => sum + b.amount, 0);
  }

  // ─── Category Helpers ──────────────────────────────────────────────────────

  function getCategoryType(category) {
    if (NEEDS_CATEGORIES.has(category)) return 'needs';
    if (WANTS_CATEGORIES.has(category)) return 'wants';
    return 'wants'; // default unknown categories to wants
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  function renderBudgetPage() {
    const stats = getStats();

    // ── Budget settings display ──
    document.getElementById('budget-salary').textContent     = Math.round(stats.salary).toLocaleString('en-US');
    document.getElementById('budget-total').textContent      = Math.round(stats.afterBills).toLocaleString('en-US');
    document.getElementById('budget-needs-pct').textContent  = stats.needsPct;
    document.getElementById('budget-needs-amount').textContent = Math.round(stats.needsBudget).toLocaleString('en-US');
    document.getElementById('budget-wants-pct').textContent  = stats.wantsPct;
    document.getElementById('budget-wants-amount').textContent = Math.round(stats.wantsBudget).toLocaleString('en-US');

    // ── Alert banners ──
    _renderAlerts(stats);

    // ── Recurring bills ──
    _renderBills();

    // ── Transactions (filtered) ──
    _renderTransactions();
  }

  function _renderAlerts(stats) {
    const container = document.getElementById('budget-alerts');
    if (!container) return;

    const needsPct  = stats.needsBudget  > 0 ? (stats.needsSpent  / stats.needsBudget)  * 100 : 0;
    const wantsPct  = stats.wantsBudget  > 0 ? (stats.wantsSpent  / stats.wantsBudget)  * 100 : 0;

    const alerts = [];

    // Check each category for over-budget states — danger (>100%) takes priority over warning (>90%)
    if (needsPct > 100) {
      alerts.push({ level: 'danger', msg: `Needs budget exceeded: ${Utils.formatCurrency(stats.needsSpent)} spent of ${Utils.formatCurrency(stats.needsBudget)} (${Math.round(needsPct)}%)` });
    } else if (needsPct > 90) {
      alerts.push({ level: 'warning', msg: `Needs budget at ${Math.round(needsPct)}% — ${Utils.formatCurrency(stats.needsBudget - stats.needsSpent)} remaining` });
    }

    if (wantsPct > 100) {
      alerts.push({ level: 'danger', msg: `Wants budget exceeded: ${Utils.formatCurrency(stats.wantsSpent)} spent of ${Utils.formatCurrency(stats.wantsBudget)} (${Math.round(wantsPct)}%)` });
    } else if (wantsPct > 90) {
      alerts.push({ level: 'warning', msg: `Wants budget at ${Math.round(wantsPct)}% — ${Utils.formatCurrency(stats.wantsBudget - stats.wantsSpent)} remaining` });
    }

    if (alerts.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = alerts.map(a => {
      const bg    = a.level === 'danger' ? 'var(--error)' : 'var(--warning)';
      const color = '#fff';
      return `<div style="background:${bg};color:${color};padding:0.75rem 1rem;border-radius:0.5rem;margin-bottom:0.5rem;font-weight:600;font-size:0.875rem;">${Utils.escapeHtml(a.msg)}</div>`;
    }).join('');
  }

  function _renderBills() {
    const listEl = document.getElementById('recurring-bills-list');
    if (!listEl) return;

    if (Store.state.recurringBills.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-text">No recurring bills yet</div>
        </div>`;
      return;
    }

    const bills = getUpcomingBills();
    let html = bills.map(bill => {
      const dueLabel =
        bill.daysUntil === 0 ? 'Due today!' :
        bill.daysUntil === 1 ? 'Due tomorrow' :
        `Due in ${bill.daysUntil} days`;

      return `
        <div class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">${Utils.escapeHtml(bill.name)}</div>
            <div class="list-item-subtitle">${Utils.escapeHtml(bill.category)} &bull; ${Utils.escapeHtml(dueLabel)}</div>
          </div>
          <div class="list-item-action">
            <span class="list-item-value amount-negative">${Utils.formatCurrency(bill.amount)}</span>
            <button class="btn btn--icon btn-delete-bill" data-id="${Utils.escapeHtml(bill.id)}"
                    style="background:var(--error);color:#fff;"
                    title="Delete bill">&times;</button>
          </div>
        </div>`;
    }).join('');

    const total = getTotalMonthlyBills();
    html += `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;color:var(--text-primary);">Total Monthly Bills</span>
        <span style="font-size:1.25rem;font-weight:700;color:var(--error);font-family:'Merriweather',serif;">${Utils.formatCurrency(total)}</span>
      </div>`;

    listEl.innerHTML = html;

    // Event delegation for delete buttons
    listEl.querySelectorAll('.btn-delete-bill').forEach(btn => {
      btn.addEventListener('click', () => deleteRecurringBill(btn.dataset.id));
    });
  }

  function _renderTransactions() {
    const listEl = document.getElementById('transactions-list');
    if (!listEl) return;

    const transactions = Store.getFilteredTransactions();

    if (transactions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💸</div>
          <div class="empty-state-text">No transactions found</div>
        </div>`;
      return;
    }

    listEl.innerHTML = transactions.map(t => {
      const catType   = getCategoryType(t.category);
      const badgeClass = catType === 'needs' ? 'badge-needs' : 'badge-wants';
      const sign       = t.type === 'income' ? '+' : '-';
      const amtClass   = t.type === 'income' ? 'amount-positive' : 'amount-negative';

      return `
        <div class="list-item">
          <div class="list-item-content">
            <div class="list-item-title">
              ${Utils.escapeHtml(t.category)}
              ${t.type === 'expense' ? `<span class="category-badge ${badgeClass}">${catType}</span>` : '<span class="category-badge badge-savings">income</span>'}
            </div>
            ${t.description ? `<div class="list-item-subtitle">${Utils.escapeHtml(t.description)}</div>` : ''}
            <div class="list-item-subtitle">${Utils.escapeHtml(t.date)}</div>
          </div>
          <div class="list-item-action">
            <span class="list-item-value ${amtClass}">${sign}${Utils.formatCurrency(t.amount)}</span>
            <button class="btn btn--icon btn-delete-tx" data-id="${Utils.escapeHtml(String(t.id))}"
                    style="background:var(--error);color:#fff;"
                    title="Delete transaction">&times;</button>
          </div>
        </div>`;
    }).join('');

    // Event delegation for transaction delete buttons
    listEl.querySelectorAll('.btn-delete-tx').forEach(btn => {
      btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
    });
  }

  // ─── CRUD: Budget Settings ─────────────────────────────────────────────────

  function saveBudgetSettings() {
    const form = document.getElementById('modal-budget-settings');
    Utils.clearAllFieldErrors(form);

    const salaryEl   = document.getElementById('input-salary');
    const needsEl    = document.getElementById('input-needs-pct');
    const wantsEl    = document.getElementById('input-wants-pct');

    const salaryResult = Utils.validateAmount(salaryEl.value);
    const needsResult  = Utils.validatePercent(needsEl.value);
    const wantsResult  = Utils.validatePercent(wantsEl.value);

    let valid = true;
    if (!salaryResult.valid) { Utils.showFieldError(salaryEl, salaryResult.error); valid = false; }
    if (!needsResult.valid)  { Utils.showFieldError(needsEl,  needsResult.error);  valid = false; }
    if (!wantsResult.valid)  { Utils.showFieldError(wantsEl,  wantsResult.error);  valid = false; }

    if (!valid) return;

    const needsPct = parseFloat(needsEl.value);
    const wantsPct = parseFloat(wantsEl.value);

    if (needsPct + wantsPct > 100) {
      Utils.showFieldError(wantsEl, 'Needs % + Wants % cannot exceed 100.');
      return;
    }

    Store.setState({
      budgetSettings: {
        monthlySalary: parseFloat(salaryEl.value),
        needsPct,
        wantsPct,
      },
    });

    closeModal('modal-budget-settings');
    renderBudgetPage();
    Utils.showToast('Budget settings saved.', 'success');
  }

  // ─── CRUD: Transactions ────────────────────────────────────────────────────

  function saveTransaction() {
    const form = document.getElementById('modal-add-transaction');
    Utils.clearAllFieldErrors(form);

    const typeEl   = document.getElementById('input-transaction-type');
    const catEl    = document.getElementById('input-transaction-category');
    const amtEl    = document.getElementById('input-transaction-amount');
    const descEl   = document.getElementById('input-transaction-description');
    const dateEl   = document.getElementById('input-transaction-date');

    const amtResult  = Utils.validatePositiveAmount(amtEl.value);
    const dateResult = Utils.validateDateString(dateEl.value);

    let valid = true;
    if (!amtResult.valid)  { Utils.showFieldError(amtEl,  amtResult.error);  valid = false; }
    if (!dateResult.valid) { Utils.showFieldError(dateEl, dateResult.error); valid = false; }

    if (!valid) return;

    const newTx = {
      id:          Utils.generateId(),
      type:        typeEl.value,
      category:    catEl.value,
      amount:      parseFloat(amtEl.value),
      description: descEl.value.trim(),
      date:        dateEl.value,
    };

    const updated = [newTx, ...Store.state.transactions];
    Store.setState({ transactions: updated });

    // Reset form fields (keep type, category, and date for convenience)
    amtEl.value  = '';
    descEl.value = '';

    closeModal('modal-add-transaction');
    renderBudgetPage();
    Utils.showToast('Transaction added.', 'success');
  }

  function deleteTransaction(id) {
    _confirmDelete(
      `tx-${id}`,
      () => {
        const updated = Store.state.transactions.filter(t => String(t.id) !== String(id));
        Store.setState({ transactions: updated });
        renderBudgetPage();
        Utils.showToast('Transaction deleted.', 'info');
      }
    );
  }

  // ─── CRUD: Recurring Bills ─────────────────────────────────────────────────

  function saveRecurringBill() {
    const form = document.getElementById('modal-add-bill');
    Utils.clearAllFieldErrors(form);

    const nameEl    = document.getElementById('input-bill-name');
    const amtEl     = document.getElementById('input-bill-amount');
    const dueDayEl  = document.getElementById('input-bill-due-day');
    const catEl     = document.getElementById('input-bill-category');

    const nameResult   = Utils.validateText(nameEl.value, 'Bill name');
    const amtResult    = Utils.validatePositiveAmount(amtEl.value);
    const dayNum       = parseInt(dueDayEl.value, 10);
    const dayValid     = !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31;

    let valid = true;
    if (!nameResult.valid) { Utils.showFieldError(nameEl,   nameResult.error); valid = false; }
    if (!amtResult.valid)  { Utils.showFieldError(amtEl,    amtResult.error);  valid = false; }
    if (!dayValid)         { Utils.showFieldError(dueDayEl, 'Enter a day between 1 and 31.'); valid = false; }

    if (!valid) return;

    const newBill = {
      id:       Utils.generateId(),
      name:     nameEl.value.trim(),
      amount:   parseFloat(amtEl.value),
      dueDay:   dayNum,
      category: catEl.value,
    };

    const updated = [...Store.state.recurringBills, newBill];
    Store.setState({ recurringBills: updated });

    nameEl.value   = '';
    amtEl.value    = '';
    dueDayEl.value = '';

    closeModal('modal-add-bill');
    renderBudgetPage();
    Utils.showToast('Recurring bill added.', 'success');
  }

  function deleteRecurringBill(id) {
    _confirmDelete(
      `bill-${id}`,
      () => {
        const updated = Store.state.recurringBills.filter(b => String(b.id) !== String(id));
        Store.setState({ recurringBills: updated });
        renderBudgetPage();
        Utils.showToast('Bill deleted.', 'info');
      }
    );
  }

  // ─── Two-tap confirm (no browser dialogs) ─────────────────────────────────

  /**
   * On first call for a given key: marks the originating button as "pending"
   * and arms a 3-second reset. On second call within that window: executes the action.
   */
  function _confirmDelete(key, action) {
    if (_pendingDeletes.has(key)) {
      // Second tap — execute
      clearTimeout(_pendingDeletes.get(key));
      _pendingDeletes.delete(key);
      _resetPendingButton(key);
      action();
    } else {
      // First tap — mark pending
      _markPendingButton(key);
      const tid = setTimeout(() => {
        _pendingDeletes.delete(key);
        _resetPendingButton(key);
      }, 3000);
      _pendingDeletes.set(key, tid);
    }
  }

  function _markPendingButton(key) {
    // Find the button by its data-id; the key encodes type and id
    const [type, ...idParts] = key.split('-');
    const id = idParts.join('-');
    const selector = type === 'tx' ? `.btn-delete-tx[data-id="${CSS.escape(id)}"]`
                                   : `.btn-delete-bill[data-id="${CSS.escape(id)}"]`;
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.textContent = 'Tap again';
    btn.style.background = 'var(--warning)';
    btn.style.fontSize   = '0.65rem';
    btn.style.padding    = '0 4px';
  }

  function _resetPendingButton(key) {
    const [type, ...idParts] = key.split('-');
    const id = idParts.join('-');
    const selector = type === 'tx' ? `.btn-delete-tx[data-id="${CSS.escape(id)}"]`
                                   : `.btn-delete-bill[data-id="${CSS.escape(id)}"]`;
    const btn = document.querySelector(selector);
    if (!btn) return;
    btn.textContent      = '×'; // ×
    btn.style.background = 'var(--error)';
    btn.style.fontSize   = '';
    btn.style.padding    = '';
  }

  // ─── Export / Import ───────────────────────────────────────────────────────

  function triggerExport() {
    const data    = Store.exportData();
    const json    = JSON.stringify(data, null, 2);
    const blob    = new Blob([json], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const anchor  = document.createElement('a');
    anchor.href   = url;
    anchor.download = `life-tracker-backup-${Utils.getDateKey(new Date())}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    Utils.showToast('Data exported successfully.', 'success');
  }

  function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = JSON.parse(e.target.result);
        Store.importData(raw);
        renderBudgetPage();
        Utils.showToast('Data imported successfully.', 'success');
      } catch (err) {
        Utils.showToast('Import failed: ' + (err.message || 'Invalid file.'), 'error');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported if needed
    event.target.value = '';
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    el.setAttribute('aria-hidden', 'true');
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    getStats,
    getUpcomingBills,
    getTotalMonthlyBills,
    getCategoryType,
    renderBudgetPage,
    saveBudgetSettings,
    saveTransaction,
    deleteTransaction,
    saveRecurringBill,
    deleteRecurringBill,
    triggerExport,
    handleImport,
  };
})();

window.Budget = Budget;
