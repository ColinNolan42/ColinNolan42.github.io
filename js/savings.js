'use strict';

const Savings = (() => {
  // Tracks which delete button has been tapped once (tap-twice confirm pattern)
  const _pendingDeletes = new Map(); // id -> timeoutId

  // ── Public API ────────────────────────────────────────────────────────────

  function getTotalAllTime() {
    return Store.state.savingsTransfers.reduce((sum, t) => sum + t.amount, 0);
  }

  function renderSavingsPage() {
    const container = document.getElementById('page-savings');
    if (!container) return;

    const monthTransfers = Store.getMonthSavingsTransfers();
    const monthTotal = monthTransfers.reduce((sum, t) => sum + t.amount, 0);
    const allTimeTotal = getTotalAllTime();

    // Pull budget stats for the auto-calculator
    let availableForSavings = 0;
    try {
      const stats = Budget.getStats();
      const monthlyBills = Budget.getTotalMonthlyBills();
      // available = salary - spent (needs+wants) - recurring bills - this-month transfers
      const spent = (stats.needsSpent || 0) + (stats.wantsSpent || 0);
      availableForSavings = Math.max(0, (stats.monthlySalary || 0) - spent - monthlyBills - monthTotal);
    } catch (e) {
      // Budget module may not be loaded yet; degrade gracefully
      availableForSavings = 0;
    }

    // Build transfer list HTML (newest first)
    const sorted = [...Store.state.savingsTransfers].sort((a, b) => b.date.localeCompare(a.date));

    let listHtml = '';
    if (sorted.length === 0) {
      listHtml = '<p class="empty-state">No savings transfers yet. Add one above!</p>';
    } else {
      listHtml = sorted.map(t => {
        const dest = Utils.escapeHtml(t.destination);
        const note = t.note ? `<span class="savings-note">${Utils.escapeHtml(t.note)}</span>` : '';
        const dateLabel = Utils.escapeHtml(t.date);
        const amount = Utils.escapeHtml(Utils.formatCurrency(t.amount));
        return `
          <div class="savings-item" data-id="${Utils.escapeHtml(t.id)}">
            <div class="savings-item__info">
              <span class="savings-item__destination">${dest}</span>
              <span class="savings-item__date">${dateLabel}</span>
              ${note}
            </div>
            <div class="savings-item__right">
              <span class="savings-item__amount">${amount}</span>
              <button
                class="btn btn--danger btn--sm savings-delete-btn"
                data-id="${Utils.escapeHtml(t.id)}"
                aria-label="Delete transfer to ${dest}"
              >Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }

    container.innerHTML = `
      <div class="savings-stats">
        <div class="stat-card">
          <div class="stat-card__label">This Month</div>
          <div class="stat-card__value">${Utils.escapeHtml(Utils.formatCurrency(monthTotal))}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">All-Time Total</div>
          <div class="stat-card__value">${Utils.escapeHtml(Utils.formatCurrency(allTimeTotal))}</div>
        </div>
        <div class="stat-card stat-card--highlight">
          <div class="stat-card__label">Available to Save</div>
          <div class="stat-card__value">${Utils.escapeHtml(Utils.formatCurrency(availableForSavings))}</div>
        </div>
      </div>

      <div class="savings-form card">
        <h2 class="card__title">Add Savings Transfer</h2>
        <div class="form-group">
          <label for="input-savings-destination">Destination</label>
          <input id="input-savings-destination" type="text" placeholder="e.g. Emergency Fund" maxlength="100" />
        </div>
        <div class="form-group">
          <label for="input-savings-amount">Amount ($)</label>
          <input id="input-savings-amount" type="number" placeholder="0.00" min="0.01" step="0.01" />
        </div>
        <div class="form-group">
          <label for="input-savings-date">Date</label>
          <input id="input-savings-date" type="date" value="${Utils.escapeHtml(Utils.getDateKey(new Date()))}" />
        </div>
        <div class="form-group">
          <label for="input-savings-note">Note (optional)</label>
          <input id="input-savings-note" type="text" placeholder="Optional note" maxlength="200" />
        </div>
        <button class="btn btn--primary" id="savings-save-btn">Save Transfer</button>
      </div>

      <div class="savings-list card" id="savings-transfer-list">
        <h2 class="card__title">Transfer History</h2>
        <div class="savings-list__items" id="savings-items-container">
          ${listHtml}
        </div>
      </div>
    `;

    // Bind save button
    document.getElementById('savings-save-btn').addEventListener('click', saveSavingsTransfer);

    // Event delegation for delete buttons
    const itemsContainer = document.getElementById('savings-items-container');
    itemsContainer.addEventListener('click', _handleListClick);
  }

  function saveSavingsTransfer() {
    const destEl   = document.getElementById('input-savings-destination');
    const amtEl    = document.getElementById('input-savings-amount');
    const dateEl   = document.getElementById('input-savings-date');
    const noteEl   = document.getElementById('input-savings-note');

    const formEl = destEl.closest('.savings-form') || document.getElementById('page-savings');
    Utils.clearAllFieldErrors(formEl);

    let valid = true;

    const destValidation = Utils.validateText(destEl.value, 'Destination', 100);
    if (!destValidation.valid) {
      Utils.showFieldError(destEl, destValidation.error);
      valid = false;
    }

    const amtValidation = Utils.validatePositiveAmount(amtEl.value);
    if (!amtValidation.valid) {
      Utils.showFieldError(amtEl, amtValidation.error);
      valid = false;
    }

    const dateValidation = Utils.validateDateString(dateEl.value);
    if (!dateValidation.valid) {
      Utils.showFieldError(dateEl, dateValidation.error);
      valid = false;
    }

    if (!valid) return;

    const newTransfer = {
      id:          Utils.generateId(),
      destination: destEl.value.trim(),
      amount:      parseFloat(amtEl.value),
      date:        dateEl.value,
      note:        (noteEl.value || '').trim(),
    };

    const updated = [...Store.state.savingsTransfers, newTransfer];
    Store.setState({ savingsTransfers: updated });

    // Reset form fields
    destEl.value = '';
    amtEl.value  = '';
    dateEl.value = Utils.getDateKey(new Date());
    noteEl.value = '';

    Utils.showToast('Savings transfer saved!', 'success');
    renderSavingsPage();
  }

  function deleteSavingsTransfer(id) {
    if (_pendingDeletes.has(id)) {
      // Second tap — confirm deletion
      clearTimeout(_pendingDeletes.get(id));
      _pendingDeletes.delete(id);

      const updated = Store.state.savingsTransfers.filter(t => t.id !== id);
      Store.setState({ savingsTransfers: updated });
      Utils.showToast('Transfer deleted.', 'info');
      renderSavingsPage();
    } else {
      // First tap — arm the confirm
      const btn = document.querySelector(`.savings-delete-btn[data-id="${CSS.escape(id)}"]`);
      if (btn) {
        btn.textContent = 'Confirm?';
        btn.classList.add('btn--confirming');
      }
      const timeoutId = setTimeout(() => {
        _pendingDeletes.delete(id);
        if (btn) {
          btn.textContent = 'Delete';
          btn.classList.remove('btn--confirming');
        }
      }, 3000);
      _pendingDeletes.set(id, timeoutId);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  function _handleListClick(e) {
    const btn = e.target.closest('.savings-delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (id) deleteSavingsTransfer(id);
  }

  return {
    renderSavingsPage,
    saveSavingsTransfer,
    deleteSavingsTransfer,
    getTotalAllTime,
  };
})();

window.Savings = Savings;
