/* Published separately from the ranking/Instagram contest. No draw or message. */
window.BibouWheelRewards = function ({ root, api, token, onUnauthorized }) {
  let data = null, busy = false, generation = 0;
  root.innerHTML = '<section class="marketing-panel"><h2>La roue Bibou · gains immédiats</h2><p>Cette roue ne change ni le classement jusqu’au 31 décembre ni les tirages Instagram.</p><p data-wheel-status role="status" aria-live="polite"></p><details><summary>Lire le nouveau règlement et les probabilités</summary><pre data-wheel-rules style="white-space:pre-wrap;font:inherit"></pre></details><button type="button" class="login-button" data-wheel-activate disabled>Publier les 80 % de gains et le Classique mensuel</button><p>Une chance de 1 % par tour réel admissible pour le Classique tant qu’il reste disponible ; au maximum un gagnant pour tout le restaurant par mois, sans tirage de rattrapage ni gagnant garanti. Ne publier qu’après sauvegarde et vérification des parcours clients.</p></section>';
  const status = text => { root.querySelector('[data-wheel-status]').textContent = text; };
  const stbLink = document.createElement('a'); stbLink.href = './stb.html'; stbLink.textContent = 'Gérer les deux places STB →'; root.querySelector('section').append(stbLink);
  async function request(body) {
    const current = token();
    if (!current) throw Error('Reconnectez-vous au back-office.');
    const response = await fetch(api + '/dashboard/wheel-rewards', { method: body ? 'PATCH' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${current}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000), ...(body ? { body: JSON.stringify(body) } : {}) });
    if (current !== token()) throw Error('Session modifiée.');
    if (response.status === 401) { onUnauthorized(); throw Error('Reconnectez-vous.'); }
    const result = await response.json(); if (!response.ok) throw Error(result.error || 'Roue indisponible.'); return result;
  }
  function render() {
    const active = data?.rewardsVersion === 2 && data.monthlyClassicEnabled;
    status(active ? `Nouveau règlement publié · 80 % de gains. Classique du mois ${data.monthlyClassicAvailable ? 'encore disponible' : 'déjà attribué ou indisponible'}.` : 'Ancien règlement conservé : le nouveau calcul n’est pas encore activé.');
    const tables = Object.entries(data.previewSegments).map(([tier, rows]) => tier + ' : ' + rows.map(([id, chance]) => id + ' ' + chance + ' %').join(' ; ')).join('\n');
    root.querySelector('[data-wheel-rules]').textContent = data.previewRules + '\n\n' + tables;
    root.querySelector('[data-wheel-activate]').disabled = busy || active;
  }
  async function load() {
    if (busy || !token()) return;
    const id = ++generation;
    try { const result = await request(); if (id !== generation) return; data = result; render(); }
    catch (error) { if (id === generation) status(error.message); }
  }
  root.querySelector('[data-wheel-activate]').addEventListener('click', async () => {
    if (busy || !data || data.rewardsVersion === 2 && data.monthlyClassicEnabled) return;
    if (!window.confirm('Publier maintenant : 80 % de chances de gain par tour, 20 % sans gain ; dessert, boisson, points et remises. Classique immédiat : 1 % tant que disponible, un seul pour tout le restaurant par mois, sans gagnant garanti ni tirage séparé. Les anciennes récompenses restent valables. Confirmez après sauvegarde et relecture du règlement.')) return;
    const id = ++generation; busy = true; root.querySelector('[data-wheel-activate]').disabled = true;
    try { const result = await request({ rewardsVersion: 2, monthlyClassicEnabled: true, confirmation: 'ACTIVER LA ROUE 80' }); if (id !== generation) return; data = result; }
    catch (error) { if (id === generation) { status(error.message + ' Rechargez pour vérifier avant de réessayer.'); data = null; } }
    finally { busy = false; if (id === generation && data) render(); }
  });
  return { load, clear: () => { generation++; data = null; busy = false; root.querySelector('[data-wheel-activate]').disabled = true; status(''); } };
};
