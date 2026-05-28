'use strict';

const Dashboard = (() => {

  // ── Public API ────────────────────────────────────────────────────────────

  function getWeeklySummary() {
    const today    = new Date();
    today.setHours(0, 0, 0, 0);

    // Roll back to Sunday
    const dayOfWeek  = today.getDay(); // 0=Sun … 6=Sat
    const startDate  = new Date(today);
    startDate.setDate(today.getDate() - dayOfWeek);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    // Build a set of date keys for the current week
    const weekKeys = [];
    for (let i = 0; i <= 6; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      weekKeys.push(Utils.getDateKey(d));
    }

    // Spending per day this week (expenses only)
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const spendByDay   = {}; // dateKey -> total spent
    const habitsOnDay  = {}; // dateKey -> count completed
    weekKeys.forEach(k => { spendByDay[k] = 0; habitsOnDay[k] = 0; });

    // Tally transactions
    Store.state.transactions.forEach(t => {
      if (t.type !== 'expense') return;
      if (weekKeys.includes(t.date)) {
        spendByDay[t.date] = (spendByDay[t.date] || 0) + t.amount;
      }
    });

    // Tally habit completions
    Store.state.habits.forEach(habit => {
      weekKeys.forEach(k => {
        if (habit.completions && habit.completions[k]) {
          habitsOnDay[k] = (habitsOnDay[k] || 0) + 1;
        }
      });
    });

    const totalHabits  = Store.state.habits.length;
    const weekSpent    = Object.values(spendByDay).reduce((s, v) => s + v, 0);

    // Week habit rate: completed completions / possible completions
    const totalPossible  = totalHabits * 7;
    const totalCompleted = Object.values(habitsOnDay).reduce((s, v) => s + v, 0);
    const weekHabitRate  = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    // Average daily spend (only count days up to today within the week)
    const daysElapsed = Math.min(dayOfWeek + 1, 7);
    const avgDailySpend = daysElapsed > 0 ? weekSpent / daysElapsed : 0;

    // Best day: highest score of (habits_completed - spending/10)
    let bestDay = 'None yet';
    let bestScore = -Infinity;
    weekKeys.forEach((k, i) => {
      // Only include days up to today
      if (i > dayOfWeek) return;
      const score = (habitsOnDay[k] || 0) - ((spendByDay[k] || 0) / 10);
      if (score > bestScore) {
        bestScore = score;
        bestDay   = DAY_NAMES[i];
      }
    });

    return {
      startDate:    Utils.getDateKey(startDate),
      endDate:      Utils.getDateKey(endDate),
      weekSpent,
      avgDailySpend,
      weekHabitRate,
      bestDay,
    };
  }

  function renderDashboard() {
    const container = document.getElementById('page-dashboard');
    if (!container) return;

    // ── Gather data ───────────────────────────────────────────────────────

    let budgetStats;
    try {
      budgetStats = Budget.getStats();
    } catch (e) {
      budgetStats = {
        monthlySalary: 0,
        needsBudget: 0,
        wantsBudget: 0,
        needsSpent: 0,
        wantsSpent: 0,
        totalSpent: 0,
        totalRemaining: 0,
        needsPct: 0,
        wantsPct: 0,
      };
    }

    let habitStats;
    try {
      habitStats = Habits.getStats();
    } catch (e) {
      habitStats = { todayCompleted: 0, totalHabits: 0, monthRate: 0, currentStreak: 0 };
    }

    const weekly = getWeeklySummary();

    // ── Budget alerts ─────────────────────────────────────────────────────
    const alerts = _buildAlerts(budgetStats);

    // ── Monthly overview values ───────────────────────────────────────────
    const totalSpent     = budgetStats.totalSpent      || 0;
    const totalBudget    = budgetStats.monthlySalary   || 0;
    const totalRemaining = Math.max(0, totalBudget - totalSpent);
    const budgetUsedPct  = totalBudget > 0 ? Utils.clamp(Math.round((totalSpent / totalBudget) * 100), 0, 100) : 0;
    const habitDonePct   = habitStats.monthRate != null ? Utils.clamp(Math.round(habitStats.monthRate), 0, 100) : 0;

    // Needs/wants progress bars
    const needsSpent  = budgetStats.needsSpent  || 0;
    const wantsSpent  = budgetStats.wantsSpent  || 0;
    const needsBudget = budgetStats.needsBudget || 0;
    const wantsBudget = budgetStats.wantsBudget || 0;
    const needsPct    = needsBudget > 0 ? Utils.clamp(Math.round((needsSpent / needsBudget) * 100), 0, 100) : 0;
    const wantsPct    = wantsBudget > 0 ? Utils.clamp(Math.round((wantsSpent / wantsBudget) * 100), 0, 100) : 0;

    // ── Render ────────────────────────────────────────────────────────────

    container.innerHTML = `
      <div id="dashboard-alerts">${alerts}</div>

      <!-- Weekly Summary -->
      <div class="dashboard-card card">
        <h2 class="card__title">This Week</h2>
        <p class="dashboard-card__range">${Utils.escapeHtml(weekly.startDate)} – ${Utils.escapeHtml(weekly.endDate)}</p>
        <div class="dashboard-stats">
          <div class="stat-item">
            <span class="stat-item__label">Week Spent</span>
            <span class="stat-item__value">${Utils.escapeHtml(Utils.formatCurrency(weekly.weekSpent))}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__label">Avg Daily Spend</span>
            <span class="stat-item__value">${Utils.escapeHtml(Utils.formatCurrency(weekly.avgDailySpend))}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__label">Habit Rate</span>
            <span class="stat-item__value">${Utils.escapeHtml(String(weekly.weekHabitRate))}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__label">Best Day</span>
            <span class="stat-item__value">${Utils.escapeHtml(weekly.bestDay)}</span>
          </div>
        </div>
      </div>

      <!-- Monthly Overview -->
      <div class="dashboard-card card">
        <h2 class="card__title">This Month</h2>
        <div class="dashboard-stats">
          <div class="stat-item">
            <span class="stat-item__label">Spent</span>
            <span class="stat-item__value">${Utils.escapeHtml(Utils.formatCurrency(totalSpent))}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__label">Remaining</span>
            <span class="stat-item__value">${Utils.escapeHtml(Utils.formatCurrency(totalRemaining))}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__label">Habits Done</span>
            <span class="stat-item__value">${Utils.escapeHtml(String(habitStats.todayCompleted || 0))} / ${Utils.escapeHtml(String(habitStats.totalHabits || 0))}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item__label">Streak</span>
            <span class="stat-item__value">${Utils.escapeHtml(String(habitStats.currentStreak || 0))} days</span>
          </div>
        </div>
        <div class="progress-section">
          <div class="progress-row">
            <span class="progress-label">Budget Used</span>
            <span class="progress-pct">${Utils.escapeHtml(String(budgetUsedPct))}%</span>
          </div>
          ${_progressBar(budgetUsedPct, budgetUsedPct >= 100 ? 'progress--over' : budgetUsedPct >= 90 ? 'progress--warn' : '')}
          <div class="progress-row">
            <span class="progress-label">Habit Completion</span>
            <span class="progress-pct">${Utils.escapeHtml(String(habitDonePct))}%</span>
          </div>
          ${_progressBar(habitDonePct, 'progress--habits')}
        </div>
      </div>

      <!-- Budget Breakdown -->
      <div class="dashboard-card card">
        <h2 class="card__title">Budget Breakdown</h2>
        <div class="budget-breakdown">
          <div class="breakdown-row">
            <div class="breakdown-row__labels">
              <span>Needs</span>
              <span>${Utils.escapeHtml(Utils.formatCurrencyShort(needsSpent))} / ${Utils.escapeHtml(Utils.formatCurrencyShort(needsBudget))}</span>
            </div>
            ${_progressBar(needsPct, needsPct >= 100 ? 'progress--over' : needsPct >= 90 ? 'progress--warn' : 'progress--needs')}
          </div>
          <div class="breakdown-row">
            <div class="breakdown-row__labels">
              <span>Wants</span>
              <span>${Utils.escapeHtml(Utils.formatCurrencyShort(wantsSpent))} / ${Utils.escapeHtml(Utils.formatCurrencyShort(wantsBudget))}</span>
            </div>
            ${_progressBar(wantsPct, wantsPct >= 100 ? 'progress--over' : wantsPct >= 90 ? 'progress--warn' : 'progress--wants')}
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="dashboard-card card">
        <h2 class="card__title">Spending (Last 7 Days)</h2>
        <canvas id="spending-graph" width="400" height="200"></canvas>
      </div>
      <div class="dashboard-card card">
        <h2 class="card__title">Habit Completion (Last 7 Days)</h2>
        <canvas id="habit-graph" width="400" height="200"></canvas>
      </div>
    `;

    // Trigger chart redraws after DOM paint
    setTimeout(() => {
      try { Charts.drawSpendingGraph(); } catch (e) { /* Charts not available */ }
      try { Charts.drawHabitGraph();   } catch (e) { /* Charts not available */ }
    }, 50);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  function _progressBar(pct, extraClass = '') {
    const safePct = Utils.clamp(pct, 0, 100);
    return `
      <div class="progress-bar${extraClass ? ' ' + Utils.escapeHtml(extraClass) : ''}">
        <div class="progress-bar__fill" style="width:${Utils.escapeHtml(String(safePct))}%"></div>
      </div>
    `;
  }

  function _buildAlerts(stats) {
    let html = '';

    const needsSpent  = stats.needsSpent  || 0;
    const wantsSpent  = stats.wantsSpent  || 0;
    const needsBudget = stats.needsBudget || 0;
    const wantsBudget = stats.wantsBudget || 0;

    const categories = [
      { label: 'Needs',  spent: needsSpent,  budget: needsBudget },
      { label: 'Wants',  spent: wantsSpent,  budget: wantsBudget },
    ];

    categories.forEach(cat => {
      if (cat.budget <= 0) return;
      const pct = (cat.spent / cat.budget) * 100;
      if (pct >= 100) {
        html += `
          <div class="alert alert--error" role="alert">
            <strong>${Utils.escapeHtml(cat.label)} budget exceeded!</strong>
            Spent ${Utils.escapeHtml(Utils.formatCurrency(cat.spent))} of ${Utils.escapeHtml(Utils.formatCurrency(cat.budget))}
            (${Utils.escapeHtml(String(Math.round(pct)))}%).
          </div>
        `;
      } else if (pct >= 90) {
        html += `
          <div class="alert alert--warn" role="alert">
            <strong>${Utils.escapeHtml(cat.label)} budget at ${Utils.escapeHtml(String(Math.round(pct)))}%.</strong>
            ${Utils.escapeHtml(Utils.formatCurrency(cat.budget - cat.spent))} remaining.
          </div>
        `;
      }
    });

    return html;
  }

  return {
    renderDashboard,
    getWeeklySummary,
  };
})();

window.Dashboard = Dashboard;
