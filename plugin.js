// AniTrack — marca tu progreso de anime en AniList y MyAnimeList desde Kino · github.com/Susejing/kino-anitrack
// Copyright (C) 2026 Susejing
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// AniTrack: plugin de Kino que actualiza tu progreso de anime en AniList y
// MyAnimeList, sin importar desde qué fuente (plugin) lo estés reproduciendo.
// Usa la capability "tracking" (apiVersion 7, Kino 0.9.51+): Kino llama a
// track(event) por cada película o episodio reproducido en el dispositivo,
// desde cualquier fuente, y encola los eventos hasta que se entregan.
// v0.13.1 — LA PUERTA VOLVIÓ A ABRIRSE. El resumen de la puerta en el
// manifiesto creció a 168 caracteres en la 0.13.0 y el límite del motor
// son 120: un bloque de enhancements que rompe una regla se DESCARTA
// entero (docs/protocol.md), así que Kino botó la puerta "manga"
// completa y TODAS sus llamadas (markChapter, progress, whoami)
// respondían not_declared — la sincronización de MangaTrack murió en
// silencio, sin toast ni marca en AniList/MAL. Arreglo: resumen corto
// (≤ 120 caracteres) y nada más; whoami queda igual. Lección: el
// summary de una puerta NUNCA pasa de 120, y una puerta que rompe una
// regla no da error visible — simplemente deja de existir.
// v0.13.0 — LA PUERTITA DISCRETA: la puerta "manga" gana la llamada
// "whoami". MangaTrack la usa para «Mi AniList»: si aquí ya hay sesión
// con nombre de usuario guardado (AniList o MAL), se lo dice SIN tocar
// la red y sin mandar tokens ni nada privado — solo el nombre público
// que esas plataformas ya muestran en las listas públicas. Con eso, quien
// tiene AniTrack con sesión no necesita escribir su nombre a mano en
// MangaTrack: se toma de aquí. Sin sesión responde {found: false} y
// MangaTrack sigue con su campo de texto de respaldo.
// v0.12.0 — EL RANGO DE LOS ANIMES. La lluvia de plugins de anime en Kino
// (JKAnime, MonosChinos, TioAnime, AnimeAV1, Latanime, AnimES, MundoDonghua
// y los animes de FlixLatam, GnulaHD, Megadede y tantos otros) hace que la
// mayoría de los episodios lleguen SOLO con el título — en español y con
// adornos del sitio — porque sus catálogos no nombran ids de AniList/MAL.
// El rango de identificación se amplía en varias vueltas: (1) el título se
// busca entre los 6 primeros de AniList y se VERIFICA el calce (romaji,
// inglés, nativo o sinónimo), como ya hacía el lado manga; (2) se reintenta
// limpio de adornos («Sub Español», «Temporada 2»…); (3) los +18 con la
// misma vara; (4) MAL por título con la llave pública del autor — guarda
// nombres en español entre sus títulos alternativos y rescata series que
// AniList no halla —, completando el AniList que falte; (5) de último, el
// «primero de la lista» de la búsqueda de siempre queda como piso de
// compatibilidad. Y las series por temporadas ya no se marcan en la
// primera: si el evento trae season >= 2 (o el título dice «Temporada N»),
// se sigue la cadena de secuelas de AniList hasta la entrada correcta.
// Todo con caché (7 días los aciertos, 6 h los fallos), como el manga.
// HONESTO: Kino nunca avisa de lo +18 marcado como adult (regla de su
// capability tracking), ni de lo que se ve por Chromecast/DLNA, canales en
// vivo o un capítulo sin número — eso no lo arregla ningún plugin.
// v0.11.0 — LA VUELTA DE LA INTEGRACIÓN: la puerta "manga" gana la llamada
// "progress". Hasta ahora el flujo era de una sola mano: MangaTrack avisaba
// aquí cada capítulo y estas listas se actualizaban. La petición de la
// persona: que lo visto en AniList y MAL también LLEGUE al plugin — si
// marcó el capítulo 10 o 20 en la web o donde sea, que MangaTrack lo
// muestre como visto. "progress" responde con el progreso que hay HOY en
// las listas de la persona: el de AniList (mediaListEntry, ya venía en
// resolverManga para no rebajar) y el de MAL (num_chapters_read), y manda
// el MAYOR de los dos con la etiqueta de dónde salió. MangaTrack decide
// qué hace con él (sus marcas ✓ solo suben, nunca bajan). La misma vara
// de identificación que markChapter: primero ids exactos, luego título,
// y sin sesión se responde con el motivo, no con error seco.
// v0.10.0 — el puente de MangaDex: precisión al emparejar mangas
// japoneses, chinos y coreanos, normales o +18. Cuando AniList y MAL no
// hallan la serie por su título (el nombre en español que puso la
// fuente, el original en japonés/chino/coreano, o un +18 que los
// catálogos esconden), MangaDex la busca en TODOS sus idiomas a la
// vez — título original, inglés y español entre sus títulos
// alternativos — y sus «links» traen los ids EXACTOS de AniList y
// MAL: metadato que los propios sitios conectan, no un parecido de
// nombre. También completa el enlace de MAL cuando AniList halló la
// serie pero sin él (manhuas chinos, series nuevas). La vara de
// siempre: solo vale si el título calza de verdad y sin empate, con
// resultados +18 incluidos y caché de éxitos (7 días) y fallos (6 h).
// v0.8.0 — los +18 existen: las búsquedas por título llevaban clavado el
// filtro «isAdult: false» de AniList, así que un manga o anime +18
// jamás aparecía por su nombre (la documentación de AniList lo dice:
// ese filtro aparta el contenido adulto). Ahora la búsqueda va en DOS
// pasadas: primero la de siempre (sin adultos, para que las búsquedas
// normales no cambien ni se les cuele nada raro) y, si no apareció,
// una segunda pasada SOLO entre los +18 — que solo acepta la serie si
// el título calza de verdad (nada de "el primero de la lista"): así
// un título normal que no exista en AniList no puede acabar marcado
// en una serie adulta equivocada.
// v0.7.3 — afinar el manga: (a) los títulos con adornos «(Sin Censura)»
// se reintentan sin el adorno en AniList y MAL (los catálogos los
// guardan limpios); (b) MAL rechazaba con HTTP 400 las búsquedas de
// títulos larguísimos: la búsqueda viaja ahora con el comienzo del
// título (64 letras), y el emparejamiento sigue siendo con el título
// completo.
// v0.9.2 — la pantalla aprende del plugin de YT Music: si ya existe la
// sesión, la tarjeta ya no ofrece el botón de iniciar sesión (queda el
// «✓ sesión como …» y «Cerrar sesión»; para cambiar de cuenta se cierra
// la sesión primero). Y al abrir la pantalla, si hay sesión pero el
// nombre no se sabía (p. ej. pegado a mano en Ajustes), se pregunta una
// sola vez y el «✓ sesión como …» se completa solo — si la red no
// ayuda, se queda en «tu cuenta» sin avisar: no es error.
// v0.9.1 — arreglo del manifiesto: el hint de la sección «Iniciar sesión»
// de Ajustes medía 308 letras y la regla oficial de los formularios es
// máximo 300 en una sección, así que la app rechazaba la actualización
// (la misma trampa del label de 43 de la v0.5.2). Se acorta el hint;
// ni una línea de código cambia.
// v0.9.0 — iniciar sesión es tocar y autorizar: nueva pantalla propia del
// plugin (Inicio ▸ AniTrack) con una ventanita de autorización que se
// cierra sola al caer en example.com; el plugin captura la dirección
// final y guarda la sesión. Nada de copiar ni pegar. El método manual
// de Ajustes queda como respaldo de siempre.
// v0.5.0: iniciar sesión es un botón y una pegada. AniList y MAL no ofrecen
// el flujo "introduce un código en la TV", y un plugin no puede recibir la
// respuesta del navegador: el mínimo físico posible es tocar el botón,
// autorizar en la web y pegar la dirección donde quedó el navegador.
/// <reference path="./kino.d.ts" />

