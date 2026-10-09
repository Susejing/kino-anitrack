// AniTrack: plugin de Kino que actualiza tu progreso de anime en AniList y
// MyAnimeList, sin importar desde qué fuente (plugin) lo estés reproduciendo.
// Usa la capability "tracking" (apiVersion 7, Kino 0.9.51+): Kino llama a
// track(event) por cada película o episodio reproducido en el dispositivo,
// desde cualquier fuente, y encola los eventos hasta que se entregan.
/// <reference path="./kino.d.ts" />

const VERSION = "0.2.2";

// ---------- utilidades ----------

// QuickJS no tiene fetch ni setTimeout: todo pasa por kino.fetch y kino.sleep.
// Primera instrucción de toda función async: un await (regla de Kino 0.9.49-).

// En un fallo HTTP se intenta leer el cuerpo de la respuesta para saber qué
// dijo el servidor (AniList explica sus errores ahí).
async function fetchJson(url, options) {
  const r = await kino.fetch(url, options);
  if (!r.ok) {
    let detalle = "http " + r.status;
    try {
      const cuerpo = await r.text();
      if (cuerpo) detalle = detalle + " " + String(cuerpo).slice(0, 150);
    } catch (e2) { /* sin cuerpo legible */ }
    const e = new Error(detalle);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Evita entregar dos veces el mismo evento (Kino reintenta; el id es la clave).
// Si el almacenamiento fallara, no debe tumbar la entrega: se ignora y sigue.
function yaEntregado(id) {
  try {
    let seen = kino.storage.get("seen");
    if (!Array.isArray(seen)) seen = [];
    if (seen.indexOf(id) >= 0) return true;
    seen.push(id);
    while (seen.length > 50) seen.shift();
    kino.storage.set("seen", seen, 2500000000); // margen bajo el máximo
  } catch (e) {
    kino.log("storage falló:", e.code || "sin código");
  }
  return false;
}

// El token de AniList supera los 500 caracteres máximos de un campo de
// ajustes, así que se pega partido en tres: aquí se vuelve a unir.
function tokenAniList() {
  const limpio = (s) => String(s || "").replace(/\s+/g, "").trim();
  return limpio(kino.config.get("anilistToken1")) +
         limpio(kino.config.get("anilistToken2")) +
         limpio(kino.config.get("anilistToken3"));
}

// ---------- resolver qué anime es ----------

// Kino ya manda ids.anilist / ids.mal cuando los conoce. Si no, probamos con
// ARM (mapea IMDb/TMDB -> AniList/MAL) y, como último recurso, búsqueda por
// título en AniList.
async function resolverAnime(ids, title) {
  await null;
  if (ids && (ids.anilist || ids.mal)) {
    kino.log("resolver: ids directos de Kino");
    return { anilist: ids.anilist, mal: ids.mal };
  }
  if (ids && (ids.imdb || ids.tmdb)) {
    const q = new URLSearchParams({ sources: "anilist,mal" });
    if (ids.imdb) q.set("imdb_id", ids.imdb);
    if (ids.tmdb) q.set("tmdb_id", String(ids.tmdb));
    try {
      const found = await fetchJson("https://arm.haglund.dev/api/v2/search?" + q);
      if (found && found.length) {
        kino.log("resolver: ARM encontró el anime");
        return { anilist: found[0].anilist_id, mal: found[0].mal_id };
      }
      kino.log("resolver: ARM no lo encontró");
    } catch (e) {
      kino.log("resolver: ARM falló:", String(e.status || e.code || e.message).slice(0, 120));
    }
  }
  if (title) {
    try {
      const r = await fetchJson("https://graphql.anilist.co", {
        method: "POST",
        body: { json: {
          query: "query ($s: String) { Page(perPage: 1) { media(search: $s, type: ANIME, isAdult: false) { id idMal } } }",
          variables: { s: title }
        } }
      });
      const media = r && r.data && r.data.Page && r.data.Page.media && r.data.Page.media[0];
      if (media) {
        kino.log("resolver: búsqueda por título encontró el anime");
        return { anilist: media.id, mal: media.idMal || null };
      }
      kino.log("resolver: búsqueda por título sin resultados");
    } catch (e) {
      kino.log("resolver: búsqueda falló:", String(e.status || e.code || e.message).slice(0, 120));
    }
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
  if (!r.data || !r.data.SaveMediaListEntry) {
    const e = new Error("respuesta sin entrada");
    e.status = "sin-entrada";
    throw e;
  }
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
  kino.storage.set("malAccessToken", r.access_token, Math.min((r.expires_in || 2678400) - 86400, 2500000000));
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
// Todo lo demás se ignora sin error. Todo fallo sale con un kino.error con
// detalle: la línea roja y el registro siempre dicen por qué.
export async function track(event) {
  await null;
  const anilistToken = tokenAniList();
  const malListo = kino.config.get("malClientId") && kino.config.get("malRefreshToken");
  if (!anilistToken && !malListo) {
    throw kino.error("auth_required", "configura tus tokens en Ajustes");
  }
  if (event.type !== "start" && event.type !== "watched") return { ok: true };
  if (yaEntregado(event.id)) return { ok: true };

  const ids = event.kind === "episode" ? (event.show && event.show.ids) || {} : event.ids || {};
  const titulo = event.kind === "episode" ? (event.show && event.show.title) : event.title;

  try {
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
        kino.log("anilist: actualizado, episodio", progreso === null ? "-" : progreso);
      } catch (e) {
        resultado.anilist = false;
        const porque = String(e.status || e.code || e.message).slice(0, 100);
        kino.log("anilist falló:", porque);
        throw kino.error("unavailable", "anilist " + porque,
          { userMessage: "AniList respondió " + porque.slice(0, 30) + ". Se reintenta luego." });
      }
    }
    if (anime.mal && malListo) {
      try {
        await enMAL(anime.mal, {
          progress: progreso === null ? 0 : progreso,
          status: estado === "COMPLETED" ? "completed" : "watching"
        });
        kino.log("mal: actualizado, episodio", progreso === null ? "-" : progreso);
      } catch (e) {
        resultado.mal = false;
        kino.log("mal falló:", String(e.status || e.code || e.message).slice(0, 120));
      }
    }
    kino.log("track entregado:", event.type);
    return resultado;
  } catch (e) {
    // Errores con código (kino.error o kino.fetch) pasan tal cual.
    // Cualquier otra falla inesperada se reporta con su motivo.
    if (e && typeof e.code === "string") throw e;
    const porque = String((e && (e.status || e.message)) || "desconocido").slice(0, 100);
    kino.log("track falló:", porque);
    throw kino.error("unavailable", "track " + porque,
      { userMessage: "Falló el aviso, motivo: " + porque.slice(0, 60) + ". Se reintenta luego." });
  }
}

// ---------- estado en la pestaña de ajustes ----------

// La línea "Conexión" de Ajustes: qué cuentas están listas.
export async function settingsStatus() {
  await null;
  const anilist = tokenAniList() ? "AniList ✓" : "AniList —";
  const mal = kino.config.get("malClientId") && kino.config.get("malRefreshToken") ? "MyAnimeList ✓" : "MyAnimeList —";
  return { text: anilist + "  ·  " + mal };
}
