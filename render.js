// ============================================================================
// render.js
// Tutte le funzioni che leggono lo "state" e aggiornano il DOM di conseguenza.
// Nessuna di queste funzioni modifica lo stato: si limitano a "disegnarlo".
// ============================================================================

import { state } from './state.js';
import { MONTHS, WEEKDAYS, DEFAULT_SETTINGS } from './constants.js';
import { $, minutesToTime, dateKey, keyFor, escapeHtml } from './utils.js';
import { serviceYearFor, serviceYearMonths, monthGoal, totals, validMinutes, annualValid, entriesForDate } from './selectors.js';
import { supabaseClient } from './storage.js';

/** Applica il tema (chiaro/scuro) e i colori personalizzati come variabili CSS. */
export function applyTheme() {
  document.body.classList.toggle('dark', state.settings.theme === 'dark');
  const root = document.documentElement.style;
  root.setProperty('--service', state.settings.serviceColor);
  root.setProperty('--work', state.settings.workColor);
  root.setProperty('--blue', state.settings.buttonColor);
  // BUG RISOLTO: questa variabile veniva impostata ma non era referenziata
  // da nessuna regola in styles.css, quindi il selettore "Colore
  // barre/progressi" nelle impostazioni non aveva alcun effetto visibile.
  // Ora .progress-fill, .percent e .mini-track in styles.css usano
  // var(--progress), quindi il colore scelto qui si vede davvero.
  root.setProperty('--progress', state.settings.progressColor);
  // NOVITA' (spec punto 18): colore icone/testi/sfondo personalizzabili.
  // Applichiamo --text/--bg SOLO se l'utente li ha effettivamente
  // personalizzati (diversi dal default): altrimenti restano gestiti dalla
  // regola CSS "body.dark", che altrimenti verrebbe sempre sovrascritta da
  // uno stile inline con priorita' piu' alta, rompendo il tema scuro.
  root.setProperty('--icon', state.settings.iconColor);
  if (state.settings.textColor !== DEFAULT_SETTINGS.textColor) root.setProperty('--text', state.settings.textColor);
  else root.removeProperty('--text');
  if (state.settings.bgColor !== DEFAULT_SETTINGS.bgColor) root.setProperty('--bg', state.settings.bgColor);
  else root.removeProperty('--bg');
}

/** Ridisegna tutta l'interfaccia principale. Va richiamata dopo ogni modifica ai dati. */
export function render() {
  applyTheme();
  renderHeader();
  renderMonth();
  renderAnnual();
  renderCalendarLarge();
  renderSettings();
  updateAuthVisibility();
}

/** Mostra/nasconde le voci "Esci" (sidebar e impostazioni) in base allo stato di login. */
function updateAuthVisibility() {
  const loggedIn = Boolean(supabaseClient && state.user);
  document.querySelectorAll('.signout-item').forEach((el) => el.classList.toggle('hidden', !loggedIn));
}

function renderHeader() {
  const d = state.current;
  const year = serviceYearFor(d);
  $('monthTitle').textContent = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const a = annualValid(year);
  const goal = state.settings.annualGoalMinutes;
  $('annualBadge').innerHTML = `${minutesToTime(a)} / ${minutesToTime(goal)} ore <small>Totale anno</small>`;
  $('sideAnnualGoal').textContent = minutesToTime(goal);
}

function renderMonth() {
  const d = state.current;
  const { service, work } = totals(d);
  const goal = monthGoal(d);
  const valid = validMinutes(d);
  const pct = goal ? Math.min(100, Math.round((valid / goal) * 100)) : 0;

  // Spec punto 8: nel riepilogo NON si mostra l'obiettivo mensile come
  // badge separato, perche' e' gia' rappresentato dentro la barra
  // ("valide / obiettivo"). Sotto la barra mostriamo solo la didascalia
  // "Ore valide", come nel mockup fornito.
  $('monthProgress').style.width = `${pct}%`;
  $('monthProgressText').textContent = `${minutesToTime(valid)} / ${minutesToTime(goal)} ore`;
  $('monthPercent').textContent = `${pct}%`;
  $('serviceTotal').textContent = minutesToTime(service);
  $('workTotal').textContent = minutesToTime(work);
  // Nomi personalizzati: uso textContent (non innerHTML) perche' qui non
  // servono tag HTML, ed e' automaticamente al sicuro da eventuali script.
  $('serviceLabel').textContent = state.settings.serviceName;
  $('workLabel').textContent = state.settings.workName;
  $('studiesCount').textContent = state.studies[keyFor(d)] || 0;
  $('studyLabel').textContent = state.settings.studyName;
  $('legendService').textContent = state.settings.serviceName;
  $('legendWork').textContent = state.settings.workName;

  renderCalendarInto($('calendar'), d);
}

function renderCalendarLarge() {
  renderCalendarInto($('calendarLarge'), state.current);
}