const VERSION = "0.13.1";

// El Client ID de la app PÚBLICA de MyAnimeList del autor (la misma del
// botón "Iniciar sesión con MyAnimeList"). Es de tipo Android y no tiene
// Client Secret: MAL la acepta sin él, así que el botón funciona para
// cualquier persona sin registrar su propia app.
const MAL_CLIENT_ID_AUTOR = "e2de54b14a697f86d587ae52eeeb70b7";

// v0.9.0 — las direcciones de autorización (las mismas de los botones de
// Ajustes): la pantalla propia las abre en la ventanita, la ventana se
// cierra sola al caer en example.com y el plugin captura la dirección
// final — así ya no hay que copiar ni pegar nada.
const ANILIST_AUTH_URL = "https://anilist.co/api/v2/oauth/authorize?client_id=53178&response_type=token";
const MAL_AUTH_URL = "https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=e2de54b14a697f86d587ae52eeeb70b7&code_challenge=Wy6~bfhephcek4z8A9NsmgdVH-Ie1wBEJsWknXoS~0Kn6Yqn5cWjEEkdu2LiBKfg";

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
                                                            
  // v0.9.0 — primero el token capturado por la ventanita de la pantalla.
  let auto = "";
  try { auto = String(kino.storage.get("alTokenAuto") || ""); } catch (e) { auto = ""; }
  if (auto) return auto;
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
  // v0.9.0 — primero el código capturado por la ventanita de la pantalla.
  let auto = "";
  try { auto = String(kino.storage.get("malCodigoAuto") || ""); } catch (e) { auto = ""; }
  if (auto) return auto;
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

// Kino ya manda ids.anilist / ids.mal cuando la fuente los nombra; si trae
// IMDb o TMDB, ARM los mapea. Y cuando lo único que llega es el TÍTULO — el
// caso más común entre los plugins de anime en español, que no traen ids —,
// la búsqueda va en pasadas: tal cual llegó, limpia de adornos del sitio,
// entre los +18, y en MAL, que guarda nombres en español entre sus títulos
// alternativos. La vara de siempre: gana el calce claro y verificado; el
// "primero de la lista" de la búsqueda queda de último, como piso de
// compatibilidad (era el único camino antes de la 0.12.0). Las series por
// temporadas se marcan en su entrada: si el evento trae season >= 2 (o el
// título nombra "Temporada N"), se sigue la cadena de secuelas de AniList.
// Con caché de éxitos (7 días) y fallos (6 h), como el lado manga.

// Adornos que ponen los sitios de anime al final del título: idiomas,
// "Temporada N" y similares. AniList y MAL no los conocen; sin ellos la
// búsqueda calza. El número de temporada no se pierde: track() lo lee del
// título tal cual llegó y lo usa para la cadena de secuelas.
function tituloAnime(t) {
  let s = tituloLimpio(t);
  let antes = "";
  while (antes !== s) {
    antes = s;
    s = s.replace(/\s*[-\u2013\u2014:|]?\s*(sub\s*espa[\u00f1n]ol|subtitulado(?:\s*(?:al\s*)?espa[\u00f1n]ol)?|espa[\u00f1n]ol\s*latino|audio\s*latino|audio\s*castellano|en\s*espa[\u00f1n]ol|castellano|latino|online)\s*$/i, "").trim();
    s = s.replace(/\s*[-\u2013\u2014:|]?\s*(temporada|temp|season)\s*(\d+)\s*$/i, "").trim();
  }
  return s;
}

// El número de temporada que el propio título nombra ("… Temporada 2",
// "… Season 2"), o 0 si no lo dice.
function temporadaEnTitulo(t) {
  const mm = String(t || "").match(/\b(?:temporada|temp|season)\s*(\d+)\b/i);
  return mm ? parseInt(mm[1], 10) : 0;
}

// Busca anime en AniList por título (sin adultos) y devuelve la lista con
// romaji, inglés, nativo y sinónimos para poder verificar el calce.
async function buscarAniListAnime(t) {
  await null;
  const s = String(t || "").trim();
  if (!s) return [];
  try {
    const r = await fetchJson("https://graphql.anilist.co", {
      method: "POST",
      body: { json: {
        query: "query ($s: String) { Page(perPage: 6) { media(search: $s, type: ANIME, isAdult: false) { id idMal title { romaji english native } synonyms } } }",
        variables: { s: s.slice(0, 64) }
      } }
    });
    return (r && r.data && r.data.Page && r.data.Page.media) || [];
  } catch (e) {
    kino.log("resolver: búsqueda en AniList falló:", String(e.status || e.code || e.message).slice(0, 120));
    return [];
  }
}

// ¿Alguno de la lista calza con el título de verdad? La misma vara de
// calzaMedia, aplicada a la lista entera.
function calzaListaAnime(lista, title) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const q = normTitulo(title);
  if (!q) return lista[0];
  for (let i = 0; i < lista.length; i++) {
    if (calzaMedia(lista[i], title)) return lista[i];
  }
  return null;
}

// La segunda pasada de siempre entre los +18: solo se acepta si el título
// calza de verdad (nada de "el primero de la lista").
async function buscarAnimeAdulto(t) {
  await null;
  const s = String(t || "").trim();
  if (!s) return null;
  try {
    const r2 = await fetchJson("https://graphql.anilist.co", {
      method: "POST",
      body: { json: {
        query: "query ($s: String) { Page(perPage: 5) { media(search: $s, type: ANIME, isAdult: true) { id idMal title { romaji english } synonyms } } }",
        variables: { s: s.slice(0, 64) }
      } }
    });
    const lista2 = (r2 && r2.data && r2.data.Page && r2.data.Page.media) || [];
    for (let i = 0; i < lista2.length; i++) {
      if (calzaMedia(lista2[i], s)) return lista2[i];
    }
  } catch (e2) {
    kino.log("resolver: pasada +18 falló:", String(e2.status || e2.code || e2.message).slice(0, 120));
  }
  return null;
}

// v0.12.0 — busca anime en MAL por título con la llave PÚBLICA del autor
// (el mismo client id de los botones: MAL acepta consultas de lectura sin
// sesión con X-MAL-CLIENT-ID, y con sesión se usa el token de la persona).
// MAL guarda nombres en español entre sus títulos alternativos, así que
// esta pasada rescata series que AniList no halla por su nombre en español.
// La vara de buscarMangaMAL: calce claro y SIN empate, o no se marca.
async function buscarAnimeMAL(titulo) {
  await null;
  try {
    let headers = { "X-MAL-CLIENT-ID": MAL_CLIENT_ID_AUTOR };
    try {
      const tok = await malToken();
      if (tok) headers = { Authorization: "Bearer " + tok };
    } catch (eS) { /* sin sesión de MAL: la llave pública */ }
    const r = await kino.fetch("https://api.myanimelist.net/v2/anime?q=" + encodeURIComponent(String(titulo).slice(0, 64))
      + "&limit=8&fields=id,title,alternative_titles", { headers: headers });
    if (!r.ok) { kino.log("resolver: búsqueda en MAL HTTP " + r.status); return null; }
    const j = r.json();
    const datos = (j && j.data) || [];
    if (!Array.isArray(datos) || !datos.length) return null;
    const q = normTitulo(titulo);
    if (!q) return null;
    let mejor = null, mejorP = 0, empate = false;
    for (let i = 0; i < datos.length; i++) {
      const nodo = datos[i] && datos[i].node;
      if (!nodo || !nodo.id) continue;
      const alt = (nodo.alternative_titles && nodo.alternative_titles.synonyms) || [];
      const titulos = [nodo.title, nodo.alternative_titles && nodo.alternative_titles.en,
        nodo.alternative_titles && nodo.alternative_titles.ja].concat(alt);
      let p = 0;
      for (let t = 0; t < titulos.length; t++) {
        const nt = normTitulo(titulos[t]);
        if (!nt) continue;
        if (nt === q) { p = 3; break; }
        if (nt.length >= 10 && q.length >= 10 && (nt.indexOf(q) >= 0 || q.indexOf(nt) >= 0)) p = Math.max(p, 2);
      }
      if (p > mejorP) { mejorP = p; mejor = nodo.id; empate = false; }
      else if (p > 0 && p === mejorP && nodo.id !== mejor) empate = true;
    }
    if (mejor && mejorP >= 2 && !empate) return mejor;
    return null;
  } catch (e) {
    kino.log("resolver: búsqueda en MAL falló:", String((e && e.message) || e).slice(0, 80));
    return null;
  }
}

