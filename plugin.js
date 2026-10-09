// AniTrack: plugin de Kino que actualiza tu progreso de anime en AniList y
// MyAnimeList, sin importar desde qué fuente (plugin) lo estés reproduciendo.
// Usa la capability "tracking" (apiVersion 7, Kino 0.9.51+): Kino llama a
// track(event) por cada película o episodio reproducido en el dispositivo,
// desde cualquier fuente, y encola los eventos hasta que se entregan.
/// <reference path="./kino.d.ts" />

const VERSION = "0.1.0";

// ---------- utilidades ----------

// QuickJS no tiene fetch ni setTimeout: todo pasa por kino.fetch y kino.sleep.
// Primera instrucción de toda función async: un await (regla de Kino 0.9.49-).

async function fetchJson(url, options) {
  const r = await kino.fetch(url, options);
  if (!r.ok) {
    const e = new Error("http " + r.status);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Evita entregar dos veces el mismo evento (Kino reintenta; el id es la clave).
function yaEntregado(id) {
  const seen = kino.storage.get("seen") || [];
  if (seen.includes(id)) return true;
  seen.push(id);
  while (seen.length > 50) seen.shift();
  kino.storage.set("seen", seen, 2592000000); // 30 días
  return false;
}

// ---------- resolver qué anime es ----------

// Kino ya manda ids.anilist / ids.mal cuando los conoce. Si no, probamos con
// ARM (mapea IMDb/TMDB -> AniList/MAL) y, como último recurso, búsqueda por
// título en AniList.
async function resolverAnime(ids, title) {
  await null;
  if (ids && (ids.anilist || ids.mal)) {
    return { anilist: ids.anilist, mal: ids.mal };
  }
  if (ids && (ids.imdb || ids.tmdb)) {
    const q = new URLSearchParams({ sources: "anilist,mal" });
    if (ids.imdb) q.set("imdb_id", ids.imdb);
    if (ids.tmdb) q.set("tmdb_id", String(ids.tmdb));
    try {
      const found = await fetchJson("https://arm.haglund.dev/api/v2/search?" + q);
      if (found && found.length) {
        return { anilist: found[0].anilist_id, mal: found[0].mal_id };
      }
    } catch (e) {
      kino.log("arm falló:", e.status || e.code);
    }
  }
  if (title) {
    const r = await fetchJson("https://graphql.anilist.co", {
      method: "POST",
      body: { json: {
        query: "query ($s: String) { Page(perPage: 1) { media(search: $s, type: ANIME, isAdult: false) { id idMal } } }",
        variables: { s: title }
      } }
    });
    const media = r && r.data && r.data.Page && r.data.Page.media && r.data.Page.media[0];
    if (media) return { anilist: media.id, mal: media.idMal || null };
  }
  return null;
}

// ---------- AniList ----------

async function enAniList(token, { anilistId, progress, status }) {
  await null;
  const r = await fetchJson("https://graphql.anilist.co", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: { json: {
      query: "mutation ($id: Int, $p: Int, $s: MediaListStatus) { SaveMediaListEntry(mediaId: $id, progress: $p, status: $s) { id } }",
      variables: { id: anilistId, p: progress, s: status }
    } }
  });
  if (!r.data || !r.data.SaveMediaListEntry) throw new Error("respuesta inesperada de AniList");
}

// ---------- MyAnimeList ----------

// El token de MAL vence (31 días): con el refresh token y las credenciales de
// tu app se renueva solo. El token fresco se guarda en kino.storage.
async function malToken() {
  await null;
  const guardado = kino.storage.get("malAccessToken");
  if (guardado) return guardado;
  const r = await fetchJson("https://api.myanimelist.net/v2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&client_id=" + encodeURIComponent(kino.config.get("malClientId")) +
      "&client_secret=" + encodeURIComponent(kino.config.get("malClientSecret")) +
      "&refresh_token=" + encodeURIComponent(kino.config.get("malRefreshToken"))
  });
  if (!r.access_token) throw new Error("MAL no devolvió token");
  // Se renueva un poco antes del vencimiento real.
  kino.storage.set("malAccessToken", r.access_token, Math.min((r.expires_in || 2678400) - 86400, 2592000000));
  return r.access_token;
}

async function enMAL(malId, { progress, status }) {
  await null;
  const enviar = async (token) => {
    const body = "num_watched_episodes=" + progress + "&status=" + status;
    return kino.fetch("https://api.myanimelist.net/v2/anime/" + malId + "/my_list_status", {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "X-MAL-CLIENT-ID": kino.config.get("malClientId"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
  };
  let r = await enviar(await malToken());
  if (r.status === 401) {
    kino.storage.remove("malAccessToken");
    r = await enviar(await malToken());
  }
  if (!r.ok) throw new Error("MAL respondió " + r.status);
}

// ---------- track (la capability "tracking") ----------

// Solo se actúa en dos momentos: "start" (marcar como viendo) y "watched"
// (se dispara una sola vez, con 3 minutos o menos y al menos 90% visto).
// Los demás tipos de evento se ignoran sin error.
export async function track(event) {
  await null;
  const anilistToken = kino.config.get("anilistToken");
  const malClientId = kino.config.get("malClientId");
  if (!anilistToken && !malClientId) {
    throw kino.error("auth_required", "configura tus tokens en Ajustes");
  }
  if (event.type !== "start" && event.type !== "watched") return { ok: true };
  if (yaEntregado(event.id)) return { ok: true };

  // Para un episodio, los ids del anime están en show.ids; los de event.ids
  // son del episodio en sí y suelen estar vacíos. Nunca confundirlos.
  const ids = event.kind === "episode" ? (event.show && event.show.ids) || {} : event.ids || {};
  const titulo = event.kind === "episode" ? (event.show && event.show.title) : event.title;
  const anime = await resolverAnime(ids, titulo);
  if (!anime || (!anime.anilist && !anime.mal)) {
    kino.log("track: no se pudo identificar el anime; evento ignorado");
    return { skipped: true };
  }

  const pelicula = event.kind === "movie";
  const episodio = event.episode || 1;
  const progreso = event.type === "watched" ? (pelicula ? 1 : episodio) : null;
  const estado = pelicula && event.type === "watched" ? "COMPLETED" : "CURRENT";

  const resultado = { ok: true };
  if (anime.anilist && anilistToken) {
    try {
      await enAniList(anilistToken, { anilistId: anime.anilist, progress: progreso, status: estado });
    } catch (e) {
      // Sin token o respuesta rara: se entrega igual (no vale la pena reintentar).
      resultado.anilist = false;
      kino.log("anilist:", e.status || e.message);
    }
  }
  if (anime.mal && malClientId && kino.config.get("malRefreshToken")) {
    try {
      await enMAL(anime.mal, {
        progress: progreso === null ? 0 : progreso,
        status: estado === "COMPLETED" ? "completed" : "watching"
      });
    } catch (e) {
      resultado.mal = false;
      kino.log("mal:", e.status || e.message);
    }
  }
  kino.log("track entregado:", event.type);
  return resultado;
}

// ---------- estado en la pestaña de ajustes ----------

// La línea "Conexión" de Ajustes: qué cuentas están listas.
export async function settingsStatus() {
  await null;
  const anilist = kino.config.get("anilistToken") ? "AniList ✓" : "AniList —";
  const mal = kino.config.get("malClientId") && kino.config.get("malRefreshToken") ? "MyAnimeList ✓" : "MyAnimeList —";
  return { text: anilist + "  ·  " + mal };
}
