// AniTrack: plugin de Kino que actualiza tu progreso de anime en AniList y
// MyAnimeList, sin importar desde qué fuente (plugin) lo estés reproduciendo.
// Usa la capability "tracking" (apiVersion 7, Kino 0.9.51+): Kino llama a
// track(event) por cada película o episodio reproducido en el dispositivo,
// desde cualquier fuente, y encola los eventos hasta que se entregan.
// v0.5.0: iniciar sesión es un botón y una pegada. AniList y MAL no ofrecen
// el flujo "introduce un código en la TV", y un plugin no puede recibir la
// respuesta del navegador: el mínimo físico posible es tocar el botón,
// autorizar en la web y pegar la dirección donde quedó el navegador.
/// <reference path="./kino.d.ts" />

const VERSION = "0.6.0";

// El Client ID de la app PÚBLICA de MyAnimeList del autor (la misma del
// botón "Iniciar sesión con MyAnimeList"). Es de tipo Android y no tiene
// Client Secret: MAL la acepta sin él, así que el botón funciona para
// cualquier persona sin registrar su propia app.
const MAL_CLIENT_ID_AUTOR = "e2de54b14a697f86d587ae52eeeb70b7";

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

// Saca el token de AniList de una dirección pegada. Tras autorizar, el
// navegador queda en https://example.com/#access_token=...&token_type=...
function tokenAniListDeUrl(direccion) {
  const s = String(direccion || "").trim();
  if (!s) return "";
  const i = s.indexOf("access_token=");
  if (i < 0) return "";
  let t = s.slice(i + "access_token=".length);
  const fin = t.indexOf("&");
  if (fin >= 0) t = t.slice(0, fin);
  return t.replace(/\s+/g, "");
}

