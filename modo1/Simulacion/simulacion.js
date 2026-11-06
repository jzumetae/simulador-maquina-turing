// =========================================================
// Simulador · Máquina de Turing — pantalla de simulación (Modo 1)
// =========================================================
//
// La ejecución se puede ver de dos formas:
//   simulacion.html?modo=automatico → la máquina avanza sola
//   simulacion.html?modo=pasos      → avanzas tú, paso a paso
// También se puede cambiar con el selector de arriba.
//
// Lee la máquina guardada en sessionStorage (maquina.js, clave
// 'mt-maquina'). Si no hay una configuración válida NO se puede
// ejecutar: regresa a automatico.html con un aviso.
//
// La cinta tiene 50 celdas (0 a 49) y se llena al azar con Σ y B.
// La palabra NO se escribe en la cinta: hay que encontrarla.
//   1. Búsqueda     → un marco recorre la cinta (celdas 1 a 48) buscando la
//                     palabra en cualquier parte. Si no aparece: rechazada.
//   2. Verificación → si aparece, la máquina toma esa palabra como entrada
//                     (lo que está fuera de ella lo lee como blanco B),
//                     empieza en q0 sobre su primera celda y aplica δ:
//                     acepta o rechaza según sus transiciones.
// Si el cabezal intenta salir de la cinta, la máquina se detiene.
//
// Cada paso de δ se anima en cuatro fases:
//   1. Leer      → se iluminan la celda bajo el cabezal, la fila de δ y la flecha
//   2. Escribir  → aparece el símbolo nuevo en la celda
//   3. Mover     → el cabezal se desplaza y una ficha recorre la flecha del diagrama
//   4. Llegar    → queda marcado el nuevo estado
document.addEventListener('DOMContentLoaded', () => {
  // ---------- Ajustes ----------
  const CELDAS = MT.CELDAS;                 // 50 celdas: de la 0 a la 49
  const INICIO_PALABRA = MT.INICIO_PALABRA; // celda 1: ahí empieza la búsqueda
  // La palabra se busca de la celda 1 a la 48: así siempre queda una celda
  // a cada lado dentro de la cinta para los blancos que la rodean.
  const BUSCAR_DESDE = INICIO_PALABRA;
  const BUSCAR_HASTA = CELDAS - 2;
  const MAX_PASOS = 2000;                   // por si la máquina nunca se detiene
  const MS_MIN = 100;                       // límites del tiempo por paso (ms)
  const MS_MAX = 3000;
  const DURACION_PASO_A_PASO = 1000;        // ms que dura cada paso en "Paso a paso"

  // Sin configuración no se puede ejecutar: se regresa a la pantalla del Modo 1
  const PANTALLA_CONFIGURACION = '../automatico.html?aviso=sin-configuracion';

  const DESPLAZAMIENTO = { R: 1, L: -1, S: 0 };
  const TEXTO_MOVIMIENTO = {
    R: 'movió el cabezal a la derecha',
    L: 'movió el cabezal a la izquierda',
    S: 'dejó el cabezal en su lugar',
  };
  const TEXTO_SITUACION = {
    lista: 'Lista para iniciar',
    ejecutando: 'En ejecución',
    pausa: 'En pausa',
    aceptada: 'Aceptada',
    rechazada: 'Rechazada',
    fuera: 'Fuera de la cinta',
    limite: 'Sin detenerse',
  };
  const TEXTO_INSIGNIA = {
    aceptada: 'Palabra aceptada',
    rechazada: 'Palabra rechazada',
    fuera: 'El cabezal salió de la cinta',
    limite: `Límite de ${MAX_PASOS} pasos`,
  };

  // ---------- Cargar la máquina ----------
  // Solo se acepta una configuración válida, guardada en esta pestaña
  // por "Nueva configuración" o "Cargar configuración".
  function cargarMaquina() {
    const datos = MT.leerDeSesion();
    if (!datos) return null;
    const { maquina: revisada, errores } = MT.validar(datos);
    return errores.length ? null : revisada;
  }

  const maquina = cargarMaquina();
  if (!maquina) {
    window.location.replace(PANTALLA_CONFIGURACION);
    return;
  }

  // Map: 'estado + símbolo' → transición
  const claveDelta = (estado, simbolo) => `${estado}\u0001${simbolo}`;
  const tablaDelta = new Map(maquina.transiciones.map((t) => [claveDelta(t.estado, t.lee), t]));

  // ---------- Elementos de la página ----------
  const $ = (id) => document.getElementById(id);
  const raiz = document.querySelector('.sim');
  const svg = $('diagrama');
  const ventanaCinta = $('ventana-cinta');
  const tira = $('tira');
  const cabezal = $('cabezal');
  const cabezalEstado = $('cabezal-estado');
  const cuerpoTabla = $('tabla-delta');
  const panelDelta = $('pestana-delta');
  const panelHistorial = $('pestana-historial');
  const cuerpoHistorial = $('historial');
  const insignia = $('insignia');
  const btnReiniciar = $('btn-reiniciar');
  const btnAnterior = $('btn-anterior');
  const btnSiguiente = $('btn-siguiente');
  const btnEjecutar = $('btn-ejecutar');
  const textoEjecutar = $('texto-ejecutar');
  const velocidad = $('velocidad');
  const velocidadMs = $('velocidad-ms');
  const formPalabra = $('form-palabra');
  const campoPalabra = $('campo-palabra');
  const aviso = $('aviso');

  // ---------- Estado de la simulación ----------
  let fondo = {};            // símbolos al azar de la cinta (sin la palabra)
  let cintaDelModo2 = false; // true si la cinta es la misma de la sesión manual
  let historial = [];        // todas las configuraciones recorridas
  let actual = 0;            // posición en el historial
  let modo = 'automatico';   // 'automatico' o 'pasos'
  let msPorPaso = 900;       // milisegundos por paso en automático
  let reproduciendo = false;
  let animando = false;
  let pasoPendiente = false; // "Siguiente" pulsado mientras se animaba el paso anterior
  let generacion = 0;        // cambia al reiniciar; cancela animaciones pendientes

  // ---------- Utilidades ----------
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
  const claveArista = (origen, destino) => `${origen}\u0001${destino}`;
  const redondear = (n) => Math.round(n * 10) / 10;

  const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // "q12" → { base: 'q', indice: '12' } para escribir q₁₂
  function dividirNombre(estado) {
    const partes = /^(.*?\D)(\d+)$/.exec(estado);
    return partes ? { base: partes[1], indice: partes[2] } : { base: estado, indice: '' };
  }

  function estadoHTML(estado) {
    const { base, indice } = dividirNombre(estado);
    return indice ? `${escapar(base)}<sub>${escapar(indice)}</sub>` : escapar(estado);
  }

  let temporizadorAviso;
  function mostrarAviso(texto, esError = false) {
    aviso.textContent = texto;
    aviso.classList.toggle('error', esError);
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), esError ? 6000 : 4500);
  }

  // =========================================================
  // La máquina: configuraciones y pasos
  // =========================================================
  // Una configuración es una "foto" de la máquina:
  //   { fase, estado, cabezal, alcance, cinta, segmento, tocadas, pasos, transicion, salio }
  // fase:      'buscar'        → todavía no se busca la palabra (configuración inicial)
  //            'no-encontrada' → la palabra no está en la cinta: rechazada
  //            'verificar'     → la palabra se encontró y δ la está procesando
  // cinta:     solo las celdas que no están en blanco: { 3: '0', 4: '1', ... }
  // segmento:  { desde, hasta } celdas donde se encontró la palabra
  // tocadas:   celdas fuera de la palabra que la máquina ya escribió
  // transicion es la que se aplicó para llegar a esta configuración.
  // salio es 'izquierda' o 'derecha' si en ese paso el cabezal intentó salir de la cinta.

  // ---------- Cinta aleatoria ----------
  // Cada vez que se genera, las 50 celdas se llenan al azar con los símbolos
  // de Σ y el blanco B. Los símbolos auxiliares de Γ (como X o Y) nunca salen
  // en la cinta inicial: funcionan como centinelas y solo los escribe la
  // máquina durante la ejecución.
  const SIMBOLOS_ALEATORIOS = [...new Set([...maquina.alfabetoEntrada, maquina.blanco])];

  function generarCintaAleatoria() {
    fondo = {};
    cintaDelModo2 = false;
    palabraDelModo2 = null;
    const azar = new Uint32Array(CELDAS);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(azar);
    else azar.forEach((_, i) => { azar[i] = Math.floor(Math.random() * 2 ** 32); });
    for (let i = 0; i < CELDAS; i++) {
      const simbolo = SIMBOLOS_ALEATORIOS[azar[i] % SIMBOLOS_ALEATORIOS.length];
      if (simbolo !== maquina.blanco) fondo[i] = simbolo;
    }
  }

  // Desde el Modo 2 («Ejecutar en Modo 1») llega la cinta exacta de la sesión
  // manual: la primera vez se usa esa misma cinta para reproducir la sesión.
  // Solo se acepta si coincide con la palabra de la máquina (que en esa cinta
  // está desde la celda 1, donde la sesión manual la tenía).
  let palabraDelModo2 = null;

  function usarCintaDelModo2() {
    const celdas = MT.tomarCintaInicial();
    if (!celdas) return false;
    const fin = INICIO_PALABRA + maquina.palabra.length;
    const coincide = celdas[INICIO_PALABRA - 1] === maquina.blanco &&
      maquina.palabra.every((s, i) => celdas[INICIO_PALABRA + i] === s) &&
      (fin >= CELDAS || celdas[fin] === maquina.blanco);
    if (!coincide) return false;
    // Los auxiliares (X, Y, ...) nunca van en la cinta inicial: si la cinta
    // del Modo 2 trae alguno, esa celda se deja en blanco.
    fondo = {};
    celdas.forEach((s, i) => { if (esDeCintaInicial(s) && s !== maquina.blanco) fondo[i] = s; });
    cintaDelModo2 = true;
    palabraDelModo2 = maquina.palabra.join('\u0001');
    return true;
  }

  // ¿El símbolo puede estar en la cinta inicial? Solo Σ y el blanco B.
  function esDeCintaInicial(simbolo) {
    return SIMBOLOS_ALEATORIOS.includes(simbolo);
  }

  // La configuración inicial es la cinta al azar TAL CUAL: la palabra no se
  // escribe. El cabezal espera en la celda 1, donde empieza la búsqueda.
  function configuracionInicial() {
    const cinta = { ...fondo };
    // Seguro extra: ningún auxiliar de Γ (X, Y, ...) en la cinta inicial;
    // esos símbolos solo aparecen cuando la máquina los escribe.
    Object.keys(cinta).forEach((i) => { if (!esDeCintaInicial(cinta[i])) delete cinta[i]; });
    return {
      fase: 'buscar',
      estado: maquina.estadoInicial,
      cabezal: BUSCAR_DESDE,
      alcance: BUSCAR_DESDE,
      cinta,
      segmento: null,
      tocadas: {},
      pasos: 0,
      transicion: null,
      salio: null,
    };
  }

  // ---------- Búsqueda de la palabra ----------
  const simboloEn = (cinta, i) => cinta[i] ?? maquina.blanco;

  // Primera aparición de la palabra en la cinta (en cualquier parte, entre
  // las celdas 1 y 48). Devuelve { desde, hasta } o null si no aparece.
  // La palabra vacía ε siempre está: se toma en la celda 1.
  function encontrarPalabra(cinta) {
    const w = maquina.palabra;
    const n = w.length;
    // Cinta que llegó del Modo 2 con su misma palabra: es la de la celda 1
    if (cintaDelModo2 && w.join('\u0001') === palabraDelModo2) {
      return { desde: INICIO_PALABRA, hasta: INICIO_PALABRA + n - 1 };
    }
    for (let p = BUSCAR_DESDE; p + n - 1 <= BUSCAR_HASTA; p++) {
      if (w.every((s, k) => simboloEn(cinta, p + k) === s)) return { desde: p, hasta: p + n - 1 };
    }
    return null;
  }

  // Última celda donde puede empezar la palabra (hasta ahí llega el recorrido)
  const ultimoInicio = () => BUSCAR_HASTA - maquina.palabra.length + 1;

  function buscar(conf) {
    const segmento = encontrarPalabra(conf.cinta);
    if (!segmento) {
      return {
        ...conf,
        fase: 'no-encontrada',
        cabezal: Math.max(BUSCAR_DESDE, ultimoInicio()),
      };
    }
    return {
      ...conf,
      fase: 'verificar',
      cabezal: segmento.desde,
      // celda más lejana que importa: el blanco que cierra la palabra o hasta donde llegó el cabezal
      alcance: Math.min(segmento.hasta + 1, CELDAS - 1),
      segmento,
      tocadas: {},
    };
  }

  // ¿La celda i es parte de la entrada de la máquina? Lo es si está dentro de
  // la palabra encontrada o si la máquina ya escribió en ella. Lo demás es
  // relleno al azar que no forma parte de la entrada: la máquina lo lee como B.
  function esDeEntrada(conf, i) {
    if (conf.fase !== 'verificar') return true;
    const { desde, hasta } = conf.segmento;
    return (i >= desde && i <= hasta) || conf.tocadas[i] === true;
  }

  function leer(conf) {
    if (!esDeEntrada(conf, conf.cabezal)) return maquina.blanco;
    return simboloEn(conf.cinta, conf.cabezal);
  }

  function transicionPara(conf) {
    if (conf.fase !== 'verificar') return null;
    return tablaDelta.get(claveDelta(conf.estado, leer(conf))) || null;
  }

  // La transición que sigue (null si toca buscar o si ya se detuvo)
  function proximaTransicion(conf) {
    return estaDetenida(conf) ? null : transicionPara(conf);
  }

  // Da el siguiente paso: primero la búsqueda, después δ.
  // Si el movimiento saca al cabezal de la cinta (antes de la celda 0 o
  // después de la 49), el cabezal se queda en la orilla y la máquina se detiene.
  function avanzar(conf) {
    if (conf.fase === 'buscar') return buscar(conf);

    const t = transicionPara(conf);
    const cinta = { ...conf.cinta };
    if (t.escribe === maquina.blanco) delete cinta[conf.cabezal];
    else cinta[conf.cabezal] = t.escribe;
    const tocadas = { ...conf.tocadas, [conf.cabezal]: true };

    const destino = conf.cabezal + DESPLAZAMIENTO[t.mueve];
    let salio = null;
    if (destino < 0) salio = 'izquierda';
    else if (destino > CELDAS - 1) salio = 'derecha';

    const cabezalNuevo = salio ? conf.cabezal : destino;
    return {
      ...conf,
      estado: t.nuevoEstado,
      cabezal: cabezalNuevo,
      alcance: Math.max(conf.alcance, cabezalNuevo),
      cinta,
      tocadas,
      pasos: conf.pasos + 1,
      transicion: t,
      salio,
    };
  }

  // Si la palabra no está en la cinta, se rechaza sin aplicar δ.
  // Si está, la máquina acepta al entrar a un estado final y rechaza si se
  // queda sin transición en un estado que no es final. También se detiene si
  // el cabezal intenta salir de la cinta de 50 celdas (pero si con ese
  // paso entró a un estado final, la palabra igual queda aceptada).
  function situacion(conf) {
    if (conf.fase === 'buscar') return 'lista';
    if (conf.fase === 'no-encontrada') return 'rechazada';
    if (maquina.estadosFinales.includes(conf.estado)) return 'aceptada';
    if (conf.salio) return 'fuera';
    if (!transicionPara(conf)) return 'rechazada';
    if (conf.pasos >= MAX_PASOS) return 'limite';
    return 'ejecutando';
  }

  function estaDetenida(conf) {
    return ['aceptada', 'rechazada', 'fuera', 'limite'].includes(situacion(conf));
  }

  // =========================================================
  // Diagrama de estados (SVG)
  // =========================================================
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const R = 30;            // radio de cada estado
  const SEPARACION = 165;  // distancia entre estados cuando van en línea
  const ALTO_LINEA = 16;   // separación entre etiquetas apiladas
  const ALTO_LAZO = 63;    // qué tan arriba llega un lazo desde el centro del estado

  const nodos = new Map();   // estado → <g>
  const aristas = new Map(); // 'origen→destino' → { camino, etiquetas: Map(δ → <text>) }
  let capaContenido;
  let capaFicha;

  function crearSVG(tipo, atributos = {}, padre = null) {
    const elemento = document.createElementNS(SVG_NS, tipo);
    Object.entries(atributos).forEach(([nombre, valor]) => elemento.setAttribute(nombre, valor));
    if (padre) padre.appendChild(elemento);
    return elemento;
  }

  function dibujarDiagrama() {
    svg.textContent = '';
    nodos.clear();
    aristas.clear();

    // Puntas de flecha (normal y resaltada) y el filtro de brillo
    const defs = crearSVG('defs', {}, svg);
    [['punta', 'rgba(214, 237, 250, 0.8)'], ['punta-activa', '#B0D9F2']].forEach(([id, color]) => {
      const marcador = crearSVG('marker', {
        id, viewBox: '0 0 12 12', refX: 10.5, refY: 6,
        markerWidth: 11, markerHeight: 11, markerUnits: 'userSpaceOnUse', orient: 'auto',
      }, defs);
      crearSVG('path', { d: 'M1 1.5 L11 6 L1 10.5 Z', fill: color }, marcador);
    });
    const filtro = crearSVG('filter', { id: 'brillo', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    crearSVG('feGaussianBlur', { stdDeviation: 3, result: 'difuso' }, filtro);
    const mezcla = crearSVG('feMerge', {}, filtro);
    crearSVG('feMergeNode', { in: 'difuso' }, mezcla);
    crearSVG('feMergeNode', { in: 'SourceGraphic' }, mezcla);

    capaContenido = crearSVG('g', {}, svg);
    const capaAristas = crearSVG('g', {}, capaContenido);
    const capaEtiquetas = crearSVG('g', {}, capaContenido);
    const capaNodos = crearSVG('g', {}, capaContenido);
    capaFicha = crearSVG('g', {}, capaContenido);

    // Hasta 6 estados van en línea; con más, en círculo
    const enLinea = maquina.estados.length <= 6;
    const { posiciones, orden } = calcularPosiciones(enLinea);

    // Las transiciones con el mismo origen y destino comparten una flecha
    const grupos = new Map();
    maquina.transiciones.forEach((t) => {
      const clave = claveArista(t.estado, t.nuevoEstado);
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(t);
    });

    // Cuánto espacio ocupa cada lazo (con sus etiquetas) por encima del estado
    const alturaLazos = new Map();
    grupos.forEach((lista) => {
      if (lista[0].estado === lista[0].nuevoEstado) {
        alturaLazos.set(lista[0].estado, ALTO_LAZO + 8 + lista.length * ALTO_LINEA);
      }
    });

    grupos.forEach((lista, clave) => {
      const origen = lista[0].estado;
      const destino = lista[0].nuevoEstado;
      const hayInversa = origen !== destino && grupos.has(claveArista(destino, origen));
      const forma = enLinea
        ? formaEnLinea(origen, destino, posiciones, orden, hayInversa, alturaLazos)
        : formaEnCirculo(origen, destino, posiciones, hayInversa);

      const camino = crearSVG('path', { class: 'd-arista', d: forma.d, 'marker-end': 'url(#punta)' }, capaAristas);
      const etiquetas = new Map();
      lista.forEach((t, n) => {
        const punto = posicionEtiqueta(forma, n, lista.length);
        const texto = crearSVG('text', {
          class: 'd-etiqueta', x: redondear(punto.x), y: redondear(punto.y), 'text-anchor': forma.ancla,
        }, capaEtiquetas);
        texto.textContent = `${t.lee}/${t.escribe},${t.mueve}`;
        etiquetas.set(claveDelta(t.estado, t.lee), texto);
      });
      aristas.set(clave, { camino, etiquetas });
    });

    // Flecha que señala el estado inicial
    const inicio = posiciones.get(maquina.estadoInicial);
    const angulo = enLinea ? Math.PI : inicio.haciaAfuera - 0.9;
    const dx = Math.cos(angulo);
    const dy = Math.sin(angulo);
    crearSVG('path', {
      class: 'd-inicial',
      d: `M${redondear(inicio.x + dx * (R + 44))} ${redondear(inicio.y + dy * (R + 44))} L${redondear(inicio.x + dx * R)} ${redondear(inicio.y + dy * R)}`,
      'marker-end': 'url(#punta)',
    }, capaAristas);

    // Estados (los finales llevan doble círculo)
    maquina.estados.forEach((estado) => {
      const p = posiciones.get(estado);
      const g = crearSVG('g', { class: 'd-nodo', transform: `translate(${redondear(p.x)} ${redondear(p.y)})` }, capaNodos);
      crearSVG('circle', { class: 'd-nodo__pulso', r: R }, g);
      crearSVG('circle', { class: 'd-nodo__borde', r: R }, g);
      if (maquina.estadosFinales.includes(estado)) {
        crearSVG('circle', { class: 'd-nodo__interior', r: R - 5.5 }, g);
      }
      const nombre = crearSVG('text', { class: 'd-nodo__nombre', x: -1, y: 7 }, g);
      const { base, indice } = dividirNombre(estado);
      nombre.appendChild(document.createTextNode(base));
      if (indice) {
        const sub = crearSVG('tspan', { class: 'd-nodo__indice', dy: 5 }, nombre);
        sub.textContent = indice;
      }
      if (estado.length > 3) nombre.style.fontSize = `${Math.max(11, 21 - (estado.length - 3) * 2.5)}px`;
      nodos.set(estado, g);
    });

    ajustarVista();
  }

  function calcularPosiciones(enLinea) {
    // el estado inicial va primero para que su flecha de entrada no estorbe
    const orden = [maquina.estadoInicial, ...maquina.estados.filter((q) => q !== maquina.estadoInicial)];
    const posiciones = new Map();
    // elipse más ancha que alta, como el panel del diagrama
    const radioX = Math.max(280, orden.length * 50);
    const radioY = Math.max(130, orden.length * 19);
    orden.forEach((estado, i) => {
      if (enLinea) {
        posiciones.set(estado, { x: i * SEPARACION, y: 0 });
      } else {
        const angulo = Math.PI + (2 * Math.PI * i) / orden.length;
        posiciones.set(estado, {
          x: radioX * Math.cos(angulo),
          y: radioY * Math.sin(angulo),
          haciaAfuera: Math.atan2(Math.sin(angulo) / radioY, Math.cos(angulo) / radioX),
        });
      }
    });
    return { posiciones, orden };
  }

  // Punto sobre el borde del círculo de un estado, en dirección a "hacia"
  function enBorde(centro, hacia, radio = R) {
    const dx = hacia.x - centro.x;
    const dy = hacia.y - centro.y;
    const largo = Math.hypot(dx, dy) || 1;
    return { x: centro.x + (dx / largo) * radio, y: centro.y + (dy / largo) * radio };
  }

  // Curva cuadrática de un estado a otro pasando cerca del punto de control c
  function curva(a, b, c) {
    const p0 = enBorde(a, c);
    const p2 = enBorde(b, c);
    return {
      d: `M${redondear(p0.x)} ${redondear(p0.y)} Q${redondear(c.x)} ${redondear(c.y)} ${redondear(p2.x)} ${redondear(p2.y)}`,
      medio: {
        x: 0.25 * p0.x + 0.5 * c.x + 0.25 * p2.x,
        y: 0.25 * p0.y + 0.5 * c.y + 0.25 * p2.y,
      },
    };
  }

  // Lazo (transición de un estado a sí mismo) que sale en la dirección "angulo"
  function lazo(centro, angulo) {
    const punto = (ang, distancia) => ({ x: centro.x + distancia * Math.cos(ang), y: centro.y + distancia * Math.sin(ang) });
    const p0 = punto(angulo - 0.38, R);
    const p2 = punto(angulo + 0.38, R);
    const c1 = punto(angulo - 0.62, R + 62);
    const c2 = punto(angulo + 0.62, R + 62);
    const tope = punto(angulo, ALTO_LAZO);
    const seno = Math.sin(angulo);
    const coseno = Math.cos(angulo);
    let lado = 'lado';
    if (seno < -0.5) lado = 'arriba';
    else if (seno > 0.5) lado = 'abajo';
    return {
      d: `M${redondear(p0.x)} ${redondear(p0.y)} C${redondear(c1.x)} ${redondear(c1.y)} ${redondear(c2.x)} ${redondear(c2.y)} ${redondear(p2.x)} ${redondear(p2.y)}`,
      etiqueta: lado === 'lado' ? { x: tope.x + coseno * 8, y: tope.y } : tope,
      lado,
      ancla: lado === 'lado' ? (coseno > 0 ? 'start' : 'end') : 'middle',
    };
  }

  // Estados en línea: flechas hacia la derecha por arriba y hacia la izquierda por abajo
  function formaEnLinea(origen, destino, posiciones, orden, hayInversa, alturaLazos) {
    const a = posiciones.get(origen);
    const b = posiciones.get(destino);
    if (origen === destino) return lazo(a, -Math.PI / 2);

    const i = orden.indexOf(origen);
    const j = orden.indexOf(destino);
    const distancia = Math.abs(j - i);
    const haciaDerecha = j > i;

    // vecinos sin flecha de regreso: línea recta
    if (distancia === 1 && !hayInversa) {
      const lado = haciaDerecha ? 1 : -1;
      const p0 = { x: a.x + lado * R, y: a.y };
      const p2 = { x: b.x - lado * R, y: b.y };
      return {
        d: `M${p0.x} ${p0.y} L${p2.x} ${p2.y}`,
        etiqueta: { x: (p0.x + p2.x) / 2, y: a.y - 2 },
        lado: 'arriba',
        ancla: 'middle',
      };
    }

    let altura;
    if (distancia === 1) {
      altura = 30;
    } else if (haciaDerecha) {
      // la curva pasa por encima de los lazos de los estados que salta
      altura = 62 + 42 * (distancia - 2);
      for (let k = Math.min(i, j) + 1; k < Math.max(i, j); k++) {
        if (alturaLazos.has(orden[k])) altura = Math.max(altura, alturaLazos.get(orden[k]) + 12);
      }
    } else {
      altura = 52 + 34 * (distancia - 1);
    }

    const signo = haciaDerecha ? -1 : 1; // arriba = y negativa
    const control = { x: (a.x + b.x) / 2, y: a.y + signo * 2 * altura };
    const { d, medio } = curva(a, b, control);
    return { d, etiqueta: medio, lado: haciaDerecha ? 'arriba' : 'abajo', ancla: 'middle' };
  }

  // Estados en círculo: curvas suaves; los lazos apuntan hacia afuera
  function formaEnCirculo(origen, destino, posiciones, hayInversa) {
    const a = posiciones.get(origen);
    const b = posiciones.get(destino);
    if (origen === destino) return lazo(a, a.haciaAfuera);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo = Math.hypot(dx, dy);
    const normal = { x: dy / largo, y: -dx / largo };
    const curvatura = largo * (hayInversa ? 0.2 : 0.09);
    const control = { x: (a.x + b.x) / 2 + normal.x * curvatura * 2, y: (a.y + b.y) / 2 + normal.y * curvatura * 2 };
    const { d, medio } = curva(a, b, control);

    let lado = 'lado';
    if (Math.abs(normal.y) >= Math.abs(normal.x)) lado = normal.y < 0 ? 'arriba' : 'abajo';
    return {
      d,
      etiqueta: { x: medio.x + normal.x * 6, y: medio.y + normal.y * 6 },
      lado,
      ancla: lado === 'lado' ? (normal.x > 0 ? 'start' : 'end') : 'middle',
    };
  }

  // Posición de la etiqueta número n de una flecha (se apilan si hay varias)
  function posicionEtiqueta(forma, n, total) {
    const { x, y } = forma.etiqueta;
    if (forma.lado === 'arriba') return { x, y: y - 8 - n * ALTO_LINEA };
    if (forma.lado === 'abajo') return { x, y: y + 17 + n * ALTO_LINEA };
    return { x, y: y + 5 + (n - (total - 1) / 2) * ALTO_LINEA };
  }

  // Ajusta el viewBox al dibujo, sin agrandar de más los diagramas pequeños
  function ajustarVista() {
    if (!capaContenido) return;
    const caja = capaContenido.getBBox();
    const margen = 22;
    const ancho = Math.max(caja.width + margen * 2, 600);
    const alto = Math.max(caja.height + margen * 2, 250);
    const x = caja.x + caja.width / 2 - ancho / 2;
    const y = caja.y + caja.height / 2 - alto / 2;
    svg.setAttribute('viewBox', `${redondear(x)} ${redondear(y)} ${redondear(ancho)} ${redondear(alto)}`);
  }

  function marcarEstado(estado, sit) {
    nodos.forEach((g) => g.classList.remove('actual', 'aceptado', 'rechazado'));
    const g = estado && nodos.get(estado);
    if (!g) return;
    g.classList.add('actual');
    if (sit === 'aceptada') g.classList.add('aceptado');
    if (sit === 'rechazada' || sit === 'fuera') g.classList.add('rechazado');

    // en pantallas angostas el diagrama se desliza: centra el estado actual
    const contenedor = svg.parentElement;
    if (contenedor.scrollWidth > contenedor.clientWidth) {
      const caja = contenedor.getBoundingClientRect();
      const nodo = g.getBoundingClientRect();
      const desplazamiento = nodo.left + nodo.width / 2 - caja.left - caja.width / 2;
      contenedor.scrollTo({ left: contenedor.scrollLeft + desplazamiento, behavior: 'smooth' });
    }
  }

  function resaltarTransicion(t) {
    aristas.forEach(({ camino, etiquetas }) => {
      camino.classList.remove('activa');
      camino.setAttribute('marker-end', 'url(#punta)');
      etiquetas.forEach((texto) => texto.classList.remove('activa'));
    });
    if (!t) return;
    const arista = aristas.get(claveArista(t.estado, t.nuevoEstado));
    if (!arista) return;
    arista.camino.classList.add('activa');
    arista.camino.setAttribute('marker-end', 'url(#punta-activa)');
    arista.camino.parentNode.appendChild(arista.camino); // la deja encima de las demás
    arista.etiquetas.get(claveDelta(t.estado, t.lee))?.classList.add('activa');
  }

  // Mueve una ficha brillante por la flecha de la transición
  function recorrerArista(t, duracion, sigueVigente) {
    const arista = aristas.get(claveArista(t.estado, t.nuevoEstado));
    if (!arista) return esperar(duracion);
    const camino = arista.camino;
    const largo = camino.getTotalLength();
    const ficha = crearSVG('circle', { class: 'd-ficha', r: 6.5 }, capaFicha);
    const inicio = performance.now();

    return new Promise((listo) => {
      function cuadro(ahora) {
        const avance = Math.min(1, (ahora - inicio) / duracion);
        const suave = avance < 0.5 ? 2 * avance * avance : 1 - Math.pow(-2 * avance + 2, 2) / 2;
        const punto = camino.getPointAtLength(suave * largo);
        ficha.setAttribute('cx', punto.x);
        ficha.setAttribute('cy', punto.y);
        if (avance < 1 && sigueVigente()) {
          requestAnimationFrame(cuadro);
        } else {
          ficha.remove();
          listo();
        }
      }
      requestAnimationFrame(cuadro);
    });
  }

  // =========================================================
  // Cinta: 50 celdas fijas (0 a 49); el cabezal se mueve encima
  // =========================================================
  const celdas = []; // índice → <span class="celda">
  let lupa;          // marco que recorre la cinta buscando la palabra

  function construirCinta() {
    tira.style.setProperty('--celdas', CELDAS);
    // el marco va antes de las celdas para no alterar :last-child de la última celda
    lupa = document.createElement('div');
    lupa.className = 'cinta-sim__lupa';
    lupa.setAttribute('aria-hidden', 'true');
    tira.insertBefore(lupa, tira.firstChild);
    for (let i = 0; i < CELDAS; i++) {
      const celda = document.createElement('span');
      celda.className = 'celda';
      celda.dataset.i = i;
      tira.appendChild(celda);
      celdas.push(celda);
    }
    pintarInfoCinta();
  }

  function pintarInfoCinta() {
    $('cinta-info').textContent = cintaDelModo2
      ? `${CELDAS} celdas (0 a ${CELDAS - 1}) · la misma cinta de la sesión del Modo 2`
      : `${CELDAS} celdas (0 a ${CELDAS - 1}) · relleno al azar con {${SIMBOLOS_ALEATORIOS.join(', ')}} · ` +
        `la palabra se busca de la celda ${BUSCAR_DESDE} a la ${BUSCAR_HASTA}`;
  }

  // Coloca el marco de búsqueda sobre las celdas desde..desde+largo-1
  function ponerLupa(desde, largo, clase) {
    if (!lupa) return;
    if (clase === null || largo <= 0) {
      lupa.className = 'cinta-sim__lupa';
      return;
    }
    tira.style.setProperty('--lupa-desde', desde);
    tira.style.setProperty('--lupa-largo', largo);
    lupa.className = `cinta-sim__lupa visible ${clase}`;
  }

  function pintarCinta(conf, celdaEscrita = null) {
    const seg = conf.fase === 'verificar' ? conf.segmento : null;
    celdas.forEach((celda, i) => {
      const simbolo = conf.cinta[i] ?? maquina.blanco;
      const ignorada = !esDeEntrada(conf, i);
      if (celda.textContent !== simbolo) celda.textContent = simbolo;
      celda.classList.toggle('blanco', !(i in conf.cinta));
      celda.classList.toggle('bajo-cabezal', i === conf.cabezal);
      celda.classList.toggle('de-palabra', Boolean(seg) && i >= seg.desde && i <= seg.hasta);
      celda.classList.toggle('ignorada', ignorada);
      celda.title = ignorada ? 'Fuera de la palabra encontrada: la máquina la lee como B' : '';
    });

    // el marco queda sobre la palabra encontrada
    if (seg) ponerLupa(seg.desde, seg.hasta - seg.desde + 1, 'encontrada');
    else ponerLupa(0, 0, null);

    tira.style.setProperty('--cabezal', conf.cabezal);
    if (celdaEscrita !== null) reiniciarAnimacion(celdas[celdaEscrita], 'escrita');
    seguirCabezal(conf.cabezal);
  }

  // En pantallas angostas la cinta se desliza de lado: mantiene visible el cabezal
  function seguirCabezal(i) {
    if (ventanaCinta.scrollWidth <= ventanaCinta.clientWidth) return;
    const celda = celdas[i];
    const centro = tira.offsetLeft + celda.offsetLeft + celda.offsetWidth / 2;
    ventanaCinta.scrollTo({ left: centro - ventanaCinta.clientWidth / 2, behavior: 'smooth' });
  }

  // El cabezal "choca" con la orilla cuando intenta salir de la cinta
  function chocarCabezal(lado) {
    cabezal.style.setProperty('--choque', lado === 'izquierda' ? -1 : 1);
    reiniciarAnimacion(cabezal, 'choque');
  }

  // Vuelve a lanzar una animación CSS aunque el elemento ya la tuviera
  function reiniciarAnimacion(elemento, clase) {
    if (!elemento) return;
    elemento.classList.remove(clase);
    void elemento.offsetWidth;
    elemento.classList.add(clase);
  }

  // Duración de las transiciones CSS de la cinta según la duración del paso
  function ajustarTiempos(duracionPaso) {
    raiz.style.setProperty('--t-mover', `${Math.round(duracionPaso * 0.42)}ms`);
    raiz.style.setProperty('--t-escribir', `${Math.round(Math.max(duracionPaso * 0.3, 150))}ms`);
  }

  // =========================================================
  // Paneles de información
  // =========================================================
  const filasDelta = new Map(); // δ → <tr>

  function construirTabla() {
    const posicion = (lista, valor) => lista.indexOf(valor);
    const ordenadas = [...maquina.transiciones].sort((a, b) =>
      posicion(maquina.estados, a.estado) - posicion(maquina.estados, b.estado) ||
      posicion(maquina.alfabetoCinta, a.lee) - posicion(maquina.alfabetoCinta, b.lee));

    cuerpoTabla.textContent = '';
    filasDelta.clear();
    let estadoAnterior = null;

    ordenadas.forEach((t) => {
      const fila = document.createElement('tr');
      if (estadoAnterior !== null && estadoAnterior !== t.estado) fila.classList.add('nuevo-grupo');
      estadoAnterior = t.estado;
      fila.innerHTML =
        `<td>δ(${estadoHTML(t.estado)}, ${escapar(t.lee)})</td>` +
        '<td>=</td>' +
        `<td>(${estadoHTML(t.nuevoEstado)}, ${escapar(t.escribe)}, ${escapar(t.mueve)})</td>`;
      cuerpoTabla.appendChild(fila);
      filasDelta.set(claveDelta(t.estado, t.lee), fila);
    });

    if (ordenadas.length === 0) {
      cuerpoTabla.innerHTML = '<tr><td>La máquina no tiene transiciones.</td></tr>';
    }
  }

  function marcarFila(t, clase) {
    filasDelta.forEach((fila) => fila.classList.remove('proxima', 'aplicando'));
    if (!t) return;
    const fila = filasDelta.get(claveDelta(t.estado, t.lee));
    if (!fila) return;
    fila.classList.add(clase);
    mantenerVisible(panelDelta, fila);
  }

  // Desplaza un panel con scroll para que se vea el elemento (sin mover la página)
  function mantenerVisible(contenedor, elemento) {
    if (contenedor.hidden) return;
    const caja = contenedor.getBoundingClientRect();
    const fila = elemento.getBoundingClientRect();
    if (fila.top < caja.top) contenedor.scrollTop -= caja.top - fila.top + 6;
    else if (fila.bottom > caja.bottom) contenedor.scrollTop += fila.bottom - caja.bottom + 6;
  }

  function pintarDefinicion() {
    const conjunto = (lista, formato = escapar) => `{${lista.map(formato).join(', ')}}`;
    const sep = '<span class="sep">·</span>';
    $('definicion-formal').innerHTML =
      `Q = ${conjunto(maquina.estados, estadoHTML)}${sep}` +
      `Σ = ${conjunto(maquina.alfabetoEntrada)}${sep}` +
      `Γ = ${conjunto(maquina.alfabetoCinta)}${sep}` +
      `F = ${conjunto(maquina.estadosFinales, estadoHTML)}`;
  }

  // Qué se muestra en "Resultado": además de la situación de la máquina,
  // distingue cuando la ejecución automática está en pausa.
  function claveResultado(sit) {
    if (sit === 'lista' || sit === 'ejecutando') {
      if (reproduciendo) return 'ejecutando';
      if (sit === 'ejecutando' && modo === 'automatico') return 'pausa';
    }
    return sit;
  }

  function pintarResultado() {
    const conf = historial[actual];
    const clave = claveResultado(situacion(conf));
    const resultado = $('dato-resultado');
    resultado.textContent = conf.fase === 'no-encontrada'
      ? `${TEXTO_SITUACION.rechazada} · no está en la cinta`
      : TEXTO_SITUACION[clave];
    resultado.dataset.situacion = clave;
  }

  function pintarDatos(conf, sit) {
    $('dato-estado').innerHTML = estadoHTML(conf.estado);
    $('dato-simbolo').textContent = leer(conf);
    $('dato-posicion').textContent = conf.cabezal;
    $('dato-pasos').textContent = conf.pasos;
    pintarResultado();

    insignia.hidden = !TEXTO_INSIGNIA[sit];
    insignia.textContent = conf.fase === 'no-encontrada'
      ? 'Rechazada · no está en la cinta'
      : TEXTO_INSIGNIA[sit] || '';
    insignia.dataset.situacion = sit;
  }

  function deltaHTML(t) {
    return `δ(${estadoHTML(t.estado)}, ${escapar(t.lee)}) = (${estadoHTML(t.nuevoEstado)}, ${escapar(t.escribe)}, ${escapar(t.mueve)})`;
  }

  function pintarExplicacion(conf, sit) {
    const t = conf.transicion;
    const q = estadoHTML(conf.estado);
    let titulo;
    let texto;

    const w = escapar(maquina.palabra.join('') || 'ε');
    const q0 = estadoHTML(maquina.estadoInicial);

    if (conf.fase === 'buscar') {
      titulo = 'Configuración inicial';
      texto = cintaDelModo2
        ? 'Es la misma cinta con la que empezó la sesión del Modo 2. '
        : `La cinta se llenó al azar con {${SIMBOLOS_ALEATORIOS.map(escapar).join(', ')}}. `;
      texto += `La palabra ${w} no se escribe en la cinta: al ejecutar, la máquina la busca de la celda ` +
        `${BUSCAR_DESDE} a la ${BUSCAR_HASTA}. Si no aparece, se rechaza; si aparece, ${q0} empieza sobre ella ` +
        'y δ decide si se acepta.';
    } else if (conf.fase === 'no-encontrada') {
      titulo = `Búsqueda · ${w} no está en la cinta`;
      texto = maquina.palabra.length > BUSCAR_HASTA - BUSCAR_DESDE + 1
        ? `La palabra tiene ${maquina.palabra.length} símbolos y la búsqueda solo abarca ` +
          `${BUSCAR_HASTA - BUSCAR_DESDE + 1} celdas (de la ${BUSCAR_DESDE} a la ${BUSCAR_HASTA}): no puede estar en la cinta.`
        : `Se revisó la cinta de la celda ${BUSCAR_DESDE} a la ${BUSCAR_HASTA} y ${w} no aparece en ninguna parte.`;
      texto += ' La palabra es <strong>rechazada</strong>. Con «Nueva cinta aleatoria» se prueba con otra cinta.';
    } else if (!t) {
      const { desde, hasta } = conf.segmento;
      titulo = maquina.palabra.length
        ? `Búsqueda · ${w} encontrada en las celdas ${desde} a ${hasta}`
        : 'Búsqueda · la palabra vacía ε';
      texto = maquina.palabra.length
        ? `La palabra ${w} está en la cinta, de la celda ${desde} a la ${hasta}. La máquina la toma como su ` +
          'entrada: lo que está fuera de esas celdas no es parte de la palabra y lo lee como blanco B. '
        : 'La palabra vacía ε siempre está en la cinta: la máquina no tiene símbolos de entrada y todo lo lee como blanco B. ';
      texto += `Comienza en ${q0} con el cabezal en la celda ${desde}.`;
    } else {
      const movimiento = conf.salio
        ? `intentó mover el cabezal a la ${conf.salio}`
        : TEXTO_MOVIMIENTO[t.mueve];
      titulo = `Paso ${conf.pasos} · ${deltaHTML(t)}`;
      texto = `Estaba en ${estadoHTML(t.estado)} y leyó ${escapar(t.lee)}: escribió ${escapar(t.escribe)}, ` +
        `${movimiento} y pasó a ${estadoHTML(t.nuevoEstado)}.`;
    }

    if (sit === 'fuera') {
      texto += ` Desde la celda ${conf.cabezal} ya no hay cinta (solo existen las celdas 0 a ${CELDAS - 1}): ` +
        'la máquina se <strong>detiene</strong>.';
    } else if (sit === 'aceptada') {
      texto += ` ${q} es un estado final: la palabra es <strong>aceptada</strong>.`;
    } else if (sit === 'rechazada' && conf.fase === 'verificar') {
      texto += ` No existe δ(${q}, ${escapar(leer(conf))}) y ${q} no es final: la palabra es <strong>rechazada</strong>.`;
    } else if (sit === 'limite') {
      texto += ` Se alcanzaron ${MAX_PASOS} pasos; es posible que la máquina nunca se detenga.`;
    }

    $('explicacion-titulo').innerHTML = titulo;
    $('explicacion-texto').innerHTML = texto;

    const proxima = proximaTransicion(conf);
    let siguiente = '';
    if (conf.fase === 'buscar') siguiente = `Siguiente: buscar ${w} en la cinta`;
    else if (proxima) siguiente = `Siguiente: ${deltaHTML(proxima)}`;
    $('explicacion-proximo').innerHTML = siguiente;
  }

  // ---------- Historial: la terna (Estado, Contenido, Posición) de cada paso ----------
  // La primera fila es la búsqueda de la palabra en la cinta. Después, cada
  // paso de δ con su terna:
  // Contenido = lo que la máquina ve de la cinta: desde la palabra encontrada
  // (o el cabezal, si se fue a la izquierda) hasta el blanco que la cierra o la
  // celda más lejana a la que llegó el cabezal. Lo que está fuera de la
  // palabra la máquina lo lee como B.
  // Posición = número de la celda del cabezal (0 a 49), el mismo que se ve en la cinta.
  function contenidoCinta(conf) {
    const desde = Math.min(conf.cabezal, conf.segmento.desde);
    const hasta = Math.max(conf.cabezal, conf.alcance);
    let texto = '';
    let html = '';
    for (let i = desde; i <= hasta; i++) {
      const simbolo = esDeEntrada(conf, i) ? simboloEn(conf.cinta, i) : maquina.blanco;
      texto += simbolo;
      html += i === conf.cabezal
        ? `<mark class="historial__cabezal">${escapar(simbolo)}</mark>`
        : escapar(simbolo);
    }
    return { texto, html };
  }

  function filaHistorial(n) {
    const conf = historial[n];
    const fila = document.createElement('tr');
    const w = escapar(maquina.palabra.join('') || 'ε');

    if (conf.fase !== 'verificar') {
      let nota = `buscar ${w} en la cinta`;
      if (conf.fase === 'no-encontrada') nota = `${w} no está en la cinta`;
      fila.innerHTML =
        '<td class="historial__paso">—</td>' +
        `<td class="historial__nota" colspan="3">${nota}</td>`;
      fila.title = conf.fase === 'no-encontrada' ? `${maquina.palabra.join('') || 'ε'} no está en la cinta` : '';
      return fila;
    }

    const { texto, html } = contenidoCinta(conf);
    fila.innerHTML =
      `<td class="historial__paso">${conf.pasos}</td>` +
      `<td class="historial__estado">${estadoHTML(conf.estado)}</td>` +
      `<td class="historial__contenido">${html}</td>` +
      `<td class="historial__posicion">${conf.cabezal}</td>`;
    fila.title = `(${conf.estado}, ${texto}, ${conf.cabezal})`;
    return fila;
  }

  function sincronizarHistorial() {
    // quita lo que sobra (al retroceder) y agrega lo que falta (al avanzar)
    while (cuerpoHistorial.children.length > actual + 1) cuerpoHistorial.lastElementChild.remove();
    while (cuerpoHistorial.children.length < actual + 1) {
      cuerpoHistorial.appendChild(filaHistorial(cuerpoHistorial.children.length));
    }
    cuerpoHistorial.querySelector('.actual')?.classList.remove('actual');
    cuerpoHistorial.lastElementChild?.classList.add('actual');
    if (!panelHistorial.hidden) panelHistorial.scrollTop = panelHistorial.scrollHeight;
  }

  function pintarControles() {
    const fin = estaDetenida(historial[actual]);
    // Si en el campo hay una palabra distinta de la que se está usando,
    // «Siguiente» sigue activo aunque la ejecución anterior haya terminado:
    // al presionarlo se toma la palabra del campo y se empieza a buscarla.
    const palabraNueva = campoPendiente();
    btnAnterior.disabled = actual === 0;
    btnSiguiente.disabled = fin && !palabraNueva;

    let icono = 'play';
    let texto = 'Ejecutar';
    if (reproduciendo) {
      icono = 'pausa';
      texto = 'Pausar';
    } else if (palabraNueva) {
      texto = 'Ejecutar'; // palabra nueva en el campo: se ejecuta desde el inicio
    } else if (fin) {
      icono = 'repetir';
      texto = 'Repetir';
    } else if (actual > 0) {
      texto = 'Reanudar'; // se pausó a la mitad: continúa desde aquí
    }
    btnEjecutar.dataset.icono = icono;
    textoEjecutar.textContent = texto;
    btnEjecutar.title = `${texto} (Espacio)`;
  }

  // Dibuja todo según la configuración actual
  function pintarTodo() {
    const conf = historial[actual];
    const sit = situacion(conf);
    pintarCinta(conf);
    cabezalEstado.innerHTML = estadoHTML(conf.estado);
    cabezal.dataset.situacion = sit;
    resaltarTransicion(null);
    marcarEstado(conf.estado, sit);
    marcarFila(estaDetenida(conf) ? null : transicionPara(conf), 'proxima');
    pintarDatos(conf, sit);
    pintarExplicacion(conf, sit);
    sincronizarHistorial();
    pintarControles();
  }

  // =========================================================
  // Animación de un paso
  // =========================================================
  async function animarPaso(desde, hacia, duracion) {
    const miGeneracion = generacion;
    const sigueVigente = () => miGeneracion === generacion;
    const t = hacia.transicion;
    ajustarTiempos(duracion);

    // 1. Leer
    resaltarTransicion(t);
    marcarFila(t, 'aplicando');
    reiniciarAnimacion(celdas[desde.cabezal], 'leyendo');
    await esperar(duracion * 0.22);
    if (!sigueVigente()) return false;

    // 2. Escribir (el cabezal todavía no se mueve)
    pintarCinta({ ...hacia, cabezal: desde.cabezal }, desde.cabezal);
    await esperar(duracion * 0.24);
    if (!sigueVigente()) return false;

    // 3. Mover el cabezal y recorrer la flecha hacia el nuevo estado
    marcarEstado(null);
    pintarCinta(hacia);
    if (hacia.salio) chocarCabezal(hacia.salio);
    await recorrerArista(t, duracion * 0.42, sigueVigente);
    if (!sigueVigente()) return false;

    // 4. Llegar
    await esperar(duracion * 0.08);
    return sigueVigente();
  }

  // Búsqueda: un marco del largo de la palabra recorre la cinta celda por
  // celda (con el cabezal encima) hasta encontrarla o llegar al final.
  async function animarBusqueda(desde, hacia, duracion) {
    const miGeneracion = generacion;
    const sigueVigente = () => miGeneracion === generacion;
    const n = maquina.palabra.length;
    const w = escapar(maquina.palabra.join('') || 'ε');
    const porCelda = Math.round(Math.min(120, Math.max(35, duracion * 0.1)));
    const hasta = hacia.fase === 'verificar' ? hacia.segmento.desde : ultimoInicio();

    raiz.style.setProperty('--t-mover', `${porCelda}ms`);
    raiz.style.setProperty('--t-lupa', `${porCelda}ms`);
    $('explicacion-titulo').innerHTML = `Buscando ${w} en la cinta…`;
    $('explicacion-texto').innerHTML = `El marco recorre la cinta de la celda ${BUSCAR_DESDE} a la ${BUSCAR_HASTA} ` +
      `y compara ${n === 1 ? 'el símbolo' : `los ${n} símbolos`} de la palabra en cada posición.`;
    $('explicacion-proximo').innerHTML = '';

    if (n > 0 && hasta >= BUSCAR_DESDE) {
      for (let p = BUSCAR_DESDE; p <= hasta; p++) {
        ponerLupa(p, n, 'buscando');
        tira.style.setProperty('--cabezal', p);
        $('dato-posicion').textContent = p;
        $('dato-simbolo').textContent = simboloEn(desde.cinta, p);
        if (p % 6 === 0 || p === hasta) seguirCabezal(p);
        await esperar(porCelda);
        if (!sigueVigente()) return false;
      }
    }

    // Resultado de la búsqueda
    if (hacia.fase === 'verificar') {
      pintarCinta(hacia);
      if (n > 0) reiniciarAnimacion(lupa, 'hallazgo');
    } else if (n > 0 && hasta >= BUSCAR_DESDE) {
      ponerLupa(hasta, n, 'no-encontrada');
    }
    await esperar(Math.max(650, duracion * 0.6));
    return sigueVigente();
  }

  async function darPaso(duracion) {
    if (animando) return;
    const desde = historial[actual];
    if (estaDetenida(desde)) return;

    // si se retrocedió antes, el paso ya está calculado en el historial
    if (actual === historial.length - 1) historial.push(avanzar(desde));
    const hacia = historial[actual + 1];

    animando = true;
    pintarControles();
    const completo = desde.fase === 'buscar'
      ? await animarBusqueda(desde, hacia, duracion)
      : await animarPaso(desde, hacia, duracion);
    if (!completo) return; // se reinició a mitad del paso

    animando = false;
    actual += 1;
    pintarTodo();

    if (situacion(hacia) === 'fuera') {
      mostrarAviso(`El cabezal intentó salir de la cinta por la ${hacia.salio}: la cinta solo tiene ${CELDAS} celdas.`, true);
    }

    if (pasoPendiente) {
      pasoPendiente = false;
      siguiente();
    }
  }

  async function reproducir() {
    if (reproduciendo) return;
    if (!palabraDelCampoAplicada()) return;
    if (estaDetenida(historial[actual])) {
      reiniciar();
      await esperar(350);
    }
    reproduciendo = true;
    pintarControles();
    pintarResultado();
    const miGeneracion = generacion;

    while (reproduciendo && miGeneracion === generacion && !estaDetenida(historial[actual])) {
      if (animando) {
        await esperar(60); // termina primero un paso que ya estaba en marcha
        continue;
      }
      await darPaso(msPorPaso); // se lee en cada paso: el cambio de velocidad aplica de inmediato
    }

    if (miGeneracion === generacion) {
      reproduciendo = false;
      pintarControles();
      pintarResultado();
    }
  }

  function pausar() {
    reproduciendo = false;
    pintarControles();
    pintarResultado();
  }

  function siguiente() {
    if (reproduciendo) return;
    if (!palabraDelCampoAplicada()) return;
    if (animando) {
      pasoPendiente = true; // se da en cuanto termine el paso actual
      return;
    }
    darPaso(modo === 'pasos' ? DURACION_PASO_A_PASO : msPorPaso);
  }

  function anterior() {
    pasoPendiente = false;
    if (animando || reproduciendo || actual === 0) return;
    actual -= 1;
    ajustarTiempos(700);
    pintarTodo();
  }

  function reiniciar() {
    generacion += 1; // cancela cualquier animación en curso
    reproduciendo = false;
    animando = false;
    pasoPendiente = false;
    capaFicha.textContent = '';
    cabezal.classList.remove('choque');
    historial = [configuracionInicial()];
    actual = 0;
    cuerpoHistorial.textContent = '';
    ajustarTiempos(700);
    pintarTodo();
  }

  // ---------- Tiempo por paso (ms) ----------
  // El control deslizante y el campo numérico se mantienen iguales.
  function ponerMs(valor) {
    let ms = Math.round(Number(valor));
    if (!Number.isFinite(ms)) ms = msPorPaso;
    ms = Math.min(MS_MAX, Math.max(MS_MIN, ms));
    msPorPaso = ms;
    velocidad.value = ms;
    velocidadMs.value = ms;
  }

  // =========================================================
  // Forma de ejecución, pestañas y palabra de entrada
  // =========================================================
  function ponerModo(nuevoModo) {
    modo = nuevoModo === 'pasos' ? 'pasos' : 'automatico';
    raiz.dataset.modo = modo;
    document.title = `${modo === 'pasos' ? 'Paso a paso' : 'Ejecución automática'} · Máquina de Turing`;
    document.querySelectorAll('.selector-modo__opcion').forEach((boton) => {
      boton.setAttribute('aria-pressed', String(boton.dataset.modo === modo));
    });

    try {
      history.replaceState(null, '', `?modo=${modo}`);
    } catch (e) { /* algunos navegadores no lo permiten al abrir el archivo directo */ }

    if (modo === 'pasos') pausar();
    if (historial.length) pintarTodo();
  }

  function mostrarPestana(nombre) {
    document.querySelectorAll('.pestanas__boton').forEach((boton) => {
      boton.setAttribute('aria-selected', String(boton.dataset.pestana === nombre));
    });
    panelHistorial.hidden = nombre !== 'historial';
    panelDelta.hidden = nombre !== 'delta';
    if (nombre === 'historial') panelHistorial.scrollTop = panelHistorial.scrollHeight;
    else marcarFila(estaDetenida(historial[actual]) ? null : transicionPara(historial[actual]), 'proxima');
  }

  // "0011" → ['0','0','1','1'];  "a b c" o "a,b,c" → ['a','b','c']
  function separarPalabra(texto) {
    const limpio = texto.trim();
    if (!limpio || limpio === 'ε') return [];
    if (/[\s,]/.test(limpio)) return limpio.split(/[\s,]+/).filter(Boolean);
    return [...limpio];
  }

  // Revisa una palabra con la misma revisión del formulario (solo símbolos
  // de Σ, máximo 49). Devuelve { palabra } si es válida o { error } si no.
  function revisarPalabra(texto) {
    const simbolos = separarPalabra(texto);
    const { maquina: revisada, errores } = MT.validar({ ...maquina, palabra: simbolos });
    if (errores.length) {
      const error = errores.find((e) => e.campo === 'palabra') || errores[0];
      return { error: error.mensaje };
    }
    return { palabra: revisada.palabra };
  }

  // Toma la palabra del campo para la siguiente ejecución. La palabra NO se
  // escribe en la cinta y la cinta no cambia: así se pueden probar varias
  // palabras sobre la misma cinta al azar. La máquina vuelve a su
  // configuración inicial (se borra lo que escribió la ejecución anterior,
  // como X o Y, y el resultado anterior).
  // Devuelve false si la palabra no es válida.
  function cambiarPalabra(texto, { silencioso = false } = {}) {
    const { palabra, error } = revisarPalabra(texto);
    if (error) {
      marcarCampoPendiente(error);
      if (!silencioso) mostrarAviso(error, true);
      return false;
    }
    maquina.palabra = palabra;
    MT.guardarEnSesion(maquina);
    reiniciar();
    marcarCampoPendiente();
    return true;
  }

  // En cuanto se escribe en el campo, esa es la palabra que se va a buscar
  function palabraEnVivo() {
    if (campoPendiente()) cambiarPalabra(campoPalabra.value, { silencioso: true });
    else marcarCampoPendiente();
  }

  // ¿La palabra del campo es distinta de la que se está usando?
  const palabraDelCampo = () => separarPalabra(campoPalabra.value);
  const campoPendiente = () => palabraDelCampo().join('\u0001') !== maquina.palabra.join('\u0001');

  function marcarCampoPendiente(error = '') {
    const pendiente = campoPendiente();
    const invalida = pendiente && Boolean(error);
    campoPalabra.classList.toggle('invalida', invalida);
    campoPalabra.setAttribute('aria-invalid', String(invalida));
    campoPalabra.title = invalida ? error : '';
    if (historial.length) pintarControles();
  }

  // La palabra que se busca es siempre la que se ve en el campo
  function palabraDelCampoAplicada() {
    return campoPendiente() ? cambiarPalabra(campoPalabra.value) : true;
  }

  function nuevaCintaAleatoria() {
    if (campoPendiente() && !cambiarPalabra(campoPalabra.value)) return;
    generarCintaAleatoria();
    pintarInfoCinta();
    reiniciar();
    mostrarAviso(`Se generó una cinta nueva al azar; se buscará ${maquina.palabra.join('') || 'ε'} en ella.`);
  }

  // =========================================================
  // Arranque
  // =========================================================
  $('nombre-maquina').textContent = maquina.nombre || 'Máquina de Turing';
  campoPalabra.value = maquina.palabra.join('');
  // La cinta empieza al azar (o con la cinta exacta que mandó el Modo 2)
  if (!usarCintaDelModo2()) generarCintaAleatoria();
  construirCinta();
  pintarDefinicion();
  construirTabla();
  dibujarDiagrama();
  ponerMs(velocidad.value);

  const modoInicial = new URLSearchParams(window.location.search).get('modo');
  historial = [configuracionInicial()];
  ponerModo(modoInicial);
  reiniciar();

  // con la fuente ya cargada, los textos del diagrama miden distinto
  if (document.fonts) document.fonts.ready.then(ajustarVista);

  // ---------- Eventos ----------
  btnReiniciar.addEventListener('click', reiniciar);
  btnAnterior.addEventListener('click', anterior);
  btnSiguiente.addEventListener('click', siguiente);
  btnEjecutar.addEventListener('click', () => (reproduciendo ? pausar() : reproducir()));

  velocidad.addEventListener('input', () => ponerMs(velocidad.value));
  velocidadMs.addEventListener('change', () => ponerMs(velocidadMs.value));
  velocidadMs.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      ponerMs(velocidadMs.value);
      velocidadMs.blur();
    }
  });

  cabezal.addEventListener('animationend', () => cabezal.classList.remove('choque'));

  document.querySelectorAll('.selector-modo__opcion').forEach((boton) => {
    boton.addEventListener('click', () => ponerModo(boton.dataset.modo));
  });

  document.querySelectorAll('.pestanas__boton').forEach((boton) => {
    boton.addEventListener('click', () => mostrarPestana(boton.dataset.pestana));
  });

  // Enter en el campo: busca la palabra (como «Ejecutar» o «Siguiente»)
  formPalabra.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (!palabraDelCampoAplicada()) return;
    campoPalabra.blur();
    if (modo === 'pasos') siguiente();
    else if (!reproduciendo) reproducir();
  });

  campoPalabra.addEventListener('input', palabraEnVivo);
  $('btn-aleatoria').addEventListener('click', nuevaCintaAleatoria);

  // Atajos: → siguiente, ← anterior, Espacio ejecutar/pausar (o siguiente), R reiniciar
  document.addEventListener('keydown', (evento) => {
    if (evento.target.closest('input, textarea, select')) return;
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return;

    if (evento.key === 'ArrowRight') {
      evento.preventDefault();
      siguiente();
    } else if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      anterior();
    } else if (evento.key === ' ' && !evento.target.closest('button')) {
      evento.preventDefault();
      if (modo === 'pasos') siguiente();
      else if (reproduciendo) pausar();
      else reproducir();
    } else if (evento.key === 'r' || evento.key === 'R') {
      reiniciar();
    }
  });
});
