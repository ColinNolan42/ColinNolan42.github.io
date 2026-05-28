'use strict';

const Charts = (() => {
  const COLORS = {
    needs:   { light: '#3b82f6', dark: '#60a5fa' },
    grid:    { light: 'rgba(0,0,0,0.06)', dark: 'rgba(255,255,255,0.08)' },
    text:    { light: '#6b7280', dark: '#9ca3af' },
    habit:   { light: '#10b981', dark: '#34d399' },
    habitBg: { light: 'rgba(16,185,129,0.15)', dark: 'rgba(52,211,153,0.15)' },
    future:  { light: 'rgba(0,0,0,0.08)', dark: 'rgba(255,255,255,0.06)' },
  };

  function _theme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function _col(key) {
    return COLORS[key][_theme()];
  }

  function _prepCanvas(canvas) {
    const parent = canvas.parentElement;
    const w = (parent && parent.offsetWidth > 0) ? parent.offsetWidth : 320;
    const h = canvas.height || 180;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w, h };
  }

  function _drawGrid(ctx, w, h, pad, steps) {
    ctx.save();
    ctx.strokeStyle = _col('grid');
    ctx.lineWidth = 1;
    const chartH = h - pad.top - pad.bottom;
    for (let i = 0; i <= steps; i++) {
      const y = pad.top + (chartH / steps) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function _label(ctx, text, x, y, align = 'right') {
    ctx.save();
    ctx.fillStyle = _col('text');
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = align;
    ctx.fillText(text, x, y + 4);
    ctx.restore();
  }

  // Bar chart: spending per day in the current month.
  // Called by dashboard.js as Charts.drawSpendingGraph() with no args.
  function drawSpendingGraph() {
    const canvas = document.getElementById('spending-graph');
    if (!canvas) return;

    const transactions = (typeof Store !== 'undefined') ? Store.getMonthTransactions() : [];
    const { ctx, w, h } = _prepCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 12, right: 8, bottom: 32, left: 48 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const now = new Date();
    const daysTotal = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const today = now.getDate();
    const byDay = new Array(daysTotal).fill(0);

    transactions.forEach(t => {
      if (t.type === 'expense') {
        const day = new Date(t.date + 'T00:00:00').getDate();
        if (day >= 1 && day <= daysTotal) byDay[day - 1] += Number(t.amount) || 0;
      }
    });

    const maxVal = Math.max(...byDay, 1);
    const roundedMax = Math.ceil(maxVal / 50) * 50 || 50;
    const ySteps = 4;

    _drawGrid(ctx, w, h, pad, ySteps);

    for (let i = 0; i <= ySteps; i++) {
      const val = roundedMax - (roundedMax / ySteps) * i;
      const y = pad.top + (chartH / ySteps) * i;
      _label(ctx, '$' + Math.round(val), pad.left - 4, y, 'right');
    }

    const gap  = chartW / daysTotal;
    const barW = Math.max(2, gap * 0.7);

    byDay.forEach((val, i) => {
      const barH = (val / roundedMax) * chartH;
      const x    = pad.left + i * gap + (gap - barW) / 2;
      const y    = pad.top + chartH - barH;

      ctx.save();
      ctx.fillStyle = (i + 1) <= today ? _col('needs') : _col('future');
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barW, Math.max(barH, 1), [2, 2, 0, 0]);
      } else {
        ctx.rect(x, y, barW, Math.max(barH, 1));
      }
      ctx.fill();
      ctx.restore();
    });

    const labelEvery = daysTotal <= 15 ? 3 : 5;
    for (let i = 0; i < daysTotal; i++) {
      if ((i + 1) === 1 || (i + 1) % labelEvery === 0 || (i + 1) === daysTotal) {
        const x = pad.left + i * gap + gap / 2;
        _label(ctx, String(i + 1), x, h - pad.bottom + 12, 'center');
      }
    }
  }

  // Line/area chart: daily habit completion rate over the past 7 days.
  // Called by dashboard.js as Charts.drawHabitGraph() with no args.
  function drawHabitGraph() {
    const canvas = document.getElementById('habit-graph');
    if (!canvas) return;

    const habits     = (typeof Store !== 'undefined') ? Store.state.habits : [];
    const anchorDate = (typeof Store !== 'undefined') ? Store.state.habitDate : new Date();
    const { ctx, w, h } = _prepCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 12, right: 8, bottom: 32, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const anchor = anchorDate instanceof Date ? anchorDate : new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const key   = Utils.getDateKey(d);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
      let completed = 0;
      habits.forEach(habit => {
        if (habit.completions && habit.completions[key]) completed++;
      });
      const rate = habits.length > 0 ? completed / habits.length : 0;
      days.push({ label, rate });
    }

    const ySteps = 4;
    _drawGrid(ctx, w, h, pad, ySteps);

    for (let i = 0; i <= ySteps; i++) {
      const val = 100 - (100 / ySteps) * i;
      const y = pad.top + (chartH / ySteps) * i;
      _label(ctx, Math.round(val) + '%', pad.left - 4, y, 'right');
    }

    const segW = chartW / (days.length - 1);
    const points = days.map((d, i) => ({
      x: pad.left + i * segW,
      y: pad.top + chartH - d.rate * chartH,
      label: d.label,
    }));

    // Fill area
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = _col('habitBg');
    ctx.fill();
    ctx.restore();

    // Line
    ctx.save();
    ctx.strokeStyle = _col('habit');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();

    // Dots
    points.forEach(p => {
      ctx.save();
      ctx.fillStyle = _col('habit');
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    points.forEach(p => _label(ctx, p.label, p.x, h - pad.bottom + 12, 'center'));
  }

  function redrawAll() {
    drawSpendingGraph();
    drawHabitGraph();
  }

  function onResize() { redrawAll(); }

  return { drawSpendingGraph, drawHabitGraph, redrawAll, onResize };
})();
