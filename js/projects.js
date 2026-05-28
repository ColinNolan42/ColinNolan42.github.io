'use strict';

const Projects = (() => {
  // Tracks which delete button is in the "armed" state (tap-twice confirm)
  const _pendingDeletes = new Map(); // id -> timeoutId

  // Priority badge config
  const PRIORITY_CLASSES = {
    High:   'badge--high',
    Medium: 'badge--medium',
    Low:    'badge--low',
  };

  // ── Public API ────────────────────────────────────────────────────────────

  function renderProjectsPage() {
    const container = document.getElementById('page-projects');
    if (!container) return;

    const active    = Store.state.projects.filter(p => !p.completed);
    const completed = Store.state.projects.filter(p =>  p.completed);

    // Sort active: High → Medium → Low, then alphabetical within priority
    const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
    const sortActive = [...active].sort((a, b) => {
      const pd = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      if (pd !== 0) return pd;
      return a.title.localeCompare(b.title);
    });

    // Sort completed: most recently completed first
    const sortCompleted = [...completed].sort((a, b) => {
      const da = a.completedAt || a.createdAt || '';
      const db = b.completedAt || b.createdAt || '';
      return db.localeCompare(da);
    });

    container.innerHTML = `
      <div class="projects-form card">
        <h2 class="card__title">Add Project</h2>
        <div class="form-group">
          <label for="input-project-title">Title <span aria-hidden="true">*</span></label>
          <input id="input-project-title" type="text" placeholder="Project title" maxlength="100" />
        </div>
        <div class="form-group">
          <label for="input-project-category">Category <span aria-hidden="true">*</span></label>
          <input id="input-project-category" type="text" placeholder="e.g. Work, Personal, Finance" maxlength="100" />
        </div>
        <div class="form-group">
          <label for="input-project-priority">Priority</label>
          <select id="input-project-priority">
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="form-group">
          <label for="input-project-description">Description (optional)</label>
          <textarea id="input-project-description" placeholder="What is this project about?" maxlength="1000" rows="3"></textarea>
        </div>
        <button class="btn btn--primary" id="projects-save-btn">Add Project</button>
      </div>

      <section class="projects-section card">
        <h2 class="card__title">Active Projects <span class="count-badge">${Utils.escapeHtml(String(active.length))}</span></h2>
        <div class="projects-list" id="active-projects-list">
          ${_renderProjectList(sortActive, false)}
        </div>
      </section>

      <section class="projects-section card">
        <h2 class="card__title">Completed <span class="count-badge">${Utils.escapeHtml(String(completed.length))}</span></h2>
        <div class="projects-list" id="completed-projects-list">
          ${_renderProjectList(sortCompleted, true)}
        </div>
      </section>
    `;

    // Bind save button
    document.getElementById('projects-save-btn').addEventListener('click', saveProject);

    // Event delegation on both lists
    document.getElementById('active-projects-list').addEventListener('click', _handleListClick);
    document.getElementById('completed-projects-list').addEventListener('click', _handleListClick);
  }

  function saveProject() {
    const titleEl    = document.getElementById('input-project-title');
    const categoryEl = document.getElementById('input-project-category');
    const priorityEl = document.getElementById('input-project-priority');
    const descEl     = document.getElementById('input-project-description');

    const formEl = titleEl.closest('.projects-form') || document.getElementById('page-projects');
    Utils.clearAllFieldErrors(formEl);

    let valid = true;

    const titleValidation = Utils.validateText(titleEl.value, 'Title', 100);
    if (!titleValidation.valid) {
      Utils.showFieldError(titleEl, titleValidation.error);
      valid = false;
    }

    const categoryValidation = Utils.validateText(categoryEl.value, 'Category', 100);
    if (!categoryValidation.valid) {
      Utils.showFieldError(categoryEl, categoryValidation.error);
      valid = false;
    }

    if (!valid) return;

    // Description is optional; only validate length if provided
    const descValue = (descEl.value || '').trim();
    if (descValue.length > 1000) {
      Utils.showFieldError(descEl, 'Description must be 1000 characters or fewer.');
      return;
    }

    const newProject = {
      id:          Utils.generateId(),
      title:       titleEl.value.trim(),
      category:    categoryEl.value.trim(),
      priority:    priorityEl.value,
      description: descValue,
      completed:   false,
      createdAt:   new Date().toISOString(),
    };

    const updated = [...Store.state.projects, newProject];
    Store.setState({ projects: updated });

    // Reset form
    titleEl.value    = '';
    categoryEl.value = '';
    priorityEl.value = 'Medium';
    descEl.value     = '';

    Utils.showToast('Project added!', 'success');
    renderProjectsPage();
  }

  function deleteProject(id) {
    if (_pendingDeletes.has(id)) {
      clearTimeout(_pendingDeletes.get(id));
      _pendingDeletes.delete(id);

      const updated = Store.state.projects.filter(p => p.id !== id);
      Store.setState({ projects: updated });
      Utils.showToast('Project deleted.', 'info');
      renderProjectsPage();
    } else {
      const btn = document.querySelector(`.project-delete-btn[data-id="${CSS.escape(id)}"]`);
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

  function toggleProjectComplete(id) {
    const project = Store.state.projects.find(p => p.id === id);
    if (!project) return;

    const nowIso = new Date().toISOString();
    const updated = Store.state.projects.map(p => {
      if (p.id !== id) return p;
      const completing = !p.completed;
      return {
        ...p,
        completed:   completing,
        completedAt: completing ? nowIso : undefined,
      };
    });

    Store.setState({ projects: updated });
    Utils.showToast(project.completed ? 'Project reopened.' : 'Project completed!', 'success');
    renderProjectsPage();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  function _renderProjectList(projects, isCompleted) {
    if (projects.length === 0) {
      const msg = isCompleted
        ? 'No completed projects yet.'
        : 'No active projects. Add one above!';
      return `<p class="empty-state">${Utils.escapeHtml(msg)}</p>`;
    }

    return projects.map(p => {
      const title    = Utils.escapeHtml(p.title);
      const category = Utils.escapeHtml(p.category);
      const priority = Utils.escapeHtml(p.priority || 'Medium');
      const desc     = p.description ? Utils.escapeHtml(p.description) : '';
      const badgeCls = Utils.escapeHtml(PRIORITY_CLASSES[p.priority] || PRIORITY_CLASSES.Medium);
      const id       = Utils.escapeHtml(p.id);

      const completedClass = isCompleted ? 'project-item--completed' : '';
      const toggleLabel    = isCompleted ? 'Reopen' : 'Complete';
      const toggleCls      = isCompleted ? 'btn--secondary' : 'btn--success';

      const descHtml = desc
        ? `<p class="project-item__desc">${desc}</p>`
        : '';

      return `
        <div class="project-item ${completedClass}" data-id="${id}">
          <div class="project-item__header">
            <span class="project-item__title">${title}</span>
            <span class="badge ${badgeCls}">${priority}</span>
          </div>
          <span class="project-item__category">${category}</span>
          ${descHtml}
          <div class="project-item__actions">
            <button
              class="btn btn--sm ${toggleCls} project-toggle-btn"
              data-id="${id}"
              aria-label="${Utils.escapeHtml(toggleLabel)} project: ${title}"
            >${Utils.escapeHtml(toggleLabel)}</button>
            <button
              class="btn btn--sm btn--danger project-delete-btn"
              data-id="${id}"
              aria-label="Delete project: ${title}"
            >Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function _handleListClick(e) {
    // Toggle complete
    const toggleBtn = e.target.closest('.project-toggle-btn');
    if (toggleBtn) {
      const id = toggleBtn.dataset.id;
      if (id) toggleProjectComplete(id);
      return;
    }

    // Delete (tap-twice)
    const deleteBtn = e.target.closest('.project-delete-btn');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (id) deleteProject(id);
    }
  }

  return {
    renderProjectsPage,
    saveProject,
    deleteProject,
    toggleProjectComplete,
  };
})();

window.Projects = Projects;
