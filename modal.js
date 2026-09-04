// ============================================================================
// modal.js
// Logica del modale "Aggiungi/Modifica ore" (wheel picker, elenco
// inserimenti del giorno, salvataggio/eliminazione) e del modale di export.
// ============================================================================

import { state } from './state.js';
import { MAX_ENTRY_MINUTES, MONTHS, DEFAULT_WORK_DAY_MINUTES } from './constants.js';
import { $, pad, minutesToTime, dateKey, keyFor, formatDateLong } from './utils.js';
import { serviceYearFor, serviceYearMonths, totals, validMinutes, entriesForDate } from './selectors.js';
import { saveTimeEntry, deleteTimeEntry, saveMonthStudies, persistLocal, supabaseClient } from './storage.js';
import { render, toast } from './render.js';

/**
 * Data da proporre di default aprendo il modale dal pulsante "+" (non dal
 * calendario, che passa sempre la data esatta cliccata): sempre la data
 * odierna reale, indipendentemente dal mese che si sta visualizzando.
 */
function defaultEntryDate() {
  return dateKey(new Date());
}

/**
 * Aggiorna titolo e testo dei due pulsanti di salvataggio (quello in alto a
 * destra nell'header e quello grande in fondo): mostrano sempre lo stesso
 * testo, perche' eseguono esattamente la stessa azione.
 */
function setModalLabels(isEditing) {
  const title = isEditing ? 'Modifica inserimento' : 'Aggiungi ore';
  const action = isEditing ? 'Salva modifica' : 'Aggiungi ore';
  $('modalTitle').textContent = title;
  $('topSaveEntryBtn').textContent = action;
  $('saveEntryBtn').textContent = action;
}

export function openModal(date) {
  state.editingEntryId = null;
  state.entryDate = date || defaultEntryDate();
  $('entryDate').value = state.entryDate;
  $('selectedDateLabel').textContent = formatDateLong(state.entryDate);
  setModalLabels(false);
  setType(state.entryType);
  // Nota: setType() imposta gia' il valore predefinito delle rotelle
  // (8h per "Lavoro" secondo la spec, ultima durata usata per "Servizio").
  renderDayEntries();
  $('entryModal').classList.remove('hidden');
  $('entryModal').setAttribute('aria-hidden', 'false');
}

export function closeModal() {
  $('entryModal').classList.add('hidden');
  $('entryModal').setAttribute('aria-hidden', 'true');
}

function renderDayEntries() {
  const box = $('dayEntries');
  const date = $('entryDate').value;
  const es = entriesForDate(date);
  box.innerHTML = '';
  $('existingEntriesTitle').textContent = es.length ? `Inserimenti del giorno (${es.length})` : 'Nessun inserimento in questo giorno';
  es.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'day-entry-row';
    const typeName = e.entry_type === 'service' ? state.settings.serviceName : state.settings.workName;
    // NB: uso createElement/textContent invece di innerHTML per il nome del
    // tipo, che e' personalizzabile dall'utente: evita di dover
    // "escapare" manualmente stringhe inserite in un template.
    const info = document.createElement('div');
    info.innerHTML = `<strong>${minutesToTime(Number(e.minutes))}</strong>`;
    const small = document.createElement('small');
    small.textContent = typeName + (e._pendingSync ? ' \u2022 in attesa di sincronizzazione' : '');
    info.appendChild(small);

    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-entry'; editBtn.title = 'Modifica'; editBtn.textContent = '\u270E';
    editBtn.onclick = () => editEntry(e.id);
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-entry'; delBtn.title = 'Elimina'; delBtn.textContent = '\uD83D\uDDD1';
    delBtn.onclick = () => deleteEntry(e.id);
    actions.append(editBtn, delBtn);

    row.append(info, actions);
    box.appendChild(row);
  });
}

function editEntry(id) {
  const e = state.entries.find((x) => String(x.id) === String(id));
  if (!e) return;
  state.editingEntryId = e.id;
  state.entryDate = e.entry_date;
  $('entryDate').value = e.entry_date;
  $('selectedDateLabel').textContent = formatDateLong(e.entry_date);
  setModalLabels(true);
  setType(e.entry_type);
  setWheelValues(Number(e.minutes));
  renderDayEntries();
}

async function deleteEntry(id) {
  if (!confirm('Eliminare questo inserimento?')) return;
  const { ok, error } = await deleteTimeEntry(id);
  if (!ok) { toast(error); return; }

  state.entries = state.entries.filter((e) => String(e.id) !== String(id));
  if (!supabaseClient || !state.user) persistLocal();

  // BUG RISOLTO: se si elimina la voce che si stava modificando, il
  // modale restava con il titolo/pulsante ancora su "Modifica inserimento",
  // pur non essendo piu' in modalita' modifica. Ora si resetta anche
  // l'interfaccia del form, non solo lo stato interno.
  if (String(state.editingEntryId) === String(id)) {
    state.editingEntryId = null;
    setModalLabels(false);
    setType(state.entryType); // riapplica il default corretto (8h lavoro / ultima durata servizio)
  }

  renderDayEntries();
  render();
  toast('Inserimento eliminato');
}

