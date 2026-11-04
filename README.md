# AniTrack — AniList y MAL para Kino

**AniTrack** marca automáticamente tu progreso de anime en **AniList** y **MyAnimeList** cada vez que terminas de ver un episodio o una película en [Kino](https://github.com/kinotvapp/kino-plugins), sin importar desde qué fuente o plugin lo estés reproduciendo.

- ✅ Funciona con **cualquier fuente** de Kino (latino, subtitulado, la que uses)
- ✅ Se dispara al **terminar** un episodio (90% visto o menos de 3 minutos restantes) — no al pausarlo ni cerrarlo a la mitad
- ✅ Identifica el anime por sus IDs de IMDb/TMDB/AniList y, si no los hay, lo **busca por título**
- ✅ Si un servicio falla, el otro sigue funcionando
- 🔒 Tus tokens **nunca salen de tu dispositivo** más que hacia cada servicio
- 🚀 **Iniciar sesión toma un minuto**: un botón, una autorización y una pegada

**Requisito:** Kino **0.9.74 o más reciente** (si el plugin te dice que necesita una versión más nueva de Kino, actualiza la app).

---

## 1 · Instalar el plugin

1. Abre **Kino** → menú **☰** → **Plugins**
2. Toca el botón **+**
3. Escribe: `Susejing/kino-anitrack` → **Agregar** → **Instalar**
4. Acepta el aviso en rojo: es el permiso de tracking — sin él el plugin no puede saber qué reproduciste

> 💡 **Importante:** los *ajustes del plugin se borran al desinstalarlo*. Si algún día reinstalas, solo tienes que iniciar sesión de nuevo. Tu lista de anime nunca se pierde: vive en AniList/MAL, no en el plugin.

---

## 2 · Iniciar sesión (en el teléfono)

Abre los ajustes del plugin (menú **☰** → **Plugins** → **AniTrack** → ⚙️). Verás una sección **«Iniciar sesión»** con un botón por servicio.

### AniList — 3 pasos

1. Toca **«Iniciar sesión con AniList»** → se abre la web → inicia sesión y toca **Authorize**
2. El navegador queda en una página sencilla (example.com) con la **dirección llena de letras**: cópiala completa desde la barra de direcciones
3. Pégala en **«Pega aquí la dirección (AniList)»** → toca **Guardar** → listo ✅

Al guardar, el plugin comprueba el token contra AniList y te dice con qué usuario entraste. La sesión de AniList dura **un año**.

### MyAnimeList — 4 pasos

1. Toca **«Iniciar sesión con MyAnimeList»** → se abre la web → inicia sesión y toca **Authorize**
2. El navegador queda en example.com con la dirección terminada en `?code=ALGO`: cópiala completa
3. Pégala en **«Pega aquí la dirección (MyAnimeList)»** → toca **Guardar**
4. Toca **«Probar conexión»** → te dice **«✓ MyAnimeList como tu-usuario»** ✅

> ⚠️ El código de MAL **vence rápido**: haz los 4 pasos seguidos, sin dejar pasar mucho tiempo entre la autorización y el «Probar conexión». Si te dice que venció o ya se usó, no pasa nada: toca el botón de nuevo, autoriza y pega la dirección nueva. Después de eso, el plugin **renueva solo** la sesión cada mes.

### ¿Ya está?

Sí. La línea **«Conexión»** te muestra tus dos cuentas (ej. `AniList ✓ como tu-usuario · MyAnimeList ✓ como tu-usuario`), y a partir de ahí **cada episodio o película que termines se marca solo** en tus listas. No tienes que volver a tocar nada.

> 📺 **En televisores y cajas Android:** la sección de un toque solo aparece en el teléfono, porque pegar direcciones largas con el control remoto es una tortura. Configura primero el plugin en tu teléfono, o usa la sección «Método antiguo (opcional)», que sigue disponible en la TV.

---

## 3 · Método antiguo (opcional)

Si venías de la versión anterior y ya tienes tus tokens o tu propia app de MyAnimeList, siguen funcionando igual: están en la sección **«Método antiguo (opcional)»** de los ajustes y no tienes que cambiar nada.

---

## Preguntas honestas

**¿Por qué hay que pegar la dirección y no solo autorizar?** AniList y MAL no ofrecen el método «introduce un código corto en la TV» (eso lo tienen Trakt y SIMKL). Y un plugin de Kino no puede recibir la respuesta del navegador como una app de teléfono. Un botón + una pegada es **el mínimo físico posible** con estos dos servicios — y da igual de resultado: al Guardar, la sesión queda activa.

**¿Alguien ve mis datos?** No. Los tokens viven en tu dispositivo y solo viajan a AniList y a MAL. Este plugin no tiene servidor propio.


## Licencia

Código bajo la **GPL-3.0**: puedes usarlo y modificarlo, pero tu versión debe seguir abierta y con crédito. © 2026 **Susejing** (Bogotá, Colombia). El texto completo está en el archivo [LICENSE](LICENSE).