// v0.12.0 — las temporadas: AniList guarda cada temporada como su propia
// entrada, unida a la anterior por una relación SEQUEL. Si el evento dice
// season >= 2, se sigue la cadena esa cantidad de saltos para marcar la
// entrada correcta. Si la cadena se corta (una serie corrida como One Piece
// no tiene secuelas), se queda donde llegó. Solo se aplica cuando la serie
// se identificó por IMDb/TMDB o por título: los ids exactos de AniList/MAL
// que manda la fuente ya son la entrada de verdad.
async function conTemporada(anime, temporada) {
  await null;
  if (!anime || !anime.anilist || !(temporada >= 2)) return anime;
  let a = anime.anilist;
  let m = anime.mal;
  const saltos = Math.min(temporada - 1, 8);
  for (let hop = 0; hop < saltos; hop++) {
    let r;
    try {
      r = await fetchJson("https://graphql.anilist.co", {
        method: "POST",
        body: { json: {
          query: "query ($id: Int) { Media(id: $id) { relations { edges { relationType node { id idMal format } } } } }",
          variables: { id: a }
        } }
      });
    } catch (e) {
      kino.log("resolver: secuelas falló:", String(e.status || e.code || e.message).slice(0, 120));
      break;
    }
    const edges = (r && r.data && r.data.Media && r.data.Media.relations && r.data.Media.relations.edges) || [];
    let sig = null;
    for (let i = 0; i < edges.length; i++) {
      const ed = edges[i];
      if (ed && ed.relationType === "SEQUEL" && ed.node && ed.node.id
        && ed.node.format !== "MOVIE") { sig = ed.node; break; }
    }
    if (!sig) break;
    a = sig.id;
    m = sig.idMal || null;
  }
  if (a !== anime.anilist) {
    kino.log("resolver: temporada " + temporada + " → otra entrada de AniList");
    return { anilist: a, mal: m };
  }
  return anime;
}

// La clave del caché de resolución: por ids exactos cuando los hay (ese
// resultado no depende de la temporada), por IMDb/TMDB o por título cuando
// no, con la temporada cuando puede mover la entrada.
function claveResAnime(ids, title, temporada) {
  if (ids && (ids.anilist || ids.mal)) return "resA:id:" + (ids.anilist || 0) + "/" + (ids.mal || 0);
  if (ids && (ids.imdb || ids.tmdb)) return "resA:arm:" + (ids.imdb || "0") + "/" + (ids.tmdb || 0)
    + (temporada >= 2 ? "|s" + temporada : "");
  return "resA:t:" + normTitulo(title).slice(0, 60) + (temporada >= 2 ? "|s" + temporada : "");
}

async function resolverAnime(ids, title, temporada) {
  await null;
  // Caché: un acierto vale 7 días, un fallo 6 horas (la serie puede aparecer
  // en los catálogos cualquier día; los adornos del sitio no cambian solos).
  const clave = claveResAnime(ids, title, temporada || 0);
  let cache = null;
  try { cache = kino.storage.get(clave) || null; } catch (e) { cache = null; }
  if (cache && typeof cache === "object") {
    if ((cache.a || cache.m) && cache.ts && Date.now() - cache.ts < 7 * 24 * 3600000) {
      return { anilist: cache.a || null, mal: cache.m || null };
    }
    if (cache.fallo && Date.now() - cache.fallo < 6 * 3600000) return null;
  }

  let resuelto = null;
  let andarTemporada = false;

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
    // ids exactos: la entrada es la de verdad; las temporadas del evento son
    // dentro de esa entrada. Nada de saltar por la cadena de secuelas.
    resuelto = { anilist: a, mal: m };
  } else {
    if (ids && (ids.imdb || ids.tmdb)) {
      const q = new URLSearchParams({ sources: "anilist,mal" });
      if (ids.imdb) q.set("imdb_id", ids.imdb);
      if (ids.tmdb) q.set("tmdb_id", String(ids.tmdb));
      try {
        const found = await fetchJson("https://arm.haglund.dev/api/v2/search?" + q);
        if (found && found.length) {
          kino.log("resolver: ARM encontró el anime");
          resuelto = { anilist: found[0].anilist_id, mal: found[0].mal_id };
          andarTemporada = true;
        } else {
          kino.log("resolver: ARM no lo encontró");
        }
      } catch (e) {
        kino.log("resolver: ARM falló:", String(e.status || e.code || e.message).slice(0, 120));
      }
    }
    if (!resuelto && title) {
      const limpio = tituloAnime(title);
      // 1. El título tal cual llegó, verificando el calce entre los 6
      //    primeros de AniList (romaji, inglés, nativo o sinónimo).
      const lista = await buscarAniListAnime(title);
      const m1 = calzaListaAnime(lista, title);
      if (m1) resuelto = { anilist: m1.id, mal: m1.idMal || null };
      // 2. Limpio de los adornos del sitio ("Sub Español", "Temporada 2"…):
      //    con ellos AniList muchas veces no halla nada.
      if (!resuelto && limpio && limpio !== title) {
        const lista2 = await buscarAniListAnime(limpio);
        const m2 = calzaListaAnime(lista2, limpio);
        if (m2) {
          resuelto = { anilist: m2.id, mal: m2.idMal || null };
          kino.log("resolver: hallado con el título limpio");
        }
      }
      // 3. Entre los +18 (tal cual y limpio), con la vara de siempre.
      if (!resuelto) {
        const adulto = await buscarAnimeAdulto(title)
          || (limpio && limpio !== title ? await buscarAnimeAdulto(limpio) : null);
        if (adulto) {
          resuelto = { anilist: adulto.id, mal: adulto.idMal || null };
          kino.log("resolver: anime +18 encontrado por título");
        }
      }
      // 4. MAL por título: guarda nombres en español entre sus alternativos;
      //    si trae el de AniList, se completa (y si no, solo MAL — algo es
      //    algo, y la lista de MAL es de MAL).
      if (!resuelto) {
        const malId = await buscarAnimeMAL(limpio || title);
        if (malId) {
          let a = null;
          try {
            const r = await fetchJson("https://graphql.anilist.co", {
              method: "POST",
              body: { json: { query: "query ($idMal: Int) { Media(idMal: $idMal) { id } }", variables: { idMal: malId } } }
            });
            if (r.data && r.data.Media) a = r.data.Media.id;
          } catch (e) { /* queda el id de MAL */ }
          resuelto = { anilist: a, mal: malId };
          kino.log("resolver: hallado en MAL por título", a ? "(con AniList)" : "(solo MAL)");
        }
      }
      // 5. Piso de compatibilidad: el primero del ranking de AniList, que
      //    era el único camino antes de la 0.12.0. Solo si nada verificó.
      if (!resuelto && lista && lista.length) {
        resuelto = { anilist: lista[0].id, mal: lista[0].idMal || null };
        kino.log("resolver: sin calce claro; por descarte, el primero del ranking");
      }
      if (resuelto) andarTemporada = true;
    }
  }

  if (resuelto && andarTemporada) {
    resuelto = await conTemporada(resuelto, temporada || 0);
  }

  if (resuelto && (resuelto.anilist || resuelto.mal)) {
    try { kino.storage.set(clave, { a: resuelto.anilist, m: resuelto.mal, ts: Date.now() }, 604800000); } catch (e2) { /* almacén lleno */ }
    return resuelto;
  }
  try { kino.storage.set(clave, { fallo: Date.now() }, 21600000); } catch (e2) { /* almacén lleno */ }
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

