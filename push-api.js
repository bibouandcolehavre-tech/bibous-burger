export async function pushRequest(api, token, path = '', method = 'GET', body) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${api}/customer/push${path}`, { method, signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Impossible de gérer les notifications. Réessaie dans un instant.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('La connexion met trop de temps. Réessaie lorsque le réseau revient.');
    throw error;
  } finally { clearTimeout(timer); }
}
