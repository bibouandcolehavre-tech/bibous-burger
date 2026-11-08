'use strict';

const { isDeepStrictEqual } = require('node:util');
const { parsePhoto } = require('./hygiene-image.cjs');

const parisCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit',
});
function parisDateKey(value) {
  const parts = Object.fromEntries(parisCalendar.formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ENTRY_FIELDS = {
  checks: ['id', 'kind', 'operator', 'result', 'temperature', 'correction', 'photo',
    'subject', 'endTemperature', 'durationMinutes', 'oilValue', 'taskId'],
  lots: ['id', 'operator', 'product', 'supplier', 'lot', 'expiresOn', 'reference', 'photo',
    'mode', 'result', 'packaging', 'temperature', 'correction'],
  labels: ['id', 'operator', 'product', 'lot', 'preparedAt', 'expiresAt', 'process'],
};
const TASK_FIELDS = ['id', 'label', 'frequency', 'weekday'];
const TEMPERATURE_KINDS = ['fridge', 'freezer', 'prep', 'service', 'cooling', 'reheat'];
const KINDS = [...TEMPERATURE_KINDS, 'cleaning', 'oil'];
const MAX_ACTIVE_TASKS = 40;

function fail(message, statusCode = 400) {
  throw Object.assign(Error(message), { statusCode });
}

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

function text(value, label, max, { optional = false } = {}) {
  if (optional && (value === undefined || (typeof value === 'string' && !value.trim()))) return undefined;
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean || clean.length > max) fail(`${label} : indiquez entre 1 et ${max} caractères.`);
  return clean;
}

function validateFields(input, fields) {
  if (!fields || !input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key))) fail('Champs du registre invalides.');
  if (typeof input.id !== 'string' || !UUID.test(input.id)) fail('Identifiant de saisie invalide.');
}

function checkFields(input) {
  const { kind, result, temperature, endTemperature, durationMinutes, oilValue, taskId } = input;
  if (!KINDS.includes(kind)) fail('Type de relevé invalide.');
  if (!['ok', 'issue'].includes(result)) fail('Résultat du relevé invalide.');
  if ((TEMPERATURE_KINDS.includes(kind) || temperature !== undefined) && !Number.isFinite(temperature)) {
    fail('Indiquez une température numérique en °C.');
  }
  if (kind === 'cooling') {
    if (!Number.isFinite(endTemperature)) fail('Indiquez la température de fin de refroidissement en °C.');
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      fail('Indiquez une durée entière entre 1 et 1 440 minutes.');
    }
  } else if (endTemperature !== undefined || durationMinutes !== undefined) {
    fail('La température de fin et la durée sont réservées au refroidissement.');
  }
  if (oilValue !== undefined && (kind !== 'oil' || !Number.isFinite(oilValue) || oilValue < 0 || oilValue > 100)) {
    fail('Indiquez un pourcentage entre 0 et 100 pour le contrôle de l’huile.');
  }
  if (taskId !== undefined && (kind !== 'cleaning' || typeof taskId !== 'string' || !UUID.test(taskId))) {
    fail('Tâche de nettoyage invalide.');
  }
  const subject = text(input.subject, 'Objet du relevé', 120, { optional:true });
  const correction = text(input.correction, 'Action corrective', 600, { optional: result === 'ok' });
  return {
    kind, result,
    ...(temperature !== undefined ? { temperature:temperature + 0 } : {}),
    ...(correction ? { correction } : {}),
    ...(subject ? { subject } : {}),
    ...(kind === 'cooling' ? { endTemperature:endTemperature + 0, durationMinutes } : {}),
    ...(oilValue !== undefined ? { oilValue:oilValue + 0 } : {}),
    ...(taskId !== undefined ? { taskId:taskId.toLowerCase() } : {}),
  };
}