// ---------- manga: la puerta "manga" del protocolo ----------

// La 0.9.81 de Kino trae el protocolo entre plugins: AniTrack abre la
// puerta "manga" (dentro de enhancements["20"], invisible para los Kino
// viejos) y otro plugin — MangaTrack — avisa aquí cada capítulo que la
// persona abre. AniTrack busca la serie en AniList (por ids si vienen,
// por título si no) y marca el capítulo leído en las listas de manga de
// AniList y MAL. Nunca baja el progreso que ya había, y lo que no se
// puede cumplir se responde con un motivo, no con un error seco.

// Busca la serie: primero por ids (MangaDex los publica en cada serie),
// si no por título. Trae también el progreso actual en AniList
// (mediaListEntry, solo con token) para no rebajar la lista al releer
// un capítulo viejo.
async function resolverManga(anilistId, malId, title, token) {
  await null;
  const headers = token ? { Authorization: "Bearer " + token } : undefined;
  const campos = "id idMal title { romaji english } synonyms mediaListEntry { progress }";
  let media = null;
  if (anilistId || malId) {
    const porId = anilistId
      ? { query: "query ($id: Int) { Media(id: $id, type: MANGA) { " + campos + " } }", variables: { id: anilistId } }
      : { query: "query ($idMal: Int) { Media(idMal: $idMal, type: MANGA) { " + campos + " } }", variables: { idMal: malId } };
    try {
      const r = await fetchJson("https://graphql.anilist.co", { method: "POST", headers: headers, body: { json: porId } });
      media = (r && r.data && r.data.Media) || null;
    } catch (e) {
      kino.log("manga: resolver por id falló:", String((e && e.message) || e).slice(0, 120));
    }
  } else if (title) {
    try {
      const r = await fetchJson("https://graphql.anilist.co", {
        method: "POST", headers: headers,
        body: { json: { query: "query ($s: String) { Page(perPage: 5) { media(search: $s, type: MANGA, isAdult: false) { " + campos + " } } }", variables: { s: title } } }
      });
      media = elegirMedia(r && r.data && r.data.Page && r.data.Page.media, title);
      // v0.8.0 — segunda pasada SOLO entre manga +18: con el filtro de
      // siempre (isAdult: false) un manga adulto jamás salía por su
      // nombre — los +18 de LectorXd y compañía. Solo se acepta si el
      // título calza de verdad; nada de "el primero de la lista".
      if (!media) {
        try {
          const r2 = await fetchJson("https://graphql.anilist.co", {
            method: "POST", headers: headers,
            body: { json: { query: "query ($s: String) { Page(perPage: 5) { media(search: $s, type: MANGA, isAdult: true) { " + campos + " } } }", variables: { s: title } } }
          });
          const m2 = elegirMedia(r2 && r2.data && r2.data.Page && r2.data.Page.media, title);
          if (m2 && calzaMedia(m2, title)) {
            media = m2;
            kino.log("manga: encontrada entre los +18 de AniList");
          }
        } catch (e2) {
          kino.log("manga: pasada +18 falló:", String((e2 && e2.message) || e2).slice(0, 120));
        }
      }
    } catch (e) {
      kino.log("manga: búsqueda por título falló:", String((e && e.message) || e).slice(0, 120));
    }
  }
  if (!media) return null;
  return {

    anilist: media.id || null,
    mal: media.idMal || null,
    titulo: (media.title && media.title.romaji) || title,
    leido: (media.mediaListEntry && typeof media.mediaListEntry.progress === "number")
      ? media.mediaListEntry.progress : null
  };
}


// Marca un capítulo de manga en la lista de MAL: el endpoint de manga
// es PATCH con num_chapters_read (el de anime era PUT con episodios).
async function enMangaMAL(malId, progress, status) {
  await null;

  const enviar = async (token) => {
    return kino.fetch("https://api.myanimelist.net/v2/manga/" + malId + "/my_list_status", {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token },
      body: { form: { num_chapters_read: progress, status: status } }
    });
  };
  let r = await enviar(await malToken());
  if (r.status === 401) {
    kino.storage.remove("malAccessToken");
    r = await enviar(await malToken());
  }
  if (!r.ok) {
    let detalle = "";
    try { detalle = (r.text() || "").slice(0, 80); } catch (e2) { /* sin cuerpo */ }
    const e = new Error("MAL respondió " + r.status + " " + detalle);
    e.status = "lista manga " + r.status;
    throw e;
  }
}

// Quita los adornos que ponen las fuentes al final del título —
// «(Sin Censura)», «(Novela)»… — porque AniList y MAL no los conocen y
// con ellos la serie jamás calza. Solo como SEGUNDA oportunidad: el
// título tal cual llegó se intenta primero.
function tituloLimpio(t) {
  let s = String(t || "").trim();
  let antes = "";
  while (antes !== s) {
    antes = s;
    s = s.replace(/\s*\([^()]{1,40}\)\s*$/, "").trim();
  }
  return s;
}

// Título normalizado para comparar: minúsculas, sin acentos y con solo
// letras y números (los signos y el espaciado de más sobran).
function normTitulo(s) {
  const conA = "áàäâãéèëêíìïîóòöôõúùüûñç";
  const sinA = "aaaaaeeeeiiiiooooouuuunc";
  const t = String(s || "").toLowerCase();
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const j = conA.indexOf(t[i]);
    out += j >= 0 ? sinA[j] : t[i];
  }
  return out.replace(/[^a-z0-9]+/g, " ").trim();
}

// ¿El candidato calza con el título de verdad? (exacto tras normalizar,
// o uno contiene al otro con 10 letras o más). Es la misma vara de
// elegirMedia, sin su red de "el primero de la lista": para las series
// +18 nada de aceptar por parecido vago — si no calza, no se marca.
function calzaMedia(m, title) {
  if (!m) return false;
  const q = normTitulo(title);
  if (!q) return true;   // sin título no hay con qué comparar: pasa
  const nombres = [m && m.title && m.title.romaji, m && m.title && m.title.english]
    .concat((m && m.synonyms) || []);
  for (let t = 0; t < nombres.length; t++) {
    const nt = normTitulo(nombres[t]);
    if (!nt) continue;
    if (nt === q) return true;
    if (nt.length >= 10 && q.length >= 10 && (nt.indexOf(q) >= 0 || q.indexOf(nt) >= 0)) return true;
  }
  return false;
}

// De los candidatos de AniList elige el que mejor calza con el título
// que llegó (romaji, inglés o sinónimo): si ninguno calza claro se
// queda con el primero, que es el ranking de la propia búsqueda.
function elegirMedia(lista, title) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const q = normTitulo(title);
  if (!q) return lista[0];
  for (let i = 0; i < lista.length; i++) {
    const m = lista[i];
    const nombres = [m && m.title && m.title.romaji, m && m.title && m.title.english]
      .concat((m && m.synonyms) || []);
    for (let t = 0; t < nombres.length; t++) {
      const nt = normTitulo(nombres[t]);
      if (!nt) continue;
      if (nt === q) return m;
      if (nt.length >= 10 && q.length >= 10 && (nt.indexOf(q) >= 0 || q.indexOf(nt) >= 0)) return m;
    }
  }
  return lista[0];
}

