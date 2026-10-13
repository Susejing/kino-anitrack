// AniTrack: plugin de Kino que actualiza tu progreso de anime en AniList y
// MyAnimeList, sin importar desde qué fuente (plugin) lo estés reproduciendo.
// Usa la capability "tracking" (apiVersion 7, Kino 0.9.51+): Kino llama a
// track(event) por cada película o episodio reproducido en el dispositivo,
// desde cualquier fuente, y encola los eventos hasta que se entregan.
/// <reference path="./kino.d.ts" />

const VERSION = "0.2.9";

// ---------- utilidades ----------

// QuickJS no tiene fetch ni setTimeout: todo pasa por kino.fetch y kino.sleep.
// Primera instrucción de toda función async: un await (regla de Kino 0.9.49-).

// En un fallo HTTP se lee el cuerpo de la respuesta para saber qué dijo el
// servidor: AniList explica en un campo "validation" qué campo rechazó y por qué.
async function fetchJson(url, options) {
  const r = await kino.fetch(url, options);
  if (!r.ok) {
    let detalle = "http " + r.status;
    try {
      const cuerpo = await r.text();
      if (cuerpo) detalle = detalle + " " + String(cuerpo).slice(0, 500);
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
function unirToken(objeto) {
  const limpio = (s) => String(s || "").replace(/\s+/g, "").trim();
  return limpio(objeto.anilistToken1) +
         limpio(objeto.anilistToken2) +
         limpio(objeto.anilistToken3);
}

// Une el token desde la configuración guardada.
function tokenAniList() {
  return unirToken({
    anilistToken1: kino.config.get("anilistToken1"),
    anilistToken2: kino.config.get("anilistToken2"),
    anilistToken3: kino.config.get("anilistToken3")
  });
}

// El refresh token de MAL también supera los 500 caracteres: se divide en dos.
function tokenMAL() {
  const limpio = (s) => String(s || "").replace(/\s+/g, "").trim();
  return limpio(kino.config.get("malRefreshToken1")) +
         limpio(kino.config.get("malRefreshToken2"));
}

// Prueba el token contra AniList. Devuelve el nombre del usuario si sirve.
// Lanza con el detalle si AniList lo rechaza.
async function probarTokenAniList(token) {
  await null;
  const r = await fetchJson("https://graphql.anilist.co", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: { json: { query: "query { Viewer { name } }", variables: {} } }
  });
  const nombre = r && r.data && r.data.Viewer && r.data.Viewer.name;
  if (!nombre) throw new Error("token sin usuario");
  return nombre;
}

// ---------- resolver qué anime es ----------

// Kino ya manda ids.anilist / ids.mal cuando los conoce. Si no, probamos con
// ARM (mapea IMDb/TMDB -> AniList/MAL) y, como último recurso, búsqueda por
// título en AniList.
async function resolverAnime(ids, title) {
  await null;
  if (ids && (ids.anilist || ids.mal)) {
    let a = ids.anilist || null;
    let m = ids.mal || null;
    // Si Kino trae solo uno de los dos ids, completar el que falta con una
    // consulta barata a AniList (Media tiene tanto id como idMal).
    if (a && !m) {
      try {
        const r = await fetchJson("https://graphql.anilist.co", {
          method: "POST",
          body: { json: { query: "query ($id: Int) { Media(id: $id) { id idMal } }", variables: { id: a } } }
        });
        if (r.data && r.data.Media) m = r.data.Media.idMal || null;
        kino.log("resolver: id de MAL completado:", m || "no encontrado");
      } catch (e) {
        kino.log("resolver: anilist por id falló:", String(e.status || e.code || e.message).slice(0, 120));
      }
    }
    if (m && !a) {
      try {
        const r = await fetchJson("https://graphql.anilist.co", {
          method: "POST",
          body: { json: { query: "query ($idMal: Int) { Media(idMal: $idMal) { id } }", variables: { idMal: m } } }
        });
        if (r.data && r.data.Media) a = r.data.Media.id;
        kino.log("resolver: id de AniList completado:", a || "no encontrado");
      } catch (e) {
        kino.log("resolver: anilist por idMal falló:", String(e.status || e.code || e.message).slice(0, 120));
      }
    }
    kino.log("resolver: ids directos de Kino (anilist:", a, "mal:", m, ")");
    return { anilist: a, mal: m };
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
  // El argumento progress solo viaja cuando hay un número: en un "start"
  // no se toca nada de progreso. Así nunca se manda un valor vacío que
  // AniList pueda rechazar en su validación.
  const variables = { id: anilistId, p: progress === null ? undefined : progress, s: status };
  const r = await fetchJson("https://graphql.anilist.co", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: { json: {
      query: "mutation ($id: Int, $p: Int, $s: MediaListStatus) { SaveMediaListEntry(mediaId: $id, progress: $p, status: $s) { id } }",
      variables
    } }
  });
  if (!r.data || !r.data.SaveMediaListEntry) {
    const e = new Error("respuesta sin entrada");
    e.status = "sin-entrada";
    throw e;
  }
}

// ---------- MyAnimeList ----------

// El verificador PKCE: pareja fija del code_challenge del link de
// autorización de MAL. El plugin lo usa para canjear el código solo.
const MAL_VERIFIER = "Wy6~bfhephcek4z8A9NsmgdVH-Ie1wBEJsWknXoS~0Kn6Yqn5cWjEEkdu2LiBKfg";

// El token de MAL vence (31 días): con el refresh token y las credenciales de
// tu app se renueva solo. Primer uso: si la persona pegó el código de
// autorización en Ajustes, se canjea aquí automáticamente por refresh token.
async function malToken() {
  await null;
  const guardado = kino.storage.get("malAccessToken");
  if (guardado) return guardado;
  const clientId = kino.config.get("malClientId");
  const clientSecret = kino.config.get("malClientSecret");
  let refreshToken = kino.storage.get("malRefreshTokenRotado") || tokenMAL();

  // Canje del código de autorización: una sola vez. El refresh token que
  // entrega MAL queda guardado; ya no hace falta ningún reqbin.
  if (!refreshToken && kino.config.get("malCodigo")) {
    const r = await fetchJson("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&client_id=" + encodeURIComponent(clientId) +
        "&client_secret=" + encodeURIComponent(clientSecret) +
        "&code=" + encodeURIComponent(kino.config.get("malCodigo")) +
        "&code_verifier=" + encodeURIComponent(MAL_VERIFIER)
    });
    if (r.access_token && r.refresh_token) {
      try {
        kino.storage.set("malRefreshTokenRotado", r.refresh_token, 2500000000);
        kino.storage.set("malAccessToken", r.access_token, Math.min((r.expires_in || 2678400) - 86400, 2500000000));
      } catch (e2) { /* cache llena */ }
      return r.access_token;
    }
    const e = new Error(r.error ? "código rechazado: " + r.error : "canje sin token");
    e.status = "canje";
    throw e;
  }

  if (!refreshToken) {
    const e = new Error("sin código ni refresh token de MAL");
    e.status = "sin-credencial";
    throw e;
  }
  const r = await fetchJson("https://myanimelist.net/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&client_id=" + encodeURIComponent(clientId) +
      "&client_secret=" + encodeURIComponent(clientSecret) +
      "&refresh_token=" + encodeURIComponent(refreshToken)
  });
  if (!r.access_token) throw new Error("MAL no devolvió token");
  // Se guarda también el refresh token nuevo que entrega MAL en cada
  // renovación, y el token de acceso se renueva antes del vencimiento real.
  if (r.refresh_token) kino.storage.set("malRefreshTokenRotado", r.refresh_token, 2500000000);
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

// Solo se actúa en "watched": el episodio o película terminado (se dispara
// una sola vez, con 3 minutos o menos y al menos 90% visto). Los "start" no
// tocan la lista: así nunca se manda un progreso vacío y un anime que ya
// tenías como Completado no se degrada a Watching solo por revisarlo.
// Los demás tipos de evento se ignoran sin error. Todo fallo sale con un
// kino.error con detalle: la línea roja y el registro siempre dicen por qué.
export async function track(event) {
  await null;
  if (event.type !== "watched") return { ok: true };
  const anilistToken = tokenAniList();
  const malListo = kino.config.get("malClientId") && (tokenMAL() || kino.config.get("malCodigo"));
  if (!anilistToken && !malListo) {
    throw kino.error("auth_required", "configura tus tokens en Ajustes");
  }
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
    // En "watched" siempre hay un número: 1 para una película, el número de
    // episodio para una serie.
    const progreso = pelicula ? 1 : episodio;
    const estado = pelicula ? "COMPLETED" : "CURRENT";

    const resultado = { ok: true };
    if (anime.anilist && anilistToken) {
      try {
        await enAniList(anilistToken, { anilistId: anime.anilist, progress: progreso, status: estado });
        kino.log("anilist: actualizado, episodio", progreso);
      } catch (e) {
        resultado.anilist = false;
        const porque = String(e.message || e.status || e.code).slice(0, 180);
        kino.log("anilist falló:", String(e.status || porque).slice(0, 200));
        throw kino.error("unavailable", "anilist " + porque.slice(0, 100),
          { userMessage: "AniList rechazó la actualización. Revisa el registro." });
      }
    }
    if (anime.mal && malListo) {
      try {
        await enMAL(anime.mal, {
          progress: progreso,
          status: estado === "COMPLETED" ? "completed" : "watching"
        });
        kino.log("mal: actualizado, episodio", progreso);
        try { kino.storage.set("malEstado", "ok", 2500000000); } catch (e2) { /* cache */ }
      } catch (e) {
        resultado.mal = false;
        const porque = String(e.status || e.code || e.message).slice(0, 90);
        kino.log("mal falló:", porque);
        try { kino.storage.set("malEstado", "error " + porque, 2500000000); } catch (e2) { /* cache */ }
      }
    } else if (malListo) {
      kino.log("mal: sin id de MAL para este anime, omitido");
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

// ---------- validar antes de guardar (apiVersion 6) ----------

// Al guardar la configuración, el token unido se prueba contra AniList:
// si AniList lo acepta, se guarda; si lo rechaza, Kino muestra el error
// justo debajo del campo y no guarda.
export async function validateSettings(values) {
  await null;
  const token = unirToken(values);
  const mal = values.malClientId && values.malRefreshToken;
  if (!token && !mal) return null;
  if (token) {
    try {
      const nombre = await probarTokenAniList(token);
      kino.log("validación: token de AniList correcto, usuario", nombre);
      return null;
    } catch (e) {
      const porque = String(e.status || e.message || "sin detalle");
      kino.log("validación: AniList rechazó el token:", porque.slice(0, 120));
      return {
        anilistToken1: "AniList rechazó este token: revisa que las 3 partes estén completas, en orden y sin caracteres de más."
      };
    }
  }
  return null;
}

// ---------- estado en la pestaña de ajustes ----------

// La línea "Conexión" de Ajustes: qué cuentas están listas y, si MAL falló
// la última vez, el motivo exacto (para diagnosticar sin capturas).
export async function settingsStatus() {
  await null;
  const anilist = tokenAniList() ? "AniList ✓" : "AniList —";
  let mal;
  if (!(kino.config.get("malClientId") && (tokenMAL() || kino.config.get("malCodigo")))) {
    mal = "MyAnimeList —";
  } else {
    const estado = kino.storage.get("malEstado");
    if (estado && estado.indexOf("error") === 0) {
      mal = "MyAnimeList ⚠ " + estado.slice(6, 60);
    } else if (estado === "ok") {
      mal = "MyAnimeList ✓";
    } else if (kino.config.get("malCodigo")) {
      mal = "MyAnimeList ✓ (se activa con el primer episodio)";
    } else {
      mal = "MyAnimeList ✓ (sin probar aún)";
    }
  }
  return { estado: anilist + "  ·  " + mal };
}