// Saca el código de MAL de una dirección pegada: tras autorizar, el navegador
// queda en https://example.com/?code=ALGO. Busca "code=" con delimitador para
// no confundirlo con "code_challenge" del propio link de autorización.
function codigoMALDeUrl(direccion) {
  const s = String(direccion || "").trim();
  if (!s) return "";
  const i = s.search(/[?#&]code=/);
  if (i < 0) return "";
  let c = s.slice(s.indexOf("=", i) + 1);
  const fin = c.indexOf("&");
  if (fin >= 0) c = c.slice(0, fin);
  return c.replace(/\s+/g, "");
}

// El token de AniList en el método antiguo superaba los 500 caracteres
// máximos de un campo de ajustes, así que se pegaba partido en tres: aquí se
// vuelve a unir.
function unirToken(objeto) {
  const limpio = (s) => String(s || "").replace(/\s+/g, "").trim();
  return limpio(objeto.anilistToken1) +
         limpio(objeto.anilistToken2) +
         limpio(objeto.anilistToken3);
}

// Token de AniList: primero la dirección pegada (método nuevo), y si no,
// las tres partes del método antiguo.
function tokenAniList() {
                                                            
  const deUrl = tokenAniListDeUrl(kino.config.get("anilistUrl"));
  if (deUrl) return deUrl;
  return unirToken({
    anilistToken1: kino.config.get("anilistToken1"),
    anilistToken2: kino.config.get("anilistToken2"),
    anilistToken3: kino.config.get("anilistToken3")
  });
}

// Código de MAL: primero la dirección pegada (método nuevo), y si no, las
// dos partes del método antiguo.
function codigoMAL() {
  const deUrl = codigoMALDeUrl(kino.config.get("malUrl"));
  if (deUrl) return deUrl;
  const limpio = (s) => String(s || "").replace(/\s+/g, "").trim();
  return limpio(kino.config.get("malCodigo1")) +
         limpio(kino.config.get("malCodigo2"));
}

// Credenciales de MAL: si la persona llenó las suyas, esas ganan; si no,
// la app pública del autor (client id público, client secret vacío).
function credencialesMAL() {
  const id = String(kino.config.get("malClientId") || "").trim();
  const sec = String(kino.config.get("malClientSecret") || "").trim();
  if (id && sec) return { clientId: id, clientSecret: sec };
  return { clientId: MAL_CLIENT_ID_AUTOR, clientSecret: "" };
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

// El verificador PKCE de MAL: el reto del link de autorización es ESTE
// MISMO texto (MAL solo soporta el método "plain": reto = verificador).
                                                                 
const MAL_VERIFIER = "Wy6~bfhephcek4z8A9NsmgdVH-Ie1wBEJsWknXoS~0Kn6Yqn5cWjEEkdu2LiBKfg";

// El token de MAL vence (31 días): con el refresh token se renueva solo.
// Primer uso: si la persona pegó la dirección con el código de autorización
// en Ajustes, se canjea aquí automáticamente por refresh token.
async function malToken() {
  await null;
  const guardado = kino.storage.get("malAccessToken");
  if (guardado) return guardado;
  const cred = credencialesMAL();
  if (!cred) {
    const e = new Error("MAL sin sesión: toca el botón de Ajustes");
    e.status = "sin-credencial";
    throw e;
  }
  let refreshToken = kino.storage.get("malRefreshTokenRotado");

  // Canje del código de autorización: una sola vez. El refresh token que
  // entrega MAL queda guardado; ya no hace falta ningún reqbin.
  if (!refreshToken && codigoMAL()) {
    let r;
    try {
      // Cuerpo como formulario nativo del kit. SIN redirect_uri: según la
      // documentación de MAL, si la autorización no lo incluyó (nuestro
      // caso: una sola URL registrada), el canje debe omitirlo también.
      // El client secret va vacío con la app pública (sin secret): MAL
      // lo acepta así, y el code_challenge del botón hace el trabajo.
      r = await fetchJson("https://myanimelist.net/v1/oauth2/token", {
        method: "POST",
        body: { form: {
          grant_type: "authorization_code",
          client_id: cred.clientId,
          client_secret: cred.clientSecret,
          code: codigoMAL(),
          code_verifier: MAL_VERIFIER
        } }
      });
    } catch (e) {
      // MAL responde 401 cuando el código venció, ya se usó, o la pareja
      // Client ID + Secret no es la de la app que autorizó.
      const e2 = new Error(e.message.indexOf("401") >= 0
        ? "el código venció o ya se usó: autoriza de nuevo y pega la dirección nueva"
        : "canje falló: " + e.message.slice(0, 120));
      e2.status = e2.message;
      throw e2;
    }
                                        
    if (r.access_token && r.refresh_token) {
      // El access token de MAL vive 1 hora: se cachea la mitad de su vida
      // real (en milisegundos), con un mínimo de un minuto.
      const ttl = Math.max(Math.floor((r.expires_in || 3600) * 1000 / 2), 60000);
      try {
        kino.storage.set("malRefreshTokenRotado", r.refresh_token, 2500000000);
        kino.storage.set("malAccessToken", r.access_token, ttl);
      } catch (e2) { /* cache llena */ }
      kino.log("mal: código canjeado, tokens guardados ✓");
      return r.access_token;
    }
    const e = new Error(r.error ? "código rechazado: " + r.error : "canje sin token");
    e.status = "código rechazado: " + (r.error || "sin respuesta") + " (venció o ya se usó)";
    throw e;
  }

  if (!refreshToken) {
    const e = new Error("sin código ni refresh token de MAL");
    e.status = "sin-credencial";
    throw e;
  }
  let r;
  try {
    r = await fetchJson("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      body: { form: {
        grant_type: "refresh_token",
        client_id: cred.clientId,
        client_secret: cred.clientSecret,
        refresh_token: refreshToken
      } }
    });
  } catch (e) {
    const e2 = new Error(e.message.indexOf("401") >= 0
      ? "renovación rechazada (inicia sesión de nuevo)"
      : "renovación falló: " + e.message);
    e2.status = e2.message;
    throw e2;
  }
  if (!r.access_token) throw new Error("MAL no devolvió token");
  // Se guarda también el refresh token nuevo que entrega MAL en cada
  // renovación, y el token de acceso se cachea la mitad de su vida real.
  const ttl = Math.max(Math.floor((r.expires_in || 3600) * 1000 / 2), 60000);
  try {
    if (r.refresh_token) kino.storage.set("malRefreshTokenRotado", r.refresh_token, 2500000000);
    kino.storage.set("malAccessToken", r.access_token, ttl);
  } catch (e2) { /* cache llena */ }
  return r.access_token;
}