// Busca una serie de manga en MAL por título y devuelve su id SOLO si
// el match es claro (título exacto tras normalizar, o uno único que
// contiene al otro): si hay duda, no marca nada en MAL — mejor
// quedarse corto que marcar una serie equivocada.
async function buscarMangaMAL(titulo) {
  await null;
  try {
    // v0.7.3 — MAL responde 400 a las búsquedas de títulos larguísimos:
    // se busca por el comienzo del título (64 letras bastan para que sus
    // resultados sean los mismos) y el emparejamiento sigue siendo con
    // el título completo.
    const r = await kino.fetch("https://api.myanimelist.net/v2/manga?q=" + encodeURIComponent(String(titulo).slice(0, 64))
      + "&limit=8&fields=id,title,alternative_titles", {
      headers: { Authorization: "Bearer " + (await malToken()) }
    });
    if (!r.ok) { kino.log("manga: búsqueda en MAL HTTP " + r.status); return null; }
    const j = r.json();
    const datos = (j && j.data) || [];
    if (!Array.isArray(datos) || !datos.length) return null;
    const q = normTitulo(titulo);
    if (!q) return null;
    let mejor = null, mejorP = 0, empate = false;
    for (let i = 0; i < datos.length; i++) {
      const nodo = datos[i] && datos[i].node;
      if (!nodo || !nodo.id) continue;
      const alt = (nodo.alternative_titles && nodo.alternative_titles.synonyms) || [];
      const titulos = [nodo.title, nodo.alternative_titles && nodo.alternative_titles.en,
        nodo.alternative_titles && nodo.alternative_titles.ja].concat(alt);
      let p = 0;
      for (let t = 0; t < titulos.length; t++) {
        const nt = normTitulo(titulos[t]);
        if (!nt) continue;
        if (nt === q) { p = 3; break; }
        if (nt.length >= 10 && q.length >= 10 && (nt.indexOf(q) >= 0 || q.indexOf(nt) >= 0)) p = Math.max(p, 2);
      }
      if (p > mejorP) { mejorP = p; mejor = nodo.id; empate = false; }
      else if (p > 0 && p === mejorP && nodo.id !== mejor) empate = true;
    }
    if (mejor && mejorP >= 2 && !empate) return mejor;
    return null;
  } catch (e) {
    kino.log("manga: búsqueda en MAL falló:", String((e && e.message) || e).slice(0, 80));
    return null;
  }
}

// v0.10.0 — el puente de MangaDex: busca la serie por título en
// MangaDex, que guarda cada serie con su nombre en TODOS sus idiomas
// (original japonés/chino/coreano, inglés, español…) y publica en sus
// «links» los ids EXACTOS de AniList y MAL. Con eso un título en
// español halla su equivalente original y los ids vienen de un
// metadato verificado, no de un parecido de nombre. La misma vara de
// siempre: exacto tras normalizar o contención de 10 o más, solo si
// calza de verdad y SIN empate (nada de marcar una serie parecida).
// Caché de éxitos (7 días) y de fallos (6 h) en el almacén local.
async function idsMangaDex(titulo) {
  await null;
  const t = String(titulo || "").trim();
  if (!t) return null;
  const clave = "mdIds:" + t.slice(0, 80);
  let cache = null;
  try { cache = kino.storage.get(clave) || null; } catch (e) { cache = null; }
  if (cache && typeof cache === "object") {
    if (cache.al || cache.mal) return cache;
    if (cache.fallo && Date.now() - cache.fallo < 6 * 3600000) return null;
  }
  try {
    const j = await fetchJson("https://api.mangadex.org/manga?limit=5&title=" + encodeURIComponent(t)
      + "&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic");
    const datos = (j && j.data) || [];
    const q = normTitulo(t);
    if (!q) return null;
    let mejor = null, mejorP = 0, empate = false;
    for (let i = 0; i < datos.length; i++) {
      const a = datos[i] && datos[i].attributes;
      if (!a) continue;
      const nombres = Object.keys(a.title || {}).map((k) => a.title[k])
        .concat((a.altTitles || []).map((o) => o && Object.keys(o).length ? o[Object.keys(o)[0]] : ""));
      let p = 0;
      for (let n = 0; n < nombres.length; n++) {
        const nt = normTitulo(nombres[n]);
        if (!nt) continue;
        if (nt === q) { p = 3; break; }
        if (nt.length >= 10 && q.length >= 10 && (nt.indexOf(q) >= 0 || q.indexOf(nt) >= 0)) p = Math.max(p, 2);
      }
      if (p > mejorP) { mejorP = p; mejor = datos[i]; empate = false; }
      else if (p > 0 && p === mejorP) empate = true;
    }
    if (mejor && mejorP >= 2 && !empate) {
      const Lk = (mejor.attributes && mejor.attributes.links) || {};
      const idDe = (v) => { const mm = String(v || "").match(/(\d+)\D*$/); return mm ? parseInt(mm[1], 10) : 0; };
      const ids = { al: idDe(Lk.al), mal: idDe(Lk.mal) };
      if (ids.al || ids.mal) {
        try { kino.storage.set(clave, ids, 604800000); } catch (e2) { /* almacén lleno */ }
        kino.log("manga: puente MangaDex ✓ «" + t.slice(0, 40) + "»: al " + ids.al + ", mal " + ids.mal);
        return ids;
      }
    }
    try { kino.storage.set(clave, { fallo: Date.now() }, 21600000); } catch (e2) { /* almacén lleno */ }
    kino.log("manga: puente MangaDex sin hallazgo claro para «" + t.slice(0, 40) + "»");
  } catch (e) {
    kino.log("manga: puente MangaDex falló:", String((e && e.message) || e).slice(0, 100));
  }
  return null;
}

// El progreso de manga que hay hoy en la lista de MAL de la persona
// (para no rebajarla jamás).
async function progresoMangaMAL(malId) {
  await null;
  const r = await kino.fetch("https://api.myanimelist.net/v2/manga/" + malId + "?fields=my_list_status", {
    headers: { Authorization: "Bearer " + (await malToken()) }
  });
  if (!r.ok) return null;
  try {
    const j = r.json();
    const st = j && j.my_list_status;
    return (st && Number(st.num_chapters_read)) || 0;
  } catch (e) { return null; }
}

