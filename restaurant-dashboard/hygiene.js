(() => {
  'use strict';
  const controls = {
    fridge: 'Frigo préparation', freezer: 'Congélateur réserve',
    prep: 'Température de préparation', service: 'Température de service',
    cooling: 'Refroidissement', reheat: 'Remise en température',
    cleaning: 'Nettoyage et désinfection', oil: 'Huile de friture'
  };
  const temperatureCheck = kind => !['cleaning', 'oil'].includes(kind);
  const weekdays = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const processes = {opened:'Ouverture',prepared:'Préparation',frozen:'Congélation'};
  const temperature = value => Number.isFinite(value) ? `${value.toLocaleString('fr-FR')} °C` : '';
  const localMinute = value => value ? `${value.slice(0,10).split('-').reverse().join('/')} à ${value.slice(11)}` : '';
  const dateTime = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short'
  });
  const outcome = result => result === 'ok' ? 'Conforme' : 'Écart constaté';
  const photoField = label => `
    <div class="hygiene-photo">
      <label class="hygiene-camera">
        ${label}
        <input type="file" accept="image/*" capture="environment" data-photo>
      </label>
      <label class="hygiene-camera">
        Joindre une photo existante
        <input type="file" accept="image/*" data-gallery>
      </label>
      <img data-preview alt="Aperçu de la photo jointe" hidden>
      <button type="button" class="secondary-button" data-remove-photo hidden>Retirer la photo</button>
    </div>`;
  const describeCheck = entry => [
    controls[entry.kind], entry.subject, dateTime.format(new Date(entry.at)), entry.operator,
    temperature(entry.temperature),
    Number.isFinite(entry.endTemperature) ? `Fin ${temperature(entry.endTemperature)} après ${entry.durationMinutes} min` : '',
    Number.isFinite(entry.oilValue) ? `Composés polaires ${entry.oilValue.toLocaleString('fr-FR')} %` : '',
    outcome(entry.result), entry.correction ? `Action : ${entry.correction}` : ''
  ].filter(Boolean).join(' · ');
  const describeLot = entry => [
    entry.mode === 'receipt' ? 'Réception' : entry.mode === 'label' ? 'Étiquette' : '',
    entry.product, `Lot ${entry.lot}`, entry.supplier, dateTime.format(new Date(entry.at)), entry.operator,
    temperature(entry.temperature), entry.result ? outcome(entry.result) : '',
    entry.packaging === 'issue' ? 'Emballage abîmé' : entry.packaging === 'ok' ? 'Emballage intact' : '',
    entry.correction ? `Action : ${entry.correction}` : '',
    entry.expiresOn ? `Date limite : ${entry.expiresOn}` : '',
    entry.reference ? `Justificatif : ${entry.reference}` : ''
  ].filter(Boolean).join(' · ');
  const describeLabel = entry => [entry.product, `Lot ${entry.lot}`, processes[entry.process],
    localMinute(entry.preparedAt), `À consommer avant le ${localMinute(entry.expiresAt)}`, entry.operator].join(' · ');

  window.KrokliHygiene = ({root, api, token, onUnauthorized, printTicket, reviewMode = false}) => {
    root.innerHTML = `
      ${reviewMode ? '<p>Registre temporaire de démonstration. Saisissez uniquement des exemples et joignez une photo de test sans information personnelle. L’impression est simulée.</p>' : ''}
      <nav class="hygiene-tabs" aria-label="Rubriques Hygiène">
        <button type="button" data-tab="checks" aria-pressed="true">Contrôles du jour</button>
        <button type="button" data-tab="lots" aria-pressed="false">Réceptions et lots</button>
        <button type="button" data-tab="cleaning" aria-pressed="false">Plan de nettoyage</button>
        <button type="button" data-tab="labels" aria-pressed="false">DLC secondaires</button>
        <button type="button" data-tab="records" aria-pressed="false">Dossier contrôle</button>
      </nav>
      <p data-feedback role="status" aria-live="polite"></p>
      <section class="hygiene-grid" data-panel="checks">
        <form class="hygiene-card" data-form="checks">
          <h2>Enregistrer un contrôle</h2>
          <label>Opérateur<input name="operator" maxlength="80" required></label>
          <label>Contrôle<select name="kind">
            ${Object.entries(controls).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}
          </select></label>
          <label>Équipement, préparation ou zone<input name="subject" maxlength="120" placeholder="Ex. Frigo cuisine"></label>
          <input type="hidden" name="taskId" disabled>
          <label data-cold>Température en °C<input name="temperature" inputmode="decimal" placeholder="3,2" required></label>
          <label data-cooling hidden>Température de fin en °C<input name="endTemperature" inputmode="decimal" disabled></label>
          <label data-cooling hidden>Durée en minutes<input name="durationMinutes" type="number" min="1" max="1440" step="1" disabled></label>
          <label data-oil hidden>Composés polaires en % (si mesurés)<input name="oilValue" inputmode="decimal" disabled></label>
          <label>Résultat selon votre plan de maîtrise sanitaire<select name="result" required>
            <option value="">Choisir</option><option value="ok">Conforme</option><option value="issue">Écart constaté</option>
          </select></label>
          <label data-correction hidden>Action corrective réalisée<textarea name="correction" rows="2" maxlength="600" disabled></textarea></label>
          ${photoField('Photographier le relevé')}
          <button class="primary-button" type="submit">Enregistrer le contrôle</button>
        </form>
        <div class="hygiene-card"><h2>Relevés d’aujourd’hui</h2><ul data-today-checks></ul></div>
      </section>
      <section class="hygiene-grid" data-panel="lots" hidden>
        <form class="hygiene-card" data-form="lots">
          <h2>Enregistrer un lot</h2>
          <label>Type de saisie<select name="mode"><option value="receipt">Contrôle à réception</option><option value="label">Photo d’étiquette seule</option></select></label>
          <label>Opérateur<input name="operator" maxlength="80" required></label>
          <label>Produit<input name="product" maxlength="160" required></label>
          <label>Fournisseur<input name="supplier" maxlength="160" required></label>
          <label>Numéro de lot<input name="lot" maxlength="160" required></label>
          <label>Date limite indiquée sur l’étiquette<input type="date" name="expiresOn"></label>
          <label>Référence du justificatif<input name="reference" maxlength="240" placeholder="Bon de livraison ou nom du document"></label>
          <label data-receipt>Température à réception en °C (si mesurée)<input name="temperature" inputmode="decimal"></label>
          <label data-receipt>Emballage<select name="packaging" required><option value="ok">Intact</option><option value="issue">Abîmé</option><option value="na">Sans objet</option></select></label>
          <label data-receipt>Résultat du contrôle<select name="result" required><option value="">Choisir</option><option value="ok">Conforme</option><option value="issue">Écart constaté</option></select></label>
          <label data-lot-correction hidden>Action corrective réalisée<textarea name="correction" rows="2" maxlength="600" disabled></textarea></label>
          ${photoField('Photographier l’étiquette')}
          <button class="primary-button" type="submit">Enregistrer le lot</button>
        </form>
        <div class="hygiene-card"><h2>Lots d’aujourd’hui</h2><ul data-today-lots></ul></div>
      </section>
      <section class="hygiene-grid" data-panel="cleaning" hidden>
        <div class="hygiene-card"><h2>Tâches de nettoyage</h2><ul data-tasks></ul></div>
        <form class="hygiene-card" data-form="tasks">
          <h2>Ajouter une tâche au plan</h2>
          <label>Zone ou tâche<input name="label" maxlength="120" placeholder="Ex. Désinfecter le plan de travail" required></label>
          <label>Fréquence<select name="frequency"><option value="daily">Tous les jours</option><option value="weekly">Une fois par semaine</option></select></label>
          <label data-weekday hidden>Jour de la semaine<select name="weekday" disabled>${weekdays.map((day,i) => `<option value="${i+1}">${day}</option>`).join('')}</select></label>
          <button class="primary-button" type="submit">Ajouter au plan</button>
        </form>
      </section>
      <section class="hygiene-grid" data-panel="labels" hidden>
        <form class="hygiene-card" data-form="labels">
          <h2>Créer une étiquette de DLC secondaire</h2>
          <label>Opérateur<input name="operator" maxlength="80" required></label>
          <label>Produit<input name="product" maxlength="160" required></label>
          <label>Numéro de lot<input name="lot" maxlength="160" required></label>
          <label>Opération<select name="process">${Object.entries(processes).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
          <label>Date et heure de l’opération<input type="datetime-local" name="preparedAt" required></label>
          <label>Date et heure limites selon votre plan sanitaire<input type="datetime-local" name="expiresAt" required></label>
          <small>Dates en heure de Paris.</small>
          <button class="primary-button" type="submit">Enregistrer l’étiquette</button>
        </form>
        <div class="hygiene-card"><h2>Étiquettes d’aujourd’hui</h2><ul data-today-labels></ul></div>
      </section>
      <section data-panel="records" hidden>
        <form class="hygiene-period" data-filter>
          <label>Du<input type="date" name="from" required></label>
          <label>Au<input type="date" name="to" required></label>
          <button class="secondary-button" type="submit">Afficher la période</button>
        </form>
        <p data-period></p>
        <div class="hygiene-grid">
          <div class="hygiene-card"><h2>Registre des contrôles</h2><ul data-checks></ul></div>
          <div class="hygiene-card"><h2>Réceptions et lots</h2><ul data-lots></ul></div>
          <div class="hygiene-card"><h2>DLC secondaires</h2><ul data-labels></ul></div>
        </div>
        <div class="hygiene-period">
          <button class="secondary-button" type="button" data-print="a4" disabled>${reviewMode ? 'Aperçu du dossier A4' : 'Imprimer le dossier A4'}</button>
          <button class="secondary-button" type="button" data-print="epson" disabled>${reviewMode ? 'Aperçu du ticket du jour' : 'Ticket Epson du jour'}</button>
        </div>
      </section>
      ${reviewMode ? '<dialog class="hygiene-card hygiene-review-print" data-print-preview aria-label="Aperçu de démonstration"><button class="secondary-button" type="button" data-close-print>Fermer l’aperçu</button><h2>Aperçu de démonstration</h2><pre></pre></dialog>' : ''}`;
    const query = selector => root.querySelector(selector);
    const forms = Object.fromEntries([...root.querySelectorAll('[data-form]')].map(form => [form.dataset.form,form]));
    const filter = query('[data-filter]');
    const feedback = query('[data-feedback]');
    const a4Button = query('[data-print="a4"]');
    const epsonButton = query('[data-print="epson"]');
    const printPreview = query('[data-print-preview]');
    query('[data-close-print]')?.addEventListener('click', () => printPreview.close());
    const retry = new WeakMap();
    const evidence = new WeakMap();
    const photoUrls = new Set();
    let epoch = 0, read = 0, current = null, daily = null, busy = false, printing = false;

    function openTab(name) {
      for (const tab of root.querySelectorAll('[data-tab]')) {
        tab.setAttribute('aria-pressed', String(tab.dataset.tab === name));
      }
      for (const panel of root.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
    }
    function notice(value, error = false) {
      feedback.textContent = value;
      feedback.classList.toggle('hygiene-error', error);
    }
    function list(selector, entries, describe, fallback, actions) {
      const ul = query(selector);
      const rows = entries.map(entry => {
        const li = document.createElement('li');
        li.textContent = describe(entry);
        if (entry.photo) appendPhotoViewer(li, entry);
        actions?.(li, entry);
        return li;
      });
      const empty = Object.assign(document.createElement('li'), {textContent:fallback});
      ul.replaceChildren(...(rows.length ? rows : [empty]));
    }
    function appendPhotoViewer(row, entry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary-button hygiene-open-photo';
      button.textContent = 'Voir la photo';
      button.setAttribute('aria-expanded', 'false');
      const img = document.createElement('img');
      img.alt = 'Photo jointe à la fiche HACCP';
      img.hidden = true;
      row.append(button, img);
      button.addEventListener('click', async () => {
        if (img.getAttribute('src')) {
          img.hidden = !img.hidden;
          button.textContent = img.hidden ? 'Voir la photo' : 'Masquer la photo';
          button.setAttribute('aria-expanded', String(!img.hidden));
          return;
        }
        const auth = token();
        if (!auth) return;
        button.disabled = true;
        try {
          const blob = await request('/photos/' + encodeURIComponent(entry.id), auth, null, true);
          if (!row.isConnected || token() !== auth) return;
          const url = URL.createObjectURL(blob);
          photoUrls.add(url);
          img.src = url;
          img.hidden = false;
          button.textContent = 'Masquer la photo';
          button.setAttribute('aria-expanded', 'true');
        } catch (error) {
          if (row.isConnected && token() === auth) notice(error.message, true);
        } finally {
          button.disabled = false;
        }
      });
    }
    function setPhoto(form, value) {
      const preview = form.querySelector('[data-preview]');
      const remove = form.querySelector('[data-remove-photo]');
      if (value) evidence.set(form, value);
      else {
        evidence.delete(form);
        for (const input of form.querySelectorAll('input[type="file"]')) input.value = '';
      }
      if (value?.url) preview.src = value.url;
      else preview.removeAttribute('src');
      preview.hidden = remove.hidden = !value?.url;
    }
    async function choosePhoto(form, input) {
      const file = input.files?.[0];
      if (!file) return;
      const pending = {loading:true};
      setPhoto(form, pending);
      const url = URL.createObjectURL(file);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const ratio = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let jpeg = canvas.toDataURL('image/jpeg', 0.84);
        if (jpeg.length > 1398000) jpeg = canvas.toDataURL('image/jpeg', 0.60);
        const prefix = 'data:image/jpeg;base64,';
        if (!jpeg.startsWith(prefix) || jpeg.length > 1398000) throw Error('Image trop volumineuse.');
        if (evidence.get(form) === pending) {
          setPhoto(form, {url:jpeg, payload:{mime:'image/jpeg', data:jpeg.slice(prefix.length)}});
          notice('Photo prête. Enregistrez la fiche pour la retrouver sur vos autres appareils.');
        }
      } catch {
        if (evidence.get(form) === pending) {
          setPhoto(form, null);
          notice('Photo illisible ou trop volumineuse. Prenez une nouvelle photo ou sélectionnez une image JPEG.', true);
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    function syncCheckFields() {
      const fields = forms.checks.elements;
      const kind = fields.kind.value;
      fields.temperature.disabled = !temperatureCheck(kind);
      query('[data-cold]').hidden = fields.temperature.disabled;
      for (const label of root.querySelectorAll('[data-cooling]')) {
        const field = label.querySelector('input');
        field.disabled = label.hidden = kind !== 'cooling';
        field.required = !field.disabled;
      }
      fields.oilValue.disabled = query('[data-oil]').hidden = kind !== 'oil';
      fields.taskId.disabled = kind !== 'cleaning' || !fields.taskId.value;
      fields.correction.disabled = fields.result.value !== 'issue';
      fields.correction.required = !fields.correction.disabled;
      query('[data-correction]').hidden = fields.correction.disabled;
    }
    function syncLotFields() {
      const fields = forms.lots.elements;
      const receiving = fields.mode.value === 'receipt';
      for (const label of root.querySelectorAll('[data-receipt]')) {
        label.querySelector('input, select').disabled = label.hidden = !receiving;
      }
      fields.supplier.required = receiving;
      fields.correction.disabled = query('[data-lot-correction]').hidden = !(receiving && fields.result.value === 'issue');
      fields.correction.required = !fields.correction.disabled;
    }
    function syncTaskFields() {
      const fields = forms.tasks.elements;
      fields.weekday.disabled = query('[data-weekday]').hidden = fields.frequency.value !== 'weekly';
    }
    function syncFields() {
      syncCheckFields();
      syncLotFields();
      syncTaskFields();
    }
    async function request(path, auth, body, image = false, method = body ? 'POST' : 'GET') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(api + '/dashboard/hygiene' + path, {
          method, cache: 'no-store', signal: controller.signal,
          headers: {Authorization: 'Bearer ' + auth, ...(body ? {'Content-Type':'application/json'} : {})},
          ...(body ? {body: JSON.stringify(body)} : {})
        });
        if (response.status === 401 && token() === auth) onUnauthorized();
        if (image && response.ok) {
          const blob = await response.blob();
          if (['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) return blob;
          throw Error('Cette photo est illisible.');
        }
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw Error(data?.error || 'Le registre est temporairement inaccessible.');
        return data;
      } catch (error) {
        if (error.name === 'AbortError' || error instanceof TypeError) throw Error('Connexion interrompue. Réessayez après le retour du réseau.');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }
    function action(row, name, run) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary-button hygiene-inline-action';
      button.textContent = name;
      button.addEventListener('click', () => run(button));
      row.append(button);
    }
    function taskActions(row, entry) {
      if (entry.dueToday && !daily.checks.some(check => check.taskId === entry.id && check.result === 'ok')) {
        action(row, 'Faire le contrôle', () => {
          if (busy) return;
          const fields = forms.checks.elements;
          fields.kind.value = 'cleaning';
          fields.subject.value = entry.label;
          fields.taskId.value = entry.id;
          fields.result.value = '';
          fields.correction.value = '';
          setPhoto(forms.checks, null);
          syncCheckFields();
          openTab('checks');
          fields.operator.focus();
        });
      }
      action(row, 'Retirer du plan', async button => {
        const auth = token(), generation = epoch;
        if (!auth || busy || !window.confirm('Retirer cette tâche du plan ? Les contrôles déjà enregistrés sont conservés.')) return;
        button.disabled = busy = true;
        try {
          await request('/tasks/' + encodeURIComponent(entry.id), auth, null, false, 'DELETE');
          if (generation !== epoch || token() !== auth) return;
          notice('Tâche retirée du plan.');
          await load(false);
        } catch (error) {
          if (generation === epoch && token() === auth) notice(error.message, true);
        } finally {
          if (generation === epoch) busy = false;
          button.disabled = false;
        }
      });
    }
    function describeTask(task) {
      const done = daily.checks.some(check => check.taskId === task.id && check.result === 'ok');
      const issue = daily.checks.some(check => check.taskId === task.id && check.result === 'issue');
      return [task.label, task.frequency === 'daily' ? 'Tous les jours' : weekdays[task.weekday - 1],
        task.dueToday ? (done ? 'Fait aujourd’hui' : issue ? 'Écart à suivre' : 'À faire aujourd’hui') : 'Hors programme aujourd’hui'].join(' · ');
    }
    function render() {
      const hasRows = group => Boolean(group && (group.checks.length || group.lots.length || group.labels?.length));
      for (const url of photoUrls) URL.revokeObjectURL(url);
      photoUrls.clear();
      list('[data-today-checks]', daily?.checks || [], describeCheck, 'Aucun contrôle enregistré aujourd’hui.');
      list('[data-today-lots]', daily?.lots || [], describeLot, 'Aucun lot enregistré aujourd’hui.');
      list('[data-checks]', current?.checks || [], describeCheck, 'Aucun contrôle sur cette période.');
      list('[data-lots]', current?.lots || [], describeLot, 'Aucun lot sur cette période.');
      list('[data-tasks]', daily?.tasks || [], describeTask, 'Aucune tâche planifiée.', taskActions);
      list('[data-today-labels]', daily?.labels || [], describeLabel, 'Aucune étiquette créée aujourd’hui.', labelActions);
      list('[data-labels]', current?.labels || [], describeLabel, 'Aucune étiquette sur cette période.', labelActions);
      query('[data-period]').textContent = current ? `Période du ${current.from} au ${current.to}` : '';
      a4Button.disabled = !hasRows(current);
      epsonButton.disabled = printing || !hasRows(daily);
    }
    async function load(showFeedback = true) {
      const auth = token();
      if (!auth) return;
      const generation = epoch, revision = ++read;
      const {from, to} = filter.elements;
      const range = from.value && to.value ? {from:from.value, to:to.value} : null;
      if (showFeedback) notice('Chargement du registre…');
      current = daily = null;
      render();
      try {
        const today = await request('', auth);
        const selected = range ? await request('?' + new URLSearchParams(range), auth) : today;
        if (epoch !== generation || revision !== read || token() !== auth) return;
        daily = today;
        current = {...selected, ...(range || {from:today.today, to:today.today})};
        from.value = current.from;
        to.value = current.to;
        render();
        if (showFeedback) notice('');
      } catch (error) {
        if (epoch === generation && revision === read && token() === auth) notice(error.message, true);
      }
    }
    function fieldsFor(form, group) {
      const entries = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
      for (const key of ['temperature', 'endTemperature', 'durationMinutes', 'oilValue', 'weekday']) {
        if (!entries[key]) continue;
        const raw = entries[key].replace(',', '.');
        if (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw Error('Vérifiez les valeurs numériques.');
        entries[key] = Number(raw);
      }
      if (group === 'labels' && entries.expiresAt < entries.preparedAt) throw Error('La date limite doit suivre l’opération.');
      return Object.fromEntries(Object.entries(entries).filter(([,value]) => value !== ''));
    }
    async function save(event, group) {
      event.preventDefault();
      const auth = token(), generation = epoch, form = forms[group];
      if (!auth || busy || !form.reportValidity()) return;
      let payload;
      try {
        payload = fieldsFor(form, group);
        const photo = evidence.get(form);
        if (photo?.loading) throw Error('La photo est en cours de préparation.');
        if (photo?.payload) payload.photo = photo.payload;
        if (group === 'lots' && payload.mode === 'label' && !payload.photo) throw Error('Ajoutez la photo de l’étiquette.');
        const previous = retry.get(form), fingerprint = JSON.stringify(payload);
        const id = previous?.fingerprint === fingerprint ? previous.id : crypto.randomUUID();
        retry.set(form, {fingerprint, id});
        payload.id = id;
      } catch (error) {
        notice(error.message, true);
        return;
      }
      busy = true;
      const submit = form.querySelector('[type="submit"]');
      const inputs = [...form.elements].filter(field => field !== submit && !field.disabled);
      for (const input of inputs) input.disabled = true;
      submit.disabled = true;
      notice('Enregistrement…');
      try {
        const saved = await request('/' + group, auth, payload);
        if (epoch !== generation || token() !== auth) return;
        if ((saved.entry || saved.task)?.id !== payload.id) throw Error('Enregistrement à confirmer. Réessayez la même saisie.');
        retry.delete(form);
        const operator = form.elements.operator?.value;
        form.reset();
        if (form.querySelector('[data-photo]')) setPhoto(form, null);
        if (operator) for (const other of Object.values(forms)) {
          const field = other.elements.operator;
          if (field && !field.value) field.value = operator;
        }
        notice({checks:'Contrôle enregistré.',lots:'Lot enregistré.',labels:'Étiquette enregistrée.',tasks:'Tâche ajoutée au plan.'}[group]);
        await load(false);
      } catch (error) {
        if (epoch === generation && token() === auth) notice(error.message, true);
      } finally {
        if (epoch === generation) {
          busy = false;
          for (const input of inputs) input.disabled = false;
          submit.disabled = false;
          syncFields();
        }
      }
    }
    function lines(group) {
      const withPhotoNote = describe => entry => describe(entry) + (entry.photo ? ' · Photo dans le registre' : '');
      return [
        'HYGIÈNE HACCP', `Période : ${group.from || group.today} au ${group.to || group.today}`,
        '', 'CONTRÔLES', ...group.checks.map(withPhotoNote(describeCheck)), '', 'RÉCEPTIONS ET LOTS', ...group.lots.map(withPhotoNote(describeLot)),
        '', 'DLC SECONDAIRES', ...(group.labels || []).map(describeLabel)
      ];
    }
    function printRows(rows) {
      if (document.body.classList.contains('hygiene-printing')) return;
      if (rows.length > 1000 || JSON.stringify(rows).length > 299900) {
        notice('Le dossier est trop long. Choisissez une période plus courte.', true);
        return;
      }
      if (printPreview) {
        printPreview.querySelector('pre').textContent = rows.join('\n');
        if (!printPreview.open) printPreview.showModal();
        return;
      }
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'hygiene-print', rows}));
        return;
      }
      const printable = document.createElement('pre');
      printable.className = 'hygiene-print-only';
      printable.textContent = rows.join('\n');
      document.body.append(printable);
      const finish = () => { printable.remove(); document.body.classList.remove('hygiene-printing'); };
      document.body.classList.add('hygiene-printing');
      window.addEventListener('afterprint', finish, {once:true});
      try { window.print(); } catch { finish(); notice('Le navigateur ne peut pas ouvrir l’impression.', true); }
    }
    function labelActions(row, label) {
      const rows = [label.product, `Lot ${label.lot}`, `${processes[label.process]} : ${localMinute(label.preparedAt)}`,
        `À consommer avant : ${localMinute(label.expiresAt)}`, label.operator];
      action(row, reviewMode ? 'Aperçu A4' : 'Imprimer A4', () => printRows(rows));
      action(row, reviewMode ? 'Aperçu du ticket' : 'Imprimer sur papier Epson', () => sendTicket(rows));
    }
    async function sendTicket(rows) {
      if (printPreview) return printRows(rows);
      if (printing) return;
      const generation = epoch;
      printing = true;
      epsonButton.disabled = true;
      notice('Envoi du ticket à l’Epson…');
      try {
        const result = await printTicket(rows);
        if (!result?.success) throw Error('L’Epson a refusé le ticket.');
        if (generation === epoch) notice('Ticket envoyé à l’Epson. Vérifiez la sortie papier.');
      } catch (error) {
        if (generation === epoch) notice(error.message || 'Impression Epson indisponible.', true);
      } finally {
        if (generation === epoch) {
          printing = false;
          epsonButton.disabled = !(daily?.checks.length || daily?.lots.length || daily?.labels?.length);
        }
      }
    }
    a4Button.addEventListener('click', () => { if (current) printRows(lines(current)); });
    epsonButton.addEventListener('click', () => { if (daily) void sendTicket(lines(daily)); });
    root.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => openTab(tab.dataset.tab)));
    forms.checks.elements.kind.addEventListener('change', () => {
      forms.checks.elements.taskId.value = '';
      syncCheckFields();
    });
    forms.checks.elements.result.addEventListener('change', syncCheckFields);
    forms.lots.elements.mode.addEventListener('change', syncLotFields);
    forms.lots.elements.result.addEventListener('change', syncLotFields);
    forms.lots.elements.packaging.addEventListener('change', () => {
      if (forms.lots.elements.packaging.value === 'issue') forms.lots.elements.result.value = 'issue';
      syncLotFields();
    });
    forms.tasks.elements.frequency.addEventListener('change', syncTaskFields);
    for (const [group, form] of Object.entries(forms)) {
      const input = form.querySelector('[data-photo]');
      input?.addEventListener('click', event => {
        if (!window.ReactNativeWebView || !/Android/i.test(navigator.userAgent) || window.krokliHygieneCameraGranted) return;
        event.preventDefault();
        window.ReactNativeWebView.postMessage('hygiene-camera');
      });
      input?.addEventListener('change', () => void choosePhoto(form, input));
      const gallery = form.querySelector('[data-gallery]');
      gallery?.addEventListener('change', () => void choosePhoto(form, gallery));
      form.querySelector('[data-remove-photo]')?.addEventListener('click', () => {
        setPhoto(form, null);
        notice('');
      });
      form.addEventListener('submit', event => void save(event, group));
    }
    filter.addEventListener('submit', event => { event.preventDefault(); void load(); });
    window.addEventListener('krokli-hygiene-camera', event => {
      if (root.hidden) return;
      if (event.detail === 'granted') notice('Caméra autorisée. Touchez de nouveau le bouton photo.');
      else if (event.detail === 'blocked') notice('Autorisez la caméra pour Krokli Pro dans les paramètres Android.', true);
      else notice('La caméra doit être autorisée pour prendre une photo.', true);
    });
    syncFields();
    render();
    return {
      load,
      clear() {
        if (printPreview) {
          if (printPreview.open) printPreview.close();
          printPreview.querySelector('pre').textContent = '';
        }
        epoch++;
        busy = printing = false;
        current = daily = null;
        for (const form of Object.values(forms)) {
          retry.delete(form);
          form.reset();
          if (form.querySelector('[data-photo]')) setPhoto(form, null);
          for (const field of form.elements) field.disabled = false;
        }
        filter.reset();
        openTab('checks');
        syncFields();
        notice('');
        render();
      }
    };
  };
})();
