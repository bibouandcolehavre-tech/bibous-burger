const TEMPORARY_AUTH_ERROR = "La connexion est momentanément indisponible. Réessaie dans quelques instants.";

async function readAuthResponse(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(TEMPORARY_AUTH_ERROR);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(TEMPORARY_AUTH_ERROR);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(TEMPORARY_AUTH_ERROR);
  }
  return payload;
}

module.exports = { readAuthResponse, TEMPORARY_AUTH_ERROR };