/** Disegna una griglia mensile (6 settimane x 7 giorni) dentro l'elemento passato. */
function renderCalendarInto(el, d) {
  el.innerHTML = '';
  WEEKDAYS.forEach((w) => {
    const h = document.createElement('div');
    h.className = 'cal-head';
    h.textContent = w;
    el.appendChild(h);
  });

  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = (first.getDay() + 6) % 7; // sposta la settimana per iniziare da Lunedi'
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  for (let i = 0; i < 42; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const day = i - start + 1;
    const cellDate = new Date(d.getFullYear(), d.getMonth(), day);
    if (day < 1 || day > daysInMonth) cell.classList.add('outside');
    cell.dataset.date = dateKey(cellDate);
    cell.innerHTML = `<div class="day-num">${cellDate.getDate()}</div>`;

    if (cellDate.getMonth() === d.getMonth()) {
      const es = entriesForDate(dateKey(cellDate));
      const byType = { service: 0, work: 0 };
      es.forEach((e) => { byType[e.entry_type] += Number(e.minutes); });
      if (byType.service) {
        const p = document.createElement('div');
        p.className = 'entry service';
        p.textContent = minutesToTime(byType.service);
        cell.appendChild(p);
      }
      if (byType.work) {
        const p = document.createElement('div');
        p.className = 'entry work';
        p.textContent = minutesToTime(byType.work);
        cell.appendChild(p);
      }
      cell.addEventListener('click', () => window.dispatchEvent(new CustomEvent('open-entry-modal', { detail: dateKey(cellDate) })));
    }
    el.appendChild(cell);
  }
}

function renderAnnual() {
  const year = serviceYearFor(state.current);
  const total = annualValid(year);
  const goal = state.settings.annualGoalMinutes;
  const pct = goal ? Math.min(100, Math.round((total / goal) * 100)) : 0;

  $('annualProgress').style.width = `${pct}%`;
  $('annualProgressText').textContent = `${minutesToTime(total)} / ${minutesToTime(goal)} ore`;
  $('annualPercent').textContent = `${pct}%`;
  $('annualDone').textContent = minutesToTime(total);
  $('annualRemaining').textContent = minutesToTime(Math.max(0, goal - total));
  $('annualTitle').textContent = `Anno di servizio ${year}\u2013${year + 1}`;

  const box = $('annualMonths');
  box.innerHTML = '';
  serviceYearMonths(year).forEach((x) => {
    const d = new Date(x.year, x.month, 1);
    const v = validMinutes(d);
    const g = monthGoal(d);
    const p = g ? Math.min(100, Math.round((v / g) * 100)) : 0;
    const row = document.createElement('div');
    row.className = 'annual-month clickable';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.innerHTML = `
        <div class="annual-month-head"><span>${MONTHS[d.getMonth()]}</span><span>${minutesToTime(v)} / ${minutesToTime(g)} <b class="annual-month-pct">${p}%</b> ›</span></div>
        <div class="mini-track"><div style="width:${p}%"></div></div>`;
    // NOVITA': cliccando la riga di un mese si apre quel mese nella
    // schermata "Mese" (spec confermata dall'utente).
    const goToMonth = () => {
      state.current = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
      showView('month');
    };
    row.addEventListener('click', goToMonth);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') goToMonth(); });
    box.appendChild(row);
  });
}

export function renderSettings() {
  $('themeSelect').value = state.settings.theme;
  $('annualGoalInput').value = Math.round(state.settings.annualGoalMinutes / 60);
  $('serviceNameInput').value = state.settings.serviceName;
  $('workNameInput').value = state.settings.workName;
  $('studyNameInput').value = state.settings.studyName;
  $('serviceColorInput').value = state.settings.serviceColor;
  $('workColorInput').value = state.settings.workColor;
  $('progressColorInput').value = state.settings.progressColor;
  $('buttonColorInput').value = state.settings.buttonColor;
  $('iconColorInput').value = state.settings.iconColor;
  $('textColorInput').value = state.settings.textColor;
  $('bgColorInput').value = state.settings.bgColor;

  const box = $('monthlyGoals');
  box.innerHTML = '';
  serviceYearMonths(serviceYearFor(state.current)).forEach((x) => {
    const d = new Date(x.year, x.month, 1);
    const k = keyFor(d);
    box.insertAdjacentHTML('beforeend', `<label>${MONTHS[d.getMonth()]}<input data-goal="${k}" type="number" min="0" step="1" value="${Math.round((state.goals[k] ?? 3300) / 60)}"></label>`);
  });

  $('dbStatus').textContent = supabaseClient
    ? (state.user ? `Connesso come ${escapeHtml(state.user.email || 'utente')}.` : 'Supabase configurato. Accedi per sincronizzare i dati.')
    : 'Configura URL e anon key in config.js per attivare la sincronizzazione.';
}

export function showView(name) {
  const map = { month: 'monthView', annual: 'annualView', calendar: 'calendarView', settings: 'settingsView' };
  Object.entries(map).forEach(([v, id]) => $(id).classList.toggle('hidden', v !== name));
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
}

let toastTimeoutId = null;
export function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => el.classList.add('hidden'), 2200);
}