// La puerta: proto_manga_markChapter({ title, chapter, source?,
// anilistId?, malId? }) responde { marked, title?, where?, dup?,
// reason? }. Los motivos son "sin-sesion", "no-encontrada" y "fallo",
// para que quien llama pueda decirle a la persona qué pasó.
export async function proto_manga_markChapter(arg) {
  await null;
  const title = String((arg && arg.title) || "").trim().slice(0, 200);
  const num = Number(arg && arg.chapter);
  if (!title || !isFinite(num)) throw new Error("sin título o capítulo");
  const cap = Math.max(0, Math.floor(num));
  const limpio = tituloLimpio(title);
  const anilistToken = tokenAniList();
  let malListo = false;
  try {
    malListo = !!(credencialesMAL() && (codigoMAL() || kino.storage.get("malRefreshTokenRotado")));
  } catch (e) { malListo = false; }
  if (!anilistToken && !malListo) {
    kino.log("manga: sin sesión, no se registró «" + title.slice(0, 40) + "»");
    return { marked: false, reason: "sin-sesion", title: title };
  }
  let manga = await resolverManga(
    Number((arg && arg.anilistId)) || 0,
    Number((arg && arg.malId)) || 0,
    title, anilistToken);
  // v0.7.3 — adornos «(Sin Censura)»: los catálogos guardan la serie sin
  // ellos, así que el título limpio es otra oportunidad legítima (el
  // emparejamiento sigue exigente: nunca marca por parecido vago).
  if (!manga && limpio && limpio !== title) {
    manga = await resolverManga(0, 0, limpio, anilistToken);
    if (manga) kino.log("manga: encontrada sin el adorno del título («" + title.slice(0, 40) + "»)");
  }
  // v0.10.0 — el puente de MangaDex, en dos ayudas:
  // (a) AniList halló la serie pero SIN su enlace de MAL (manhuas
  // chinos, series muy nuevas): los links de MangaDex traen el id
  // exacto de MAL — metadato verificado, mejor que otro parecido.
  // (b) Nadie la halló: MangaDex busca el título en todos sus idiomas
  // (español, inglés, original) y sus links resuelven la serie
  // entera — o al menos su id de MAL.
  if (manga && !manga.mal && malListo) {
    const md = await idsMangaDex(manga.titulo || title);
    if (md && md.mal) {
      manga.mal = md.mal;
      kino.log("manga: enlace de MAL por el puente de MangaDex (id " + md.mal + ")");
    }
  }
  if (!manga || (!manga.anilist && !manga.mal)) {
    let md = await idsMangaDex(title);
    if (!md && limpio && limpio !== title) md = await idsMangaDex(limpio);
    if (md) {
      let media3 = null;
      if (md.al) media3 = await resolverManga(md.al, 0, title, anilistToken);
      if (media3) {
        manga = media3;
        if (!manga.mal && md.mal) manga.mal = md.mal;
        kino.log("manga: hallada por el puente de MangaDex («" + title.slice(0, 40) + "»)");
      } else if (md.mal && malListo) {
        manga = { anilist: null, mal: md.mal, titulo: title, leido: null };
        kino.log("manga: solo MAL, por el puente de MangaDex (id " + md.mal + ")");
      }
    }
  }
  // v0.7.1 — afinar el emparejamiento con MAL: (a) AniList la tiene
  // pero sin enlace a MAL (típico de manhuas chinos y series muy
  // nuevas): se busca en MAL por el título; (b) AniList no la encontró:
  // MAL busca por título y con su id se resuelve el registro completo.
  if (manga && !manga.mal && malListo) {
    const porTitulo = await buscarMangaMAL(manga.titulo || title);
    if (porTitulo) {
      manga.mal = porTitulo;
      kino.log("manga: enlace de MAL hallado por título (id " + porTitulo + ")");
    }
  }
  if ((!manga || (!manga.anilist && !manga.mal)) && malListo) {
    let porTitulo = await buscarMangaMAL(title);
    if (!porTitulo && limpio && limpio !== title) porTitulo = await buscarMangaMAL(limpio);
    if (porTitulo) {
      const media2 = await resolverManga(0, porTitulo, title, anilistToken);
      manga = media2 || { anilist: null, mal: porTitulo, titulo: title, leido: null };
      kino.log("manga: MAL la encontró por título («" + title.slice(0, 40) + "», id " + porTitulo + ")");
    }
  }
  // v0.7.2 — el id de MAL que trae el lector (MangaTrack) viene de una
  // fuente exacta, los "links" de MangaDex: si AniList no conoce ese
  // mapeo o la serie no trae enlace a MAL, MAL igual queda marcado
  // con ese id — es metadato fiable, no un parecido de título.
  const malDeArg = Number((arg && arg.malId)) || 0;
  if (manga && !manga.mal && malDeArg > 0 && malListo) {
    manga.mal = malDeArg;
    kino.log("manga: enlace de MAL del lector (id " + malDeArg + ")");
  }
  if ((!manga || (!manga.anilist && !manga.mal)) && malDeArg > 0 && malListo) {
    manga = { anilist: null, mal: malDeArg, titulo: title, leido: null };
    kino.log("manga: solo MAL, por el id exacto del lector (id " + malDeArg + ")");
  }
  if (!manga || (!manga.anilist && !manga.mal)) {
    kino.log("manga: no encontrada en AniList («" + title.slice(0, 60) + "»)");
    return { marked: false, reason: "no-encontrada", title: title };
  }
  const donde = [];
  let yaEstaba = false;
  let fallo = "";
  if (manga.anilist && anilistToken) {
    if (manga.leido !== null && manga.leido >= cap) {
      yaEstaba = true;
    } else {
      try {
        await enAniList(anilistToken, { anilistId: manga.anilist, progress: cap, status: "CURRENT" });
        donde.push("AniList");
      } catch (e) {
        fallo = "anilist " + String((e && (e.status || e.message)) || e).slice(0, 80);
        kino.log("manga: AniList falló:", fallo);
      }
    }
  }
  if (manga.mal && malListo) {
    let actual = null;
    try { actual = await progresoMangaMAL(manga.mal); }
    catch (e) { kino.log("manga: progreso MAL falló:", String((e && e.message) || e).slice(0, 80)); }
    if (actual !== null && actual >= cap) {
      yaEstaba = true;
    } else {
      try {
        await enMangaMAL(manga.mal, cap, "reading");
        donde.push("MAL");
      } catch (e) {
        fallo = (fallo ? fallo + " · " : "") + "mal " + String((e && (e.status || e.message)) || e).slice(0, 80);
        kino.log("manga: MAL falló:", String((e && (e.status || e.message)) || e).slice(0, 80));
      }
    }
  }
  if (donde.length) {
    kino.log("manga: cap " + cap + " de «" + manga.titulo + "» en " + donde.join(" y "));
    return { marked: true, dup: false, title: manga.titulo, where: donde.join(" y ") };
  }
  if (yaEstaba) return { marked: true, dup: true, title: manga.titulo, where: "" };
  if (fallo) return { marked: false, reason: "fallo", title: title };
  return { marked: false, reason: "sin-id", title: title };
}

