// ============================================================================
// events.js
// Collega tutti gli elementi dell'interfaccia (bottoni, form, gesture) alle
// funzioni che eseguono le azioni vere e proprie, definite negli altri
// moduli. Va richiamato una sola volta all'avvio, da main.js.
// ============================================================================

import { state } from './state.js';
import { $, clampNumber, formatDateLong } from './utils.js';
import {
  persistLocal, saveProfileToCloud, saveMonthGoalsToCloud,
  signUp, signIn, signOut, requestPasswordReset, supabaseClient
} from './storage.js';
import { render, renderSettings, showView, toast, applyTheme } from './render.js';
import {
  openModal, closeModal, saveEntry, setType, renderDayEntries,
  openExport, closeExport, downloadCSV, changeStudies
} from './modal.js';
import { DEFAULT_SETTINGS } from './constants.js';

function moveMonth(delta) {
  state.current = new Date(state.current.getFullYear(), state.current.getMonth() + delta, 1);
  render();
}

async function saveSettings() {
  state.settings.theme = $('themeSelect').value;
  // BUG RISOLTO: senza un tag <form>, gli attributi HTML "min"/"type=number"
  // non vengono davvero applicati dal browser al semplice click di un
  // bottone. clampNumber() garantisce comunque valori sensati anche se
  // l'utente digita un numero negativo o vuoto.
  state.settings.annualGoalMinutes = clampNumber($('annualGoalInput').value, 1, 100000, 600) * 60;
  state.settings.serviceName = $('serviceNameInput').value.trim() || DEFAULT_SETTINGS.serviceName;
  state.settings.workName = $('workNameInput').value.trim() || DEFAULT_SETTINGS.workName;
  state.settings.studyName = $('studyNameInput').value.trim() || DEFAULT_SETTINGS.studyName;
  state.settings.serviceColor = $('serviceColorInput').value;
  state.settings.workColor = $('workColorInput').value;
  state.settings.progressColor = $('progressColorInput').value;
  state.settings.buttonColor = $('buttonColorInput').value;
  state.settings.iconColor = $('iconColorInput').value;
  state.settings.textColor = $('textColorInput').value;
  state.settings.bgColor = $('bgColorInput').value;

  document.querySelectorAll('[data-goal]').forEach((input) => {
    state.goals[input.dataset.goal] = clampNumber(input.value, 0, 10000, 0) * 60;
  });

  if (supabaseClient && state.user) {
    const profileRes = await saveProfileToCloud();
    if (profileRes.error) { toast(profileRes.error.message); return; }
    const goalsRes = await saveMonthGoalsToCloud(state.goals);
    if (goalsRes.error) { toast(goalsRes.error.message); return; }
  } else {
    persistLocal();
  }
  render();
  toast('Impostazioni salvate');
}

function resetStyle() {
  state.settings.serviceColor = DEFAULT_SETTINGS.serviceColor;
  state.settings.workColor = DEFAULT_SETTINGS.workColor;
  state.settings.progressColor = DEFAULT_SETTINGS.progressColor;
  state.settings.buttonColor = DEFAULT_SETTINGS.buttonColor;
  state.settings.iconColor = DEFAULT_SETTINGS.iconColor;
  state.settings.textColor = DEFAULT_SETTINGS.textColor;
  state.settings.bgColor = DEFAULT_SETTINGS.bgColor;
  renderSettings();
  applyTheme();
}

export function setupEvents() {
  // Navigazione principale
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    showView(b.dataset.nav);
    if (b.dataset.nav === 'settings') renderSettings();
  }));

  $('prevMonth').onclick = () => moveMonth(-1);
  $('nextMonth').onclick = () => moveMonth(1);
  $('annualBadge').onclick = () => showView('annual');

  // Apertura modale ore
  $('monthProgressCard').onclick = () => openModal();
  $('monthProgressCard').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') openModal(); };
  $('addHoursBtn').onclick = () => openModal();
  // NOVITA': pulsante "+" nella barra di navigazione inferiore (mobile).
  const bottomAdd = $('bottomAddBtn');
  if (bottomAdd) bottomAdd.onclick = () => openModal();
  // Il calendario invia un evento custom quando si clicca un giorno (vedi render.js),
  // cosi' render.js non deve importare modal.js e si evita una dipendenza circolare.
  window.addEventListener('open-entry-modal', (e) => openModal(e.detail));

  $('cancelEntryBtn').onclick = closeModal;
  $('topSaveEntryBtn').onclick = saveEntry;
  $('entryDate').onchange = (e) => {
    $('selectedDateLabel').textContent = formatDateLong(e.target.value);
    renderDayEntries();
  };
  $('serviceTypeBtn').onclick = () => setType('service');
  $('workTypeBtn').onclick = () => setType('work');
  $('saveEntryBtn').onclick = saveEntry;

  document.querySelectorAll('.stepper').forEach((b) => { b.onclick = () => changeStudies(Number(b.dataset.step)); });

  // Impostazioni
  $('saveSettingsBtn').onclick = saveSettings;
  $('resetStyleBtn').onclick = resetStyle;
  $('menuBtn').onclick = () => document.querySelector('.sidebar').classList.toggle('open');

  // Autenticazione
  $('signUpBtn').onclick = async () => {
    const r = await signUp($('emailInput').value, $('passwordInput').value);
    toast(r.message);
  };
  $('signInBtn').onclick = async () => {
    const r = await signIn($('emailInput').value, $('passwordInput').value);
    toast(r.message);
    if (r.ok) render();
  };
  $('signOutBtn').onclick = doSignOut;
  // NOVITA' (dal mockup): voce "Esci" anche nella sidebar, stessa azione.
  const sidebarSignOut = $('sidebarSignOutBtn');
  if (sidebarSignOut) sidebarSignOut.onclick = doSignOut;
  async function doSignOut() {
    await signOut();
    toast('Disconnesso');
    render(); // BUG RISOLTO: prima si aggiornavano solo le impostazioni, ora tutta la vista.
  }
  // NOVITA': link per il reset password, assente nella versione precedente.
  const forgotBtn = $('forgotPasswordBtn');
  if (forgotBtn) {
    forgotBtn.onclick = async () => {
      const r = await requestPasswordReset($('emailInput').value);
      toast(r.message);
    };
  }

  // Export
  $('openExportBtn').onclick = openExport;
  $('closeExport').onclick = closeExport;
  $('downloadCSVBtn').onclick = downloadCSV;

  // Swipe orizzontale per cambiare mese su schermi touch
  let touchX = 0;
  document.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 70 && !e.target.closest('.modal-sheet')) moveMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
}