function lotFields(input) {
  const { mode, result, packaging, temperature } = input;
  if (mode !== undefined && !['receipt', 'label'].includes(mode)) fail('Type de traçabilité invalide.');
  const product = text(input.product, 'Produit', 160);
  const supplier = text(input.supplier, 'Fournisseur', 160, { optional:mode === 'label' });
  const lot = text(input.lot, 'Numéro de lot', 160);
  const expiresOn = text(input.expiresOn, 'Date limite', 10, { optional: true });
  if (expiresOn && parseDay(expiresOn) === null) fail('Date limite invalide.');
  const reference = text(input.reference, 'Référence', 240, { optional: true });
  const base = {
    product, ...(supplier ? { supplier } : {}), lot,
    ...(expiresOn ? { expiresOn } : {}), ...(reference ? { reference } : {}),
  };
  if (mode === 'receipt') {
    if (!['ok', 'issue'].includes(result)) fail('Résultat de la réception invalide.');
    if (!['ok', 'issue', 'na'].includes(packaging)) fail('État de l’emballage invalide.');
    if (result === 'ok' && packaging === 'issue') fail('Un emballage endommagé doit être signalé comme anomalie.');
    if (temperature !== undefined && !Number.isFinite(temperature)) fail('Indiquez une température numérique en °C.');
    const correction = text(input.correction, 'Action corrective', 600, { optional:result === 'ok' });
    return {
      ...base, mode, result, packaging,
      ...(temperature !== undefined ? { temperature:temperature + 0 } : {}),
      ...(correction ? { correction } : {}),
    };
  }
  if ([result, packaging, temperature, input.correction].some(value => value !== undefined)) {
    fail('Les informations de réception sont réservées à une réception.');
  }
  return mode === 'label' ? { ...base, mode } : base;
}

function labelFields(input) {
  const product = text(input.product, 'Produit', 160);
  const lot = text(input.lot, 'Numéro de lot', 160);
  const { preparedAt, expiresAt, process } = input;
  const localMinute = value => typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && parseDay(value.slice(0, 10)) !== null;
  if (!localMinute(preparedAt) || !localMinute(expiresAt)) fail('Indiquez les deux dates et heures locales.');
  if (expiresAt < preparedAt) fail('La date limite doit être au moins égale à la date de préparation.');
  if (!['opened', 'prepared', 'frozen'].includes(process)) fail('Type de préparation invalide.');
  return { product, lot, preparedAt, expiresAt, process };
}

function publicEntry(entry) {
  const { photo, ...details } = entry;
  return photo ? { ...details, photo:{ mime:photo.mime, size:photo.size } } : details;
}

function activeTasks(registry) {
  return (registry?.tasks || []).filter(task => !task.retiredAt);
}

function publicTask({ id, label, frequency, weekday }, today) {
  const parisWeekday = new Date(parseDay(today)).getUTCDay() || 7;
  return { id, label, frequency, ...(weekday !== undefined ? { weekday } : {}),
    dueToday:frequency === 'daily' || weekday === parisWeekday };
}

function journal(database, query, now = new Date()) {
  const today = parisDateKey(now);
  const from = query.get('from') ?? today;
  const to = query.get('to') ?? today;
  const start = parseDay(from), end = parseDay(to);
  if (start === null || end === null || start > end || end - start >= 31 * DAY_MS) {
    fail('Sélectionnez une période valide de 31 jours maximum.');
  }
  if ([...query.keys()].some(key => !['from', 'to'].includes(key) || query.getAll(key).length !== 1)) fail('Filtre de période invalide.');
  const registry = database.hygieneRegistry;
  const inPeriod = entry => entry.date >= from && entry.date <= to;
  return {
    today,
    checks: (registry?.checks || []).filter(inPeriod).reverse().map(publicEntry),
    lots: (registry?.lots || []).filter(inPeriod).reverse().map(publicEntry),
    labels: (registry?.labels || []).filter(inPeriod).reverse().map(publicEntry),
    tasks: activeTasks(registry).map(task => publicTask(task, today)),
  };
}