// v0.11.0 — la llamada "progress" de la puerta manga: LA VUELTA de la
// integración. proto_manga_progress({ title, anilistId?, malId? })
// responde { found, progress?, where?, title?, reason? } con el
// progreso que hay HOY en las listas de la persona: el de AniList
// (mediaListEntry, que resolverManga ya trae) y el de MAL
// (num_chapters_read) — manda el MAYOR de los dos y de dónde salió.
// Quien llama decide qué hace con él (MangaTrack solo SUBE sus marcas
// ✓, nunca las baja). Los motivos: "sin-sesion", "no-encontrada" y
// "sin-lista" (la serie existe pero la persona no la tiene en ninguna
// lista: progreso 0, que es una respuesta válida y distinta).
export async function proto_manga_progress(arg) {
  await null;
  const title = String((arg && arg.title) || "").trim().slice(0, 200);
  const anilistId = Number(arg && arg.anilistId) || 0;
  const malId = Number(arg && arg.malId) || 0;
  const anilistToken = tokenAniList();
  let malListo = false;
  try {
    malListo = !!(credencialesMAL() && (codigoMAL() || kino.storage.get("malRefreshTokenRotado")));
  } catch (e) { malListo = false; }
  if (!anilistToken && !malListo) {
    return { found: false, reason: "sin-sesion", title: title };
  }
  // Identificación: la misma vara de markChapter — ids exactos primero,
  // título después (con su segunda pasada +18 si hace falta).
  let manga = await resolverManga(anilistId, malId, title, anilistToken);
  const limpio = tituloLimpio(title);
  if (!manga && limpio && limpio !== title) {
    manga = await resolverManga(0, 0, limpio, anilistToken);
  }
  if (!manga || (!manga.anilist && !manga.mal)) {
    kino.log("progress: no encontrada («" + title.slice(0, 60) + "»)");
    return { found: false, reason: "no-encontrada", title: title };
  }
  // AniList: el progreso viene en el propio mediaListEntry (null si la
  // persona no la tiene en su lista).
  let mejor = null;
  let donde = "";
  if (anilistToken && manga.anilist && typeof manga.leido === "number") {
    mejor = manga.leido;
    donde = "AniList";
  }
  // MAL: num_chapters_read de su lista (0 si no la tiene anotada).
  if (manga.mal && malListo) {
    let pm = null;
    try { pm = await progresoMangaMAL(manga.mal); }
    catch (e) { pm = null; }
    if (pm !== null && (mejor === null || pm > mejor)) {
      mejor = pm;
      donde = "MyAnimeList";
    }
  }
  if (mejor === null) {
    kino.log("progress: sin lista de la persona («" + title.slice(0, 40) + "»)");
    return { found: false, reason: "sin-lista", title: manga.titulo };
  }
  kino.log("progress: «" + String(manga.titulo || "").slice(0, 40) + "» lleva " + mejor + " (" + donde + ")");
  return { found: true, progress: Math.max(0, Math.floor(mejor)), where: donde, title: manga.titulo };
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

  // v0.12.0 — la temporada del evento (o la que nombra el propio título)
  // para que las series por temporadas marquen su entrada correcta.
  const temporada = event.kind === "episode"
    ? Math.max(event.season || 1, temporadaEnTitulo(titulo) || 1) : 1;

  try {
    const anime = await resolverAnime(ids, titulo, temporada);
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
// ---------- whoami (v0.13.0) ----------

// La puertita discreta: dice QUÉN tiene sesión aquí (sin red). Solo lee
// los nombres de usuario públicos que ya están guardados en el almacén
// tras iniciar sesión o validar la conexión; nunca manda tokens ni nada
// privado. MangaTrack la llama al configurar «Mi AniList» para no pedir
// a mano lo que ya se sabe. Sin sesión: {found: false} y punto — no es
// error, solo «aquí no hay nadie todavía».
export async function proto_manga_whoami(arg) {
  await null;
  let anilist = "";
  let mal = "";
  try { anilist = String(kino.storage.get("anilistNombre") || "").trim().slice(0, 64); } catch (e) { anilist = ""; }
  try { mal = String(kino.storage.get("malNombre") || "").trim().slice(0, 64); } catch (e) { mal = ""; }
  const found = !!(anilist || mal);
  try {
    kino.log("whoami:", found
      ? ("anilist=" + (anilist || "-") + " mal=" + (mal || "-"))
      : "sin sesión");
  } catch (e) { /* log */ }
  return {
    found: found,
    anilist: anilist || null,
    mal: mal || null
  };
}


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

// v0.9.0 — el cuerpo de «Probar conexión» en un helper propio: lo usan el
// botón de Ajustes y la pantalla del plugin sin copiar el código dos
// veces. Con MAL canjea el código si hace falta (el código es de un solo
// uso: este es el momento de canjearlo sin esperar un episodio).
async function probarConexiones() {
  await null;
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

  return partes.join("  ·  ");
}

// El botón "Probar conexión" de Ajustes: el veredicto de las dos cuentas.
export async function action(key) {
  await null;
  if (key !== "probar") return null;
  return { message: await probarConexiones() };
}

// ---------- la pantalla de iniciar sesión (capability "screen") ----------


// v0.9.0 — la pantalla propia del plugin: el estado de las dos cuentas, un
// botón por cuenta que abre la ventanita de autorización (se cierra sola al
// caer en example.com y la sesión queda guardada) y «Probar conexión».
// Es una vista pura: aquí solo se lee el almacén local, nada de red. El
// método manual de Ajustes sigue ahí como respaldo.
export async function screen(arg) {
  const state = (arg && arg.state) || arg || {};
  let alNombre = "";

  let malNombre = "";
  try { alNombre = String(kino.storage.get("anilistNombre") || ""); } catch (e) { alNombre = ""; }
  try { malNombre = String(kino.storage.get("malNombre") || ""); } catch (e) { malNombre = ""; }
  const alSesion = !!alNombre || !!tokenAniList();
  let malSesion = !!malNombre;
  if (!malSesion) {

    try { malSesion = !!(credencialesMAL() && (codigoMAL() || kino.storage.get("malRefreshTokenRotado"))); }
    catch (e) { malSesion = false; }
  }

  // Una tarjeta por cuenta: estado arriba y, debajo, O el botón de iniciar
  // sesión (si no la hay) O el de cerrarla (si ya la hay). Como el plugin
  // de YT Music: si ya existe la sesión, no se vuelve a ofrecer el botón
  // de loguear — para cambiar de cuenta se cierra la sesión primero.
  const tarjeta = (titulo, tituloEn, sesion, nombreCuenta, loginEvent, logoutEvent) => ({
    type: "Card", padding: 16, gap: 8, children: [
      { type: "Text", text: titulo, textEn: tituloEn, style: "h4" },
      { type: "Text",
        text: sesion ? "✓ sesión como " + (nombreCuenta || "tu cuenta") : "— sin sesión todavía",
        textEn: sesion ? "✓ signed in as " + (nombreCuenta || "your account") : "— not signed in yet",
        style: "p", color: sesion ? "primary" : "muted" },
      ...(sesion ? [] : [{ type: "ElevatedButton", icon: "person", fill: true,
        labelText: "Iniciar sesión", labelTextEn: "Sign in",
        onPressed: loginEvent }]),
      ...(sesion ? [{ type: "TextButton", icon: "delete",
        labelText: "Cerrar sesión", labelTextEn: "Sign out",
        confirm: "¿Cerrar la sesión en este aparato?",
        confirmEn: "Sign out on this device?",
        onPressed: logoutEvent }] : [])
    ]
  });

  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar", mergeWithKinoBar: true,
      title: "AniTrack", titleEn: "AniTrack",
      leading: { type: "IconButton", icon: "close", labelText: "Cerrar", labelTextEn: "Close", onPressed: { close: true } }
    },
    body: { type: "SingleChildScrollView", children: [{ type: "Column", padding: 16, gap: 16, crossAxisAlignment: "start", children: [
      { type: "Text", text: "Iniciar sesión", textEn: "Sign in", style: "h3" },
      { type: "Text",
        text: "Toca un botón, autoriza en la ventanita y listo: se cierra sola y la sesión queda guardada en este aparato. Nada de copiar ni pegar.",
        textEn: "Tap a button, authorize in the window and done: it closes itself and the session is saved on this device. No copying, no pasting.",
        style: "p", color: "muted" },
      tarjeta("AniList", "AniList", alSesion, alNombre, "alLogin", "alLogout"),
      tarjeta("MyAnimeList", "MyAnimeList", malSesion, malNombre, "malLogin", "malLogout"),
      { type: "ElevatedButton", icon: "sync", fill: true,
        labelText: "Probar conexión", labelTextEn: "Test connection",
        onPressed: "probar2" },
      { type: "Text",
        text: "¿No abre la ventanita? El método manual de siempre sigue en Ajustes ▸ AniTrack.",
        textEn: "No window? The manual method is still in Settings ▸ AniTrack.",
        style: "caption", color: "muted" },
      { type: "Text",
        text: "La sesión se guarda solo en este aparato: no viaja a tus otros equipos.",
        textEn: "The session is saved on this device only: it does not travel to your other devices.",
        style: "caption", color: "muted" }
    ] }] }
  };
}