function setType(t) {
  state.entryType = t;
  $('serviceTypeBtn').classList.toggle('active', t === 'service');
  $('workTypeBtn').classList.toggle('active', t === 'work');
  // Spec punto 12: "Una giornata standard di lavoro di manutenzione
  // corrisponde a 8 ore". Per comodita' proponiamo 8:00 passando a
  // "Lavoro" su una voce NUOVA (mai su una che si sta modificando, per non
  // sovrascrivere un valore gia' inserito): resta comunque modificabile
  // liberamente con le rotelle.
  if (!state.editingEntryId) {
    setWheelValues(t === 'work' ? DEFAULT_WORK_DAY_MINUTES : (state.settings.lastDurationMinutes || 90));
  }
}

function buildWheels() {
  buildWheel($('hoursWheel'), Array.from({ length: 25 }, (_, i) => i), state.hourValue, (v) => { state.hourValue = v; });
  // Minuti a step di 5 (spec aggiornata dall'utente: prima erano 15).
  buildWheel($('minutesWheel'), Array.from({ length: 12 }, (_, i) => i * 5), state.minuteValue, (v) => { state.minuteValue = v; });
}

function buildWheel(el, values, current, onChange) {
  el.innerHTML = '';
  values.forEach((v) => {
    const item = document.createElement('div');
    item.className = 'wheel-item' + (v === current ? ' selected' : '');
    item.textContent = pad(v);
    item.dataset.value = v;
    item.onclick = () => {
      onChange(v);
      el.querySelectorAll('.wheel-item').forEach((i) => i.classList.remove('selected'));
      item.classList.add('selected');
      item.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    el.appendChild(item);
  });
  setTimeout(() => {
    const target = el.querySelector(`[data-value="${current}"]`);
    if (target) target.scrollIntoView({ block: 'center' });
  }, 0);
}

function setWheelValues(minutes) {
  state.hourValue = Math.floor(minutes / 60);
  state.minuteValue = minutes % 60;
  buildWheels();
}

export async function saveEntry() {
  const minutes = state.hourValue * 60 + state.minuteValue;
  if (minutes <= 0) { toast('Inserisci una durata maggiore di zero'); return; }
  // BUG RISOLTO: la rotella delle ore arriva fino a 24, quindi selezionando
  // 24 ore + qualsiasi minuto si superava il limite di 24h ammesso (e il
  // vincolo a database), causando un errore poco chiaro. Ora lo blocchiamo
  // prima con un messaggio comprensibile.
  if (minutes > MAX_ENTRY_MINUTES) { toast('La durata non puo\' superare 24 ore'); return; }

  const entryDate = $('entryDate').value;
  const isEditing = Boolean(state.editingEntryId);
  const result = await saveTimeEntry({
    id: state.editingEntryId || undefined,
    entry_date: entryDate,
    entry_type: state.entryType,
    minutes
  });

  if (!result.ok) { toast(result.error); return; }

  if (isEditing) {
    state.entries = state.entries.map((e) => (String(e.id) === String(state.editingEntryId) ? result.data : e));
  } else {
    state.entries.push(result.data);
  }
  // Ricordiamo questa durata come predefinita per il prossimo inserimento.
  state.settings.lastDurationMinutes = minutes;
  if (!supabaseClient || !state.user) persistLocal();

  state.editingEntryId = null;
  setModalLabels(false);
  renderDayEntries();
  render();
  toast(result.offline ? 'Salvato in locale: verra\' sincronizzato quando torni online' : (isEditing ? 'Inserimento modificato' : 'Ore aggiunte con successo!'));
}

export { setType, setWheelValues, renderDayEntries };

// -----------------------------------------------------------------------------
// Modale export CSV
// -----------------------------------------------------------------------------

function buildExportRows() {
  const year = serviceYearFor(state.current);
  return serviceYearMonths(year).map((x) => {
    const d = new Date(x.year, x.month, 1);
    const t = totals(d);
    return {
      mese: MONTHS[d.getMonth()],
      ore: minutesToTime(validMinutes(d)),
      servizio: minutesToTime(t.service),
      lavoro: minutesToTime(t.work),
      studi: state.studies[keyFor(d)] || 0
    };
  });
}

export function openExport() {
  const year = serviceYearFor(state.current);
  $('exportTitle').textContent = `Esportazione \u2014 anno di servizio ${year}\u2013${year + 1}`;
  const body = $('exportTableBody');
  body.innerHTML = '';
  buildExportRows().forEach((r) => {
    body.insertAdjacentHTML('beforeend', `<tr><td>${r.mese}</td><td>${r.ore}</td><td>${r.servizio}</td><td>${r.lavoro}</td><td>${r.studi}</td></tr>`);
  });
  $('exportModal').classList.remove('hidden');
  $('exportModal').setAttribute('aria-hidden', 'false');
}

export function closeExport() {
  $('exportModal').classList.add('hidden');
  $('exportModal').setAttribute('aria-hidden', 'true');
}

export function downloadCSV() {
  const year = serviceYearFor(state.current);
  const rows = buildExportRows();
  const lines = [
    ['Anno di servizio', `${year}-${year + 1}`],
    [],
    ['Mese', 'Ore valide', 'Servizio', 'Lavoro', 'Studi biblici'],
    ...rows.map((r) => [r.mese, r.ore, r.servizio, r.lavoro, r.studi])
  ];
  const csv = lines.map((row) => row.map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `riepilogo-servizio-${year}-${year + 1}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('File CSV esportato');
}

export async function changeStudies(delta) {
  const k = keyFor(state.current);
  const v = Math.max(0, (state.studies[k] || 0) + delta);
  state.studies[k] = v;
  const result = await saveMonthStudies(k, v);
  if (!result.ok) { toast(result.error); return; }
  if (!supabaseClient || !state.user) persistLocal();
  render();
}