function append(database, section, input, now = new Date()) {
  validateFields(input, Object.hasOwn(ENTRY_FIELDS, section) && ENTRY_FIELDS[section]);
  const operator = text(input.operator, 'Opérateur', 80);
  const record = { checks:checkFields, lots:lotFields, labels:labelFields }[section](input);
  const attachment = parsePhoto(input.photo);
  if (section === 'lots' && record.mode === 'label' && !attachment) fail('Ajoutez une photo de l’étiquette.');
  const details = { operator, ...record, ...(attachment ? { photo:attachment.meta } : {}) };
  const registry = database.hygieneRegistry || { checks: [], lots: [] };
  const sameId = entry => entry.id.toLowerCase() === input.id.toLowerCase();
  const existing = (registry[section] || []).find(sameId);
  if (Object.keys(ENTRY_FIELDS).some(key => key !== section && (registry[key] || []).some(sameId))) {
    fail('Cette saisie existe déjà avec un autre contenu.', 409);
  }
  if (existing) {
    const { id, at, date, ...stored } = existing;
    if (!isDeepStrictEqual(details, stored)) fail('Cette saisie existe déjà avec un autre contenu.', 409);
    return { entry:publicEntry(existing), created:false, attachment };
  }
  // Replays of archived checks remain valid after their plan entry is retired.
  if (record.taskId && !activeTasks(registry).some(task => task.id === record.taskId)) {
    fail('Cette tâche de nettoyage n’est plus disponible.', 409);
  }
  const entry = { id: input.id, at: now.toISOString(), date: parisDateKey(now), ...details };
  (registry[section] ||= []).push(entry);
  database.hygieneRegistry = registry;
  return { entry:publicEntry(entry), created:true, attachment };
}

function createTask(database, input, now = new Date()) {
  validateFields(input, TASK_FIELDS);
  const { frequency, weekday } = input;
  if (!['daily', 'weekly'].includes(frequency)) fail('Fréquence de nettoyage invalide.');
  if (frequency === 'weekly' ? !Number.isInteger(weekday) || weekday < 1 || weekday > 7 : weekday !== undefined) {
    fail('Indiquez un jour de la semaine valide pour une tâche hebdomadaire.');
  }
  const details = { id:input.id.toLowerCase(), label:text(input.label, 'Tâche', 120), frequency,
    ...(weekday !== undefined ? { weekday } : {}) };
  const today = parisDateKey(now);
  const registry = database.hygieneRegistry || { checks: [], lots: [] };
  const existing = (registry.tasks || []).find(task => task.id === details.id);
  if (existing) {
    const { createdAt, retiredAt, ...stored } = existing;
    if (retiredAt || !isDeepStrictEqual(details, stored)) fail('Cette tâche existe déjà ou a été retirée.', 409);
    return { task:publicTask(existing, today), created:false };
  }
  if (activeTasks(registry).length >= MAX_ACTIVE_TASKS) fail('Le plan comporte déjà 40 tâches actives.', 409);
  (registry.tasks ||= []).push({ ...details, createdAt:now.toISOString() });
  database.hygieneRegistry = registry;
  return { task:publicTask(details, today), created:true };
}

function retireTask(database, id, now = new Date()) {
  const missing = 'Tâche de nettoyage introuvable.';
  if (typeof id !== 'string' || !UUID.test(id)) fail(missing, 404);
  const task = (database.hygieneRegistry?.tasks || []).find(entry => entry.id === id.toLowerCase());
  if (!task) fail(missing, 404);
  if (task.retiredAt) return { id:task.id, retired:false };
  task.retiredAt = now.toISOString();
  return { id:task.id, retired:true };
}

function photoFor(database, id) {
  if (!UUID.test(id)) fail('Photo introuvable.', 404);
  const registry = database.hygieneRegistry;
  const match = entry => entry.id.toLowerCase() === id.toLowerCase();
  const entry = registry?.checks?.find(match) || registry?.lots?.find(match);
  if (!entry?.photo) fail('Photo introuvable.', 404);
  return entry.photo;
}

module.exports = { journal, append, photoFor, createTask, retireTask };