// Los toques de la pantalla. «alLogin» y «malLogin» abren la ventanita de
// autorización (permitido justo después del toque de la persona); al caer
// en example.com la ventana se cierra sola, llega la dirección final y el
// token o el código queda guardado y probado en el mismo toque. Los toasts
// son honestos: si algo no salió, dicen qué pasó y que Ajustes sigue ahí.
export async function screenEvent(ev) {
  await null;
  const nombre = ev && ev.name;
  if (nombre === "open") {
    // Rellenar un nombre que falte: si ya hay sesión pero el «✓ sesión
    // como …» dice «tu cuenta» (p. ej. sesión pegada a mano en Ajustes),
    // se pregunta una sola vez aquí y la tarjeta se completa sola. Si la
    // red no ayuda, se queda en «tu cuenta»: no es error y no se avisa.
    try {
      const t = tokenAniList();
      if (t && !kino.storage.get("anilistNombre")) {
        const n = await probarTokenAniList(t);
        try { kino.storage.set("anilistNombre", n, 2500000000); } catch (e2) { /* cache */ }
        return { state: { alNombre: n } };
      }
    } catch (e) { /* la red no ayudó: queda «tu cuenta», no es error */ }
    try {
      const malHay = !!(credencialesMAL() && (codigoMAL() || kino.storage.get("malRefreshTokenRotado")));
      if (malHay && !kino.storage.get("malNombre")) {
        const t = await malToken();
        const resp = await kino.fetch("https://api.myanimelist.net/v2/users/@me", {
          headers: { Authorization: "Bearer " + t }
        });
        if (resp && resp.ok) {
          const j = resp.json();
          const n = String((j && (j.name || j.id)) || "tu usuario");
          try {
            kino.storage.set("malNombre", n, 2500000000);
            kino.storage.set("malEstado", "ok", 2500000000);
          } catch (e2) { /* cache */ }
          return { state: { malNombre: n } };
        }
      }
    } catch (e) { /* idem: queda «tu cuenta», no es error */ }
    return null;
  }

  if (nombre === "probar2") {
    let mensaje = "";
    try { mensaje = await probarConexiones(); }
    catch (e) { mensaje = "✗ la prueba falló: " + String((e && (e.code || e.message)) || e).slice(0, 80); }
    return { toast: String(mensaje).slice(0, 180) };
  }

  if (nombre === "alLogin") {
    if (!kino.visualBrowser || !kino.visualBrowser.available) {
      return { toast: "Este aparato no puede abrir la ventanita: usa el método manual en Ajustes ▸ AniTrack",
        toastEn: "This device cannot open the window: use the manual method in Settings ▸ AniTrack" };
    }
    let r = null;
    try {
      r = await kino.visualBrowser.open({
        url: ANILIST_AUTH_URL,
        title: "AniList",
        doneWhen: { urlMatches: "https://example.com/*" },
        collect: { finalUrl: true },
        timeoutMs: 600000
      });
    } catch (e) {
      return { toast: "La ventanita no se pudo abrir (" + String((e && e.code) || "fallo") + "): el método manual sigue en Ajustes",
        toastEn: "The window could not open (" + String((e && e.code) || "failed") + "): the manual method still works in Settings" };
    }
    if (!r || r.status === "closed") {
      return { toast: "Quedó sin sesión: la ventanita se cerró antes de autorizar",
        toastEn: "No session saved: the window closed before authorizing" };
    }
    if (r.status === "timeout") {
      return { toast: "Quedó sin sesión: la ventanita esperó 10 minutos y se cerró; toca de nuevo cuando quieras",
        toastEn: "No session saved: the window waited 10 minutes and closed; tap again whenever you want" };
    }
    const token = tokenAniListDeUrl(r.finalUrl || "");
    if (!token) {
      return { toast: "Quedó sin sesión: la ventanita terminó sin el token (¿cancelaste la autorización?)",
        toastEn: "No session saved: the window finished without the token (did you cancel?)" };
    }
    try { kino.storage.set("alTokenAuto", token, 2500000000); } catch (e2) { /* almacén lleno */ }
    try {
      const nombreAL = await probarTokenAniList(token);
      try { kino.storage.set("anilistNombre", nombreAL, 2500000000); } catch (e3) { /* cache */ }
      return { state: { alNombre: nombreAL }, toast: "✓ AniList como " + nombreAL, toastEn: "✓ AniList as " + nombreAL };
    } catch (e) {
      try { kino.storage.remove("alTokenAuto"); } catch (e3) { /* cache */ }
      const porque = String((e && (e.status || e.message)) || "sin detalle").slice(0, 90);
      return { toast: "AniList rechazó el token (" + porque + "): quedó sin sesión",
        toastEn: "AniList rejected the token (" + porque + "): no session saved" };
    }
  }

  if (nombre === "malLogin") {
    if (!kino.visualBrowser || !kino.visualBrowser.available) {
      return { toast: "Este aparato no puede abrir la ventanita: usa el método manual en Ajustes ▸ AniTrack",
        toastEn: "This device cannot open the window: use the manual method in Settings ▸ AniTrack" };
    }
    let r = null;
    try {
      r = await kino.visualBrowser.open({
        url: MAL_AUTH_URL,
        title: "MyAnimeList",
        doneWhen: { urlMatches: "https://example.com/*" },
        collect: { finalUrl: true },
        timeoutMs: 600000
      });
    } catch (e) {
      return { toast: "La ventanita no se pudo abrir (" + String((e && e.code) || "fallo") + "): el método manual sigue en Ajustes",
        toastEn: "The window could not open (" + String((e && e.code) || "failed") + "): the manual method still works in Settings" };
    }
    if (!r || r.status === "closed") {
      return { toast: "Quedó sin sesión: la ventanita se cerró antes de autorizar",
        toastEn: "No session saved: the window closed before authorizing" };
    }
    if (r.status === "timeout") {
      return { toast: "Quedó sin sesión: la ventanita esperó 10 minutos y se cerró; toca de nuevo cuando quieras",
        toastEn: "No session saved: the window waited 10 minutes and closed; tap again whenever you want" };
    }
    const codigo = codigoMALDeUrl(r.finalUrl || "");
    if (!codigo) {
      return { toast: "Quedó sin sesión: la ventanita terminó sin el código (¿cancelaste la autorización?)",
        toastEn: "No session saved: the window finished without the code (did you cancel?)" };
    }
    try { kino.storage.set("malCodigoAuto", codigo, 2500000000); } catch (e2) { /* almacén lleno */ }
    try {
      // El código es de un solo uso: se canjea aquí mismo y, si sirve, se
      // pregunta por el nombre para el «✓ sesión como …» de la tarjeta.
      const t = await malToken();
      const resp = await kino.fetch("https://api.myanimelist.net/v2/users/@me", {
        headers: { Authorization: "Bearer " + t }
      });
      if (!resp.ok) {
        try { kino.storage.set("malEstado", "error @me " + resp.status, 2500000000); } catch (e3) { /* cache */ }
        return { toast: "MAL respondió " + resp.status + ": toca «Probar conexión» para confirmar",
          toastEn: "MAL answered " + resp.status + ": tap Test connection to confirm" };
      }
      const j = resp.json();
      const nombreMAL = String((j && (j.name || j.id)) || "tu usuario");
      try {
        kino.storage.set("malEstado", "ok", 2500000000);
        kino.storage.set("malNombre", nombreMAL, 2500000000);
      } catch (e3) { /* cache */ }
      return { state: { malNombre: nombreMAL }, toast: "✓ MyAnimeList como " + nombreMAL,
        toastEn: "✓ MyAnimeList as " + nombreMAL };
    } catch (e) {
      const porque = String((e && (e.status || e.code || e.message)) || "sin detalle").slice(0, 90);
      try { kino.storage.set("malEstado", "error " + porque.slice(0, 60), 2500000000); } catch (e3) { /* cache */ }
      return { toast: "MAL rechazó el canje (" + porque + "): quedó sin sesión",
        toastEn: "MAL rejected the exchange (" + porque + "): no session saved" };
    }
  }

  if (nombre === "alLogout") {
    try { kino.storage.remove("alTokenAuto"); } catch (e) { /* cache */ }
    try { kino.storage.remove("anilistNombre"); } catch (e) { /* cache */ }
    return { state: { alNombre: "" },
      toast: "Sesión de AniList cerrada en este aparato; si pegaste una dirección a mano en Ajustes, esa sigue activa",
      toastEn: "AniList session closed on this device; if you pasted an address by hand in Settings, that one stays active" };
  }

  if (nombre === "malLogout") {
    const claves = ["malCodigoAuto", "malAccessToken", "malRefreshTokenRotado", "malNombre", "malEstado"];
    for (let i = 0; i < claves.length; i++) {
      try { kino.storage.remove(claves[i]); } catch (e) { /* cache */ }
    }
    return { state: { malNombre: "" },
      toast: "Sesión de MyAnimeList cerrada en este aparato; si pegaste una dirección a mano en Ajustes, esa sigue activa",
      toastEn: "MyAnimeList session closed on this device; if you pasted an address by hand in Settings, that one stays active" };
  }

  return null;
}