async function enMAL(malId, { progress, status }) {
                                        
  await null;
  const enviar = async (token) => {
    return kino.fetch("https://api.myanimelist.net/v2/anime/" + malId + "/my_list_status", {
      method: "PUT",
      headers: { Authorization: "Bearer " + token },
      body: { form: { num_watched_episodes: progress, status: status } }
    });
  };
  let r = await enviar(await malToken());
  if (r.status === 401) {
    kino.storage.remove("malAccessToken");
    r = await enviar(await malToken());
  }
  if (!r.ok) {
    // MAL explica su rechazo en el cuerpo: se guarda literal para la
    // línea de Conexión (dice la causa exacta, no solo el número).
    let detalle = "";
    try { detalle = (r.text() || "").slice(0, 80); } catch (e2) { /* sin cuerpo */ }
    const e = new Error("MAL respondió " + r.status + " " + detalle);
    e.status = "lista " + r.status + " " + detalle.slice(0, 40);
    throw e;
  }
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
  const cred = credencialesMAL();
  const malListo = !!(cred && codigoMAL());
  if (!anilistToken && !malListo) {
    throw kino.error("auth_required", "inicia sesión en Ajustes");
  }
  if (yaEntregado(event.id)) return { ok: true };

  const ids = event.kind === "episode" ? (event.show && event.show.ids) || {} : event.ids || {};
  const titulo = event.kind === "episode" ? event.show && event.show.title : event.title;

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

// Al guardar la configuración se revisa lo pegado: la dirección de AniList
// debe traer el token (y se prueba contra AniList al instante); la de MAL
// debe traer el código (solo formato: el código es de un solo uso y el
// canje lo hace "Probar conexión" o el primer episodio).
export async function validateSettings(values) {
  await null;
  const direccionAniList = String(values.anilistUrl || "").trim();
  const tokenDeUrl = tokenAniListDeUrl(direccionAniList);
  if (direccionAniList && !tokenDeUrl) {
    return {
      anilistUrl: "No veo el token en esa dirección. Copia la barra de direcciones del navegador justo después de autorizar y pégala aquí."
    };
  }
  const direccionMal = String(values.malUrl || "").trim();
  const codigoDeUrl = codigoMALDeUrl(direccionMal);
  if (direccionMal && !codigoDeUrl) {
    return {
      malUrl: "No veo el código en esa dirección. Copia la barra de direcciones del navegador justo después de autorizar y pégala aquí."
    };
  }
  // Método antiguo: el token unido en tres partes, si la persona lo usa.
  const tokenAntiguo = unirToken(values);
  if (tokenDeUrl || tokenAntiguo) {
    try {
      const nombre = await probarTokenAniList(tokenDeUrl || tokenAntiguo);
      try { kino.storage.set("anilistNombre", nombre, 2500000000); } catch (e2) { /* cache */ }
      kino.log("validación: token de AniList correcto, usuario", nombre);
      return null;
    } catch (e) {
                                        
      const porque = String(e.status || e.message || "sin detalle");
      kino.log("validación: AniList rechazó el token:", porque.slice(0, 120));
      if (tokenDeUrl) {
        return {
          anilistUrl: "AniList rechazó ese token: autoriza de nuevo con el botón y pega la dirección nueva."
        };
      }
      return {
        anilistToken1: "AniList rechazó este token: revisa que las 3 partes estén completas, en orden y sin caracteres de más."
      };
    }
  }
  return null;
}

// ---------- estado en la pestaña de ajustes ----------

// La línea "Conexión" de Ajustes: con qué cuentas está la sesión y, si MAL
// falló la última vez, el motivo exacto (para diagnosticar sin capturas).
export async function settingsStatus() {
  await null;
  let anilist = "AniList —";
  if (tokenAniList()) {
    let nombre = "";
    try { nombre = kino.storage.get("anilistNombre") || ""; } catch (e) { /* cache */ }
    anilist = nombre ? "AniList ✓ como " + nombre : "AniList ✓";
  }
  let mal = "MyAnimeList —";
  const cred = credencialesMAL();
  if (cred && codigoMAL()) {
    const estado = kino.storage.get("malEstado");
    let nombre = "";
    try { nombre = kino.storage.get("malNombre") || ""; } catch (e) { /* cache */ }
    if (estado && estado.indexOf("error") === 0) {
      mal = "MyAnimeList ⚠ " + estado.slice(6, 55);
    } else if (nombre) {
      mal = "MyAnimeList ✓ como " + nombre;
    } else {
      mal = "MyAnimeList ✓ (toca Probar conexión)";
    }
  }
  return { estado: anilist + "  ·  " + mal };
}

// El botón "Probar conexión" de Ajustes: prueba las dos cuentas y devuelve
// el veredicto. Con MAL canjea el código si hace falta (el código es de un
// solo uso: este es el momento de canjearlo sin esperar un episodio).
export async function action(key) {
  await null;
  if (key !== "probar") return null;
  const partes = [];

  const token = tokenAniList();
  if (token) {
    try {
                                                      
      const nombre = await probarTokenAniList(token);
      try { kino.storage.set("anilistNombre", nombre, 2500000000); } catch (e2) { /* cache */ }
      kino.log("anilist: prueba OK, usuario:", nombre);
      partes.push("✓ AniList como " + nombre);
    } catch (e) {
      const porque = String(e.status || e.message || "sin detalle").slice(0, 90);
      partes.push("✗ AniList: " + porque);
    }
  } else {
    partes.push("— AniList sin sesión");
  }

  const cred = credencialesMAL();
  const codigo = codigoMAL();
  if (cred && codigo) {
    try {
      const t = await malToken();
      const r = await kino.fetch("https://api.myanimelist.net/v2/users/@me", {
        headers: { Authorization: "Bearer " + t }
      });
      if (!r.ok) {
        let d = "";
        try { d = (r.text() || "").slice(0, 60); } catch (e2) { /* sin cuerpo */ }
        try { kino.storage.set("malEstado", "error @me " + r.status + " " + d, 2500000000); } catch (e3) { /* cache */ }
        partes.push("✗ MyAnimeList respondió " + r.status);
      } else {
        const j = r.json();
        const nombre = (j && j.name) || (j && j.id) || "tu usuario";
        try {
          kino.storage.set("malEstado", "ok", 2500000000);
          kino.storage.set("malNombre", String(nombre), 2500000000);
        } catch (e3) { /* cache */ }
        kino.log("mal: prueba OK, usuario:", nombre);
        partes.push("✓ MyAnimeList como " + nombre);
      }
    } catch (e) {
      const porque = String(e.status || e.code || e.message).slice(0, 90);
      try { kino.storage.set("malEstado", "error " + porque.slice(0, 60), 2500000000); } catch (e3) { /* cache */ }
      partes.push("✗ MyAnimeList: " + porque);
    }
  } else if (!codigo) {
    partes.push("— MyAnimeList sin sesión");
  } else {
    partes.push("— MyAnimeList sin credenciales");
  }

  return { message: partes.join("  ·  ") };
}
