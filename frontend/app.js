/* EduTrack interactive web frontend — plain JavaScript, no dependencies */
'use strict';

const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Python', 'English'];
const GRADE_COLORS = {
  'A+': '#6568ed', A: '#878af1', 'B+': '#3ac5a7', B: '#69dabb',
  C: '#e6ad58', D: '#f1d193', F: '#eb8b89'
};
const state = { students: [], stats: null, filter: 'ALL', query: '', sort: 'roll',
                editRoll: null, selectedRoll: null, pendingDelete: null };
const $ = (id) => document.getElementById(id);
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (char) =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const initials = (name) => String(name).trim().split(/\s+/).slice(0, 2)
    .map(word => word[0] || '').join('').toUpperCase();
const pct = (number) => `${Number(number || 0).toFixed(2)}%`;
const findStudent = (roll) => state.students.find(student => student.roll_no === String(roll));

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {...(options.body ? {'Content-Type': 'application/json'} : {}), ...(options.headers || {})}
    });
  } catch (_) { throw new Error('Cannot connect to EduTrack. Check that the Python server is running.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function toast(message, isError = false) {
  const item = document.createElement('div');
  item.className = `toast${isError ? ' error' : ''}`;
  item.textContent = `${isError ? '⚠' : '✓'}  ${message}`;
  $('toastContainer').appendChild(item);
  window.setTimeout(() => item.remove(), 4300);
}

async function refresh() {
  const [studentData, stats] = await Promise.all([api('/api/students'), api('/api/stats')]);
  state.students = studentData.students;
  state.stats = stats;
  renderAll();
}

function renderAll() {
  const stats = state.stats;
  $('statTotal').textContent = stats.total.toLocaleString();
  $('navCount').textContent = stats.total;
  $('statRate').textContent = pct(stats.pass_rate);
  $('statPassed').textContent = `${stats.passed} passed`;
  $('statAverage').textContent = pct(stats.average);
  $('statTopper').textContent = stats.topper ? stats.topper.name : 'Not available';
  $('statTopperPct').textContent = stats.topper ? pct(stats.topper.percentage) : 'No topper';
  $('tableCount').textContent = stats.total;
  renderTable();
  renderAnalytics();
}

function filteredStudents() {
  const query = state.query.trim().toLocaleLowerCase();
  const students = state.students.filter(student => {
    const matchQuery = !query || [student.name, student.roll_no, student.course]
      .some(value => String(value).toLocaleLowerCase().includes(query));
    return matchQuery && (state.filter === 'ALL' || student.status === state.filter);
  });
  students.sort((a, b) => {
    if (state.sort === 'name') return a.name.localeCompare(b.name);
    if (state.sort === 'highest') return b.percentage - a.percentage || Number(a.roll_no) - Number(b.roll_no);
    if (state.sort === 'lowest') return a.percentage - b.percentage || Number(a.roll_no) - Number(b.roll_no);
    return Number(a.roll_no) - Number(b.roll_no);
  });
  return students;
}

function renderTable() {
  const students = filteredStudents();
  $('tableSummary').textContent = `Showing ${students.length} of ${state.students.length} students`;
  if (!students.length) {
    $('studentRows').innerHTML = '<tr><td colspan="7" class="empty-row">No matching students found. Try a different search or add a new record.</td></tr>';
    return;
  }
  $('studentRows').innerHTML = students.map((student, index) => {
    const percent = Math.min(100, Math.max(0, student.percentage));
    const fail = student.status === 'FAIL';
    return `<tr data-roll="${esc(student.roll_no)}" tabindex="0" aria-label="View ${esc(student.name)} record">
      <td><div class="student-name-cell"><div class="avatar tone-${index % 5}">${esc(initials(student.name))}</div><div><strong>${esc(student.name)}</strong><span>Student record</span></div></div></td>
      <td><span class="roll-number">#${esc(student.roll_no)}</span></td>
      <td><span class="course-badge">${esc(student.course)}</span></td>
      <td><div class="performance-cell"><b>${pct(student.percentage)}</b><span class="mini-track"><span class="mini-fill" style="display:block;width:${percent}%"></span></span></div></td>
      <td><span class="grade-badge ${fail ? 'fail' : ''}">${esc(student.grade)}</span></td>
      <td><span class="status-badge ${fail ? 'fail' : ''}">${esc(student.status)}</span></td>
      <td><div class="row-actions"><button class="row-action" data-action="view" data-roll="${esc(student.roll_no)}" title="View student details" aria-label="View ${esc(student.name)} details"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button><button class="row-action" data-action="edit" data-roll="${esc(student.roll_no)}" title="Edit student" aria-label="Edit ${esc(student.name)}"><svg viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l4-1 11-11a2 2 0 0 0-4-4L4 15v5Z"/></svg></button></div></td>
    </tr>`;
  }).join('');
}

function renderAnalytics() {
  const { subject_averages: averages, grades, total } = state.stats;
  $('subjectBars').innerHTML = SUBJECTS.map(subject => {
    const value = Math.min(100, Math.max(0, Number(averages[subject])));
    return `<div class="subject-row"><span>${esc(subject)}</span><div class="subject-track"><div class="subject-fill" style="width:${value}%"></div></div><b>${value.toFixed(1)}</b></div>`;
  }).join('');

  const gradeRows = Object.entries(GRADE_COLORS);
  let offset = 0;
  const gradients = gradeRows.map(([grade, color]) => {
    const fraction = total ? (grades[grade] || 0) / total * 100 : 0;
    const segment = `${color} ${offset}% ${offset + fraction}%`;
    offset += fraction;
    return segment;
  });
  $('gradeDonut').style.background = total ? `conic-gradient(${gradients.join(', ')})` : '#eff0f7';
  $('donutTotal').textContent = total;
  $('gradeLegend').innerHTML = gradeRows.map(([grade, color]) =>
    `<div class="legend-item"><span class="legend-color" style="background:${color}"></span><span>${esc(grade)}</span><strong>${grades[grade] || 0}</strong></div>`
  ).join('');
}

function setModal(id, visible) {
  $(id).hidden = !visible;
  document.body.style.overflow = document.querySelector('.modal-backdrop:not([hidden])') ? 'hidden' : '';
}

function openForm(roll = null) {
  const student = roll ? findStudent(roll) : null;
  if (roll && !student) { toast('Student record not found.', true); return; }
  state.editRoll = student ? student.roll_no : null;
  $('formEyebrow').textContent = student ? 'EDIT RECORD' : 'NEW RECORD';
  $('formTitle').textContent = student ? 'Edit Student' : 'Add New Student';
  $('formSubmit').innerHTML = student ? 'Save Changes <span>→</span>' : 'Save Student <span>→</span>';
  $('formError').hidden = true;
  $('studentForm').reset();
  $('rollInput').disabled = Boolean(student);
  $('rollInput').value = student ? student.roll_no : '';
  $('nameInput').value = student ? student.name : '';
  $('courseInput').value = student ? student.course : 'CSE AI & ML';
  $('markInputs').innerHTML = SUBJECTS.map(subject =>
    `<label class="field"><span>${esc(subject)} <i>*</i></span><input type="number" required min="0" max="100" step="1" data-subject="${esc(subject)}" placeholder="0–100" value="${student ? student.marks[subject] : ''}"></label>`
  ).join('');
  setModal('detailsBackdrop', false);
  setModal('formBackdrop', true);
  $('rollInput').disabled ? $('nameInput').focus() : $('rollInput').focus();
}

function closeForm() { setModal('formBackdrop', false); state.editRoll = null; }

async function saveForm(event) {
  event.preventDefault();
  const marks = {};
  const error = $('formError');
  error.hidden = true;
  for (const subject of SUBJECTS) {
    const value = [...document.querySelectorAll('#markInputs input')]
      .find(input => input.dataset.subject === subject).value.trim();
    const number = Number(value);
    if (value === '' || !/^\d+$/.test(value) || !Number.isInteger(number) || number < 0 || number > 100) {
      error.textContent = `${subject}: please enter a whole number from 0 to 100.`;
      error.hidden = false;
      return;
    }
    marks[subject] = number;
  }
  const student = {
    roll_no: $('rollInput').value.trim(), name: $('nameInput').value.trim(),
    course: $('courseInput').value.trim(), marks
  };
  if (!/^\d{1,8}$/.test(student.roll_no) || Number(student.roll_no) < 1 ||
      student.name.length < 2 || student.course.length < 2) {
    error.textContent = 'Enter a positive roll number (up to 8 digits), name and course (at least 2 characters).';
    error.hidden = false;
    return;
  }
  const saveButton = $('formSubmit');
  saveButton.disabled = true;
  try {
    const editing = Boolean(state.editRoll);
    const destination = editing ? `/api/students/${encodeURIComponent(state.editRoll)}` : '/api/students';
    const result = await api(destination, {method: editing ? 'PUT' : 'POST', body: JSON.stringify(student)});
    closeForm();
    await refresh();
    toast(result.message);
  } catch (err) { error.textContent = err.message; error.hidden = false; }
  finally { saveButton.disabled = false; }
}

function openDetails(roll) {
  const student = findStudent(roll);
  if (!student) { toast('Student record not found.', true); return; }
  state.selectedRoll = student.roll_no;
  $('detailName').textContent = student.name;
  $('detailSub').textContent = `Roll #${student.roll_no} · ${student.course}`;
  $('detailAvatar').textContent = initials(student.name);
  $('detailPercentage').textContent = pct(student.percentage);
  $('detailGrade').innerHTML = `<span class="grade-badge ${student.status === 'FAIL' ? 'fail' : ''}">Grade ${esc(student.grade)}</span>`;
  $('detailResults').innerHTML = `<span class="detail-result-chip">Total: <b>${student.total}/500</b></span><span class="detail-result-chip">Result: <b>${student.status}</b></span><span class="detail-result-chip">Percentage: <b>${pct(student.percentage)}</b></span>`;
  $('detailSubjects').innerHTML = SUBJECTS.map(subject => {
    const value = student.marks[subject];
    const fail = value < 35;
    return `<div class="detail-subject"><div class="detail-subject-head"><span>${esc(subject)}</span><b class="${fail ? 'fail' : ''}">${value}/100 ${fail ? '· Below passing marks' : ''}</b></div><div class="detail-progress"><i class="${fail ? 'fail' : ''}" style="width:${value}%"></i></div></div>`;
  }).join('');
  setModal('detailsBackdrop', true);
}

function closeDetails() { setModal('detailsBackdrop', false); state.selectedRoll = null; }

function openConfirm() {
  const student = findStudent(state.selectedRoll);
  if (!student) return;
  state.pendingDelete = student.roll_no;
  $('confirmText').textContent = `You are about to permanently delete ${student.name} (Roll #${student.roll_no}). This action cannot be undone.`;
  setModal('detailsBackdrop', false);
  setModal('confirmBackdrop', true);
}
function closeConfirm() { state.pendingDelete = null; setModal('confirmBackdrop', false); }
async function confirmDelete() {
  if (!state.pendingDelete) return;
  const button = $('confirmDelete');
  button.disabled = true;
  try {
    const result = await api(`/api/students/${encodeURIComponent(state.pendingDelete)}`, {method: 'DELETE'});
    closeConfirm();
    state.selectedRoll = null;
    await refresh();
    toast(result.message);
  } catch (err) { toast(err.message, true); }
  finally { button.disabled = false; }
}

function mobileMenu(visible) {
  $('sidebar').classList.toggle('open', visible);
  $('mobileOverlay').hidden = !visible;
  $('menuToggle').setAttribute('aria-expanded', String(visible));
}

function navigate(id) {
  if (id === 'students' || id === 'analytics' || id === 'overview') {
    $(id).scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    document.querySelectorAll('.nav-link[data-scroll]').forEach(item =>
      item.classList.toggle('active', item.dataset.scroll === id));
    mobileMenu(false);
  }
}

function exportCsv() {
  const link = document.createElement('a');
  link.href = '/api/export';
  link.download = 'student_results.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast('CSV export requested. Check your Downloads folder.');
}

function bindEvents() {
  $('studentSearch').addEventListener('input', (event) => {
    state.query = event.target.value;
    renderTable();
  });
  $('sortSelect').addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderTable();
  });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(filter =>
      filter.classList.toggle('active', filter === button));
    renderTable();
  }));
  $('studentForm').addEventListener('submit', saveForm);
  $('menuToggle').addEventListener('click', () => mobileMenu(!$('sidebar').classList.contains('open')));
  $('mobileOverlay').addEventListener('click', () => mobileMenu(false));

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    const scroll = event.target.closest('[data-scroll]');
    if (scroll) navigate(scroll.dataset.scroll);
    if (action) {
      switch (action.dataset.action) {
        case 'add': openForm(); break;
        case 'edit': openForm(action.dataset.roll); break;
        case 'view': openDetails(action.dataset.roll); break;
        case 'export': exportCsv(); break;
        case 'close-form': closeForm(); break;
        case 'close-details': closeDetails(); break;
        case 'edit-selected': { const roll = state.selectedRoll; closeDetails(); openForm(roll); break; }
        case 'delete-selected': openConfirm(); break;
        case 'close-confirm': closeConfirm(); break;
        case 'confirm-delete': confirmDelete(); break;
      }
      return;
    }
    const row = event.target.closest('tr[data-roll]');
    if (row) openDetails(row.dataset.roll);
  });
  $('studentRows').addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-roll]')) {
      event.preventDefault();
      openDetails(event.target.dataset.roll);
    }
  });
  ['formBackdrop', 'detailsBackdrop', 'confirmBackdrop'].forEach(id => {
    $(id).addEventListener('click', (event) => {
      if (event.target !== $(id)) return;
      if (id === 'formBackdrop') closeForm();
      else if (id === 'detailsBackdrop') closeDetails();
      else closeConfirm();
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('confirmBackdrop').hidden) closeConfirm();
    else if (!$('formBackdrop').hidden) closeForm();
    else if (!$('detailsBackdrop').hidden) closeDetails();
    else mobileMenu(false);
  });
}

bindEvents();
refresh().catch(error => {
  $('studentRows').innerHTML = `<tr><td colspan="7" class="empty-row">${esc(error.message)}</td></tr>`;
  toast(error.message, true);
});
