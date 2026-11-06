// =========================================================
// Simulador · Máquina de Turing — Modo 2: ejecución manual (sandbox)
// =========================================================
//
// Aquí el usuario hace el papel de la función δ. En cada paso el
// cabezal lee la celda y se despliegan las opciones:
//   1. ¿Cambiar el símbolo o continuar sin cambios?  (símbolos de Γ)
//   2. Estado siguiente                               (estados de Q)
//   3. Mover y aplicar: D (derecha), I (izquierda) o S (no se mueve:
//      estado de paro, la ejecución termina)
// La ejecución también termina al llegar al estado final.
//
// Cada paso queda en el registro y se convierte en una transición δ.
// Con ellas se arma una configuración que se descarga o se abre
// directamente en el Modo 1 (ejecución automática).
//
// Lee la sesión que guardó manual.js (MANUAL.leerSesion). Si no hay
// una configuración válida regresa a la pantalla de preparación.
//
// Cada paso se anima igual que en el Modo 1:
//   1. Leer      → se ilumina la celda bajo el cabezal
//   2. Escribir  → aparece el símbolo elegido en la celda
//   3. Mover     → el cabezal se desplaza y una ficha recorre la flecha del diagrama
//   4. Llegar    → queda marcado el nuevo estado

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Ajustes ----------
  const DURACION_PASO = 900; // ms que dura la animación de cada paso
  const PANTALLA_PREPARACION = '../manual.html?aviso=sin-configuracion';
  const PANTALLA_MODO1 = '../../modo1/Simulacion/simulacion.html?modo=automatico';

  const { BLANCO, CELDAS, INICIO, escapar, estadoHTML, clave } = MANUAL;

  const TEXTO_MOVIMIENTO = {
    D: 'movió el cabezal a la derecha',
    I: 'movió el cabezal a la izquierda',
    S: 'no movió el cabezal (S: estado de paro)',
  };
  const RESULTADO = {
    lista: { texto: 'Lista para iniciar', clase: 'lista' },
    activa: { texto: 'En ejecución', clase: 'ejecutando' },
    final: { texto: 'Estado final alcanzado', clase: 'aceptada' },
    paro: { texto: 'Detenida (paro)', clase: 'fuera' },
  };
  const INSIGNIA = {
    final: { texto: 'Llegó al estado final', clase: 'aceptada' },
    paro: { texto: 'Detenida con S', clase: 'fuera' },
  };

  // ---------- Cargar la sesión ----------
  const sesion = MANUAL.leerSesion();
  if (!sesion) {
    window.location.replace(PANTALLA_PREPARACION);
    return;
  }

  // ---------- Elementos de la página ----------
  const $ = (id) => document.getElementById(id);
  const raiz = document.querySelector('.sim');
  const svg = $('diagrama');
  const ventanaCinta = $('ventana-cinta');
  const tira = $('tira');
  const cabezal = $('cabezal');
  const cabezalEstado = $('cabezal-estado');
  const marcaSegmento = $('marca-segmento');
  const insignia = $('insignia');
  const panelDecision = $('panel-decision');
  const lecturaSimbolo = $('lectura-simbolo');
  const opcionesCambio = $('opciones-cambio');
  const porCual = $('por-cual');
  const fichasSimbolo = $('fichas-simbolo');
  const fichasEstado = $('fichas-estado');
  const botonesMov = [...document.querySelectorAll('.mov')];
  const vistaPrevia = $('vista-previa');
  const listaRegistro = $('registro');
  const cuerpoDelta = $('tabla-delta');
  const listaGrabadas = $('grabadas');
  const paneles = {
    registro: $('pestana-registro'),
    delta: $('pestana-delta'),
    grabadas: $('pestana-grabadas'),
  };
  const btnDeshacer = $('btn-deshacer');
  const btnReiniciar = $('btn-reiniciar');
  const btnJSON = $('btn-json');
  const btnModo1 = $('btn-modo1');
  const btnTXT = $('btn-txt');
  const aviso = $('aviso');

  // ---------- Estado de la ejecución ----------
  let confs = [];               // configuración inicial y una por paso (MANUAL.recorrer)
  let mapaReglas = new Map();   // reglas δ que salen de los pasos (MANUAL.reglas)
  // Respuestas del paso: cambiar (¿cambia el símbolo?), simbolo (por cuál;
  // null = continuar sin cambios o aún sin elegir) y estado (al que pasa)
  let eleccion = { cambiar: false, simbolo: null, estado: '' };
  let animando = false;
  let generacion = 0;           // cambia al deshacer o reiniciar; cancela animaciones
  let movimientoVista = null;   // movimiento bajo el mouse (vista previa)
  let exportacion = null;       // última configuración armada para el Modo 1
  let grabadaNueva = null;      // id de la última cinta grabada (se resalta)

  // Diagrama: 'pasos' (se arma con cada paso) o 'final' (se genera al terminar)
  const CLAVE_VISTA = 'mt-sandbox-vista-diagrama';
  let vistaDiagrama = 'pasos';
  try {
    if (localStorage.getItem(CLAVE_VISTA) === 'final') vistaDiagrama = 'final';
  } catch (e) { /* sin localStorage queda «paso a paso» */ }
  let generadoManual = false;   // «Generar ahora» antes de terminar

  // ---------- Utilidades ----------
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));
  const actual = () => confs[confs.length - 1];
  const leido = () => actual().cinta[actual().cabezal];
  const situacion = () => MANUAL.situacion(sesion, confs);
  const terminada = () => ['final', 'paro'].includes(situacion());
  const reglaDe = (estado, simbolo) => mapaReglas.get(clave(estado, simbolo)) || null;
  const claveArista = (origen, destino) => `${origen}\u0001${destino}`;
  const claveAccion = (t) => [t.estado, t.lee, t.nuevoEstado, t.escribe, t.mueve].join('\u0001');
  const redondear = (n) => Math.round(n * 10) / 10;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  function deltaHTML(estado, lee, a) {
    return `δ(${estadoHTML(estado)}, ${escapar(lee)}) = (${estadoHTML(a.nuevoEstado)}, ${escapar(a.escribe)}, ${escapar(a.mueve)})`;
  }

  function recalcular() {
    confs = MANUAL.recorrer(sesion);
    mapaReglas = MANUAL.reglas(confs);
  }

  function guardar() {
    if (!MANUAL.guardarSesion(sesion)) {
      mostrarAviso('El navegador no guarda la sesión: se pierde al recargar.', true);
    }
  }

  // Opciones con las que empieza cada paso: las de la regla que ya
  // registraste para (estado, símbolo) o "sin cambios" y el mismo estado
  function eleccionPorDefecto() {
    const conf = actual();
    const regla = reglaDe(conf.estado, leido());
    const a = regla ? regla.acciones[0] : null;
    const simbolo = a && a.escribe !== leido() ? a.escribe : null;
    eleccion = {
      cambiar: simbolo !== null,
      simbolo,
      estado: a ? a.nuevoEstado : conf.estado,
    };
  }

  // Eligió «Cambiar el símbolo» pero todavía no dijo por cuál
  const faltaSimbolo = () => eleccion.cambiar && eleccion.simbolo === null;

  let temporizadorAviso;
  function mostrarAviso(texto, esError = false) {
    aviso.textContent = texto;
    aviso.classList.toggle('error', esError);
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), esError ? 6500 : 4500);
  }

  // Vuelve a lanzar una animación CSS aunque el elemento ya la tuviera
  function reiniciarAnimacion(elemento, clase) {
    if (!elemento) return;
    elemento.classList.remove(clase);
    void elemento.offsetWidth;
    elemento.classList.add(clase);
  }

  // Duración de las transiciones CSS de la cinta (las usa simulacion.css)
  function ajustarTiempos(duracionPaso) {
    raiz.style.setProperty('--t-mover', `${Math.round(duracionPaso * 0.42)}ms`);
    raiz.style.setProperty('--t-escribir', `${Math.round(Math.max(duracionPaso * 0.3, 150))}ms`);
  }

  // =========================================================
  // Diagrama de estados (SVG) — el mismo dibujo del Modo 1,
  // con las transiciones que vas creando
  // =========================================================
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const R = 30;            // radio de cada estado
  const SEPARACION = 165;  // distancia entre estados cuando van en línea
  const ALTO_LINEA = 16;   // separación entre etiquetas apiladas
  const ALTO_LAZO = 63;    // qué tan arriba llega un lazo desde el centro del estado

  const nodos = new Map();   // estado → <g>
  const aristas = new Map(); // 'origen→destino' → { camino, etiquetas: Map(acción → <text>) }
  let capaContenido;
  let capaFicha;

  function crearSVG(tipo, atributos = {}, padre = null) {
    const elemento = document.createElementNS(SVG_NS, tipo);
    Object.entries(atributos).forEach(([nombre, valor]) => elemento.setAttribute(nombre, valor));
    if (padre) padre.appendChild(elemento);
    return elemento;
  }

  // Las acciones registradas, una por flecha-etiqueta
  function transicionesDiagrama() {
    const lista = [];
    mapaReglas.forEach((r) => {
      r.acciones.forEach((a) => {
        lista.push({
          estado: r.estado,
          lee: r.lee,
          nuevoEstado: a.nuevoEstado,
          escribe: a.escribe,
          mueve: a.mueve,
          conflicto: r.acciones.length > 1,
        });
      });
    });
    return lista;
  }

  // En «Al final» el diagrama queda oculto hasta que la ejecución termina
  // (o hasta «Generar ahora»); en «Paso a paso» siempre se ve.
  const diagramaVisible = () =>
    vistaDiagrama === 'pasos' || generadoManual || (terminada() && !animando);

  // construir: el diagrama aparece armándose, estado por estado y flecha por flecha
  function dibujarDiagrama({ construir = false } = {}) {
    const visible = diagramaVisible();
    $('diagrama-espera').hidden = visible;
    if (!visible) {
      svg.textContent = '';
      nodos.clear();
      aristas.clear();
      capaContenido = crearSVG('g', {}, svg);
      capaFicha = crearSVG('g', {}, capaContenido);
      return;
    }

    // lo que ya estaba dibujado, para animar solo lo nuevo
    const aristasAntes = new Set(aristas.keys());
    const etiquetasAntes = new Set();
    aristas.forEach(({ etiquetas }) => etiquetas.forEach((_, k) => etiquetasAntes.add(k)));
    const nodosAntes = new Set(nodos.keys());
    const primeraVez = nodosAntes.size === 0;

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
    const enLinea = sesion.estados.length <= 6;
    const { posiciones, orden } = calcularPosiciones(enLinea);

    // Las transiciones con el mismo origen y destino comparten una flecha
    const grupos = new Map();
    transicionesDiagrama().forEach((t) => {
      const k = claveArista(t.estado, t.nuevoEstado);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(t);
    });

    // Cuánto espacio ocupa cada lazo (con sus etiquetas) por encima del estado
    const alturaLazos = new Map();
    grupos.forEach((lista) => {
      if (lista[0].estado === lista[0].nuevoEstado) {
        alturaLazos.set(lista[0].estado, ALTO_LAZO + 8 + lista.length * ALTO_LINEA);
      }
    });

    grupos.forEach((lista, k) => {
      const origen = lista[0].estado;
      const destino = lista[0].nuevoEstado;
      const hayInversa = origen !== destino && grupos.has(claveArista(destino, origen));
      const forma = enLinea
        ? formaEnLinea(origen, destino, posiciones, orden, hayInversa, alturaLazos)
        : formaEnCirculo(origen, destino, posiciones, hayInversa);

      const camino = crearSVG('path', { class: 'd-arista', d: forma.d, 'marker-end': 'url(#punta)' }, capaAristas);
      if (!primeraVez && !aristasAntes.has(k)) trazarCamino(camino);

      const etiquetas = new Map();
      lista.forEach((t, n) => {
        const punto = posicionEtiqueta(forma, n, lista.length);
        const texto = crearSVG('text', {
          class: `d-etiqueta${t.conflicto ? ' conflicto' : ''}`,
          x: redondear(punto.x), y: redondear(punto.y), 'text-anchor': forma.ancla,
        }, capaEtiquetas);
        texto.textContent = `${t.lee}/${t.escribe},${t.mueve}`;
        const kAccion = claveAccion(t);
        if (!primeraVez && !etiquetasAntes.has(kAccion)) texto.classList.add('nueva');
        etiquetas.set(kAccion, texto);
      });
      aristas.set(k, { camino, etiquetas });
    });

    // Flecha que señala el estado inicial
    const inicio = posiciones.get(sesion.inicial);
    const angulo = enLinea ? Math.PI : inicio.haciaAfuera - 0.9;
    const dx = Math.cos(angulo);
    const dy = Math.sin(angulo);
    crearSVG('path', {
      class: 'd-inicial',
      d: `M${redondear(inicio.x + dx * (R + 44))} ${redondear(inicio.y + dy * (R + 44))} L${redondear(inicio.x + dx * R)} ${redondear(inicio.y + dy * R)}`,
      'marker-end': 'url(#punta)',
    }, capaAristas);

    // Estados (el final lleva doble círculo)
    sesion.estados.forEach((estado) => {
      const p = posiciones.get(estado);
      const g = crearSVG('g', { class: 'd-nodo', transform: `translate(${redondear(p.x)} ${redondear(p.y)})` }, capaNodos);
      if (!primeraVez && !nodosAntes.has(estado)) g.classList.add('nuevo');
      crearSVG('circle', { class: 'd-nodo__pulso', r: R }, g);
      crearSVG('circle', { class: 'd-nodo__borde', r: R }, g);
      if (estado === sesion.final) crearSVG('circle', { class: 'd-nodo__interior', r: R - 5.5 }, g);
      const nombre = crearSVG('text', { class: 'd-nodo__nombre', x: -1, y: 7 }, g);
      const partes = /^(.*?\D)(\d+)$/.exec(estado);
      nombre.appendChild(document.createTextNode(partes ? partes[1] : estado));
      if (partes) {
        const sub = crearSVG('tspan', { class: 'd-nodo__indice', dy: 5 }, nombre);
        sub.textContent = partes[2];
      }
      if (estado.length > 3) nombre.style.fontSize = `${Math.max(11, 21 - (estado.length - 3) * 2.5)}px`;
      nodos.set(estado, g);
    });

    ajustarVista();
    if (construir) animarConstruccion();
  }

  // Los estados aparecen uno tras otro y luego cada flecha se dibuja con su
  // etiqueta, en el orden en que la máquina usó las transiciones.
  function animarConstruccion() {
    const PAUSA_NODO = 70;
    const PAUSA_FLECHA = 220;
    let n = 0;
    nodos.forEach((g) => {
      g.style.animationDelay = `${n * PAUSA_NODO}ms`;
      g.classList.add('nuevo');
      n += 1;
    });
    let k = 0;
    aristas.forEach(({ camino, etiquetas }) => {
      const retraso = n * PAUSA_NODO + k * PAUSA_FLECHA;
      const largo = Math.ceil(camino.getTotalLength());
      const punta = camino.getAttribute('marker-end');
      camino.removeAttribute('marker-end'); // la punta aparece cuando termina la línea
      camino.style.strokeDasharray = largo;
      camino.style.setProperty('--largo', largo);
      camino.style.animationDelay = `${retraso}ms`;
      camino.classList.add('nueva');
      etiquetas.forEach((texto) => {
        texto.style.animationDelay = `${retraso + 250}ms`;
        texto.classList.add('nueva');
      });
      setTimeout(() => {
        if (!camino.getAttribute('marker-end')) camino.setAttribute('marker-end', punta);
      }, retraso + 650);
      setTimeout(() => {
        camino.style.strokeDasharray = '';
        camino.style.animationDelay = '';
        camino.classList.remove('nueva');
      }, retraso + 900);
      k += 1;
    });
  }

  function ponerVistaDiagrama(vista) {
    vistaDiagrama = vista === 'final' ? 'final' : 'pasos';
    generadoManual = false;
    try {
      localStorage.setItem(CLAVE_VISTA, vistaDiagrama);
    } catch (e) { /* no se recuerda, no pasa nada */ }
    document.querySelectorAll('.vista-diagrama__opcion').forEach((boton) => {
      boton.setAttribute('aria-pressed', String(boton.dataset.vista === vistaDiagrama));
    });
    dibujarDiagrama({ construir: vistaDiagrama === 'final' && diagramaVisible() });
    marcarEstado(actual().estado, situacion());
  }

  // Una flecha nueva se "dibuja" de principio a fin
  function trazarCamino(camino) {
    const largo = Math.ceil(camino.getTotalLength());
    camino.style.strokeDasharray = largo;
    camino.style.setProperty('--largo', largo);
    camino.classList.add('nueva');
    setTimeout(() => {
      camino.style.strokeDasharray = '';
      camino.classList.remove('nueva');
    }, 800);
  }

  function calcularPosiciones(enLinea) {
    // el estado inicial va primero para que su flecha de entrada no estorbe
    const orden = [sesion.inicial, ...sesion.estados.filter((q) => q !== sesion.inicial)];
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
    nodos.forEach((g) => g.classList.remove('actual', 'aceptado', 'detenido'));
    const g = estado && nodos.get(estado);
    if (!g) return;
    g.classList.add('actual');
    if (sit === 'final') g.classList.add('aceptado');
    if (sit === 'paro') g.classList.add('detenido');

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
    arista.etiquetas.get(claveAccion(t))?.classList.add('activa');
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

  function construirCinta() {
    tira.style.setProperty('--celdas', CELDAS);
    for (let i = 0; i < CELDAS; i++) {
      const celda = document.createElement('span');
      celda.className = 'celda';
      celda.dataset.i = i;
      tira.appendChild(celda);
      celdas.push(celda);
    }
  }

  // Celdas que cambiaron respecto a la cinta inicial
  function modificadas(conf) {
    return conf.cinta.map((s, i) => (s !== sesion.cinta[i] ? i : -1)).filter((i) => i >= 0);
  }

  function pintarCinta(conf, celdaEscrita = null) {
    celdas.forEach((celda, i) => {
      const s = conf.cinta[i];
      if (celda.textContent !== s) celda.textContent = s;
      celda.classList.toggle('blanco', s === BLANCO);
      celda.classList.toggle('bajo-cabezal', i === conf.cabezal);
      celda.classList.toggle('modificada', s !== sesion.cinta[i]);
    });
    tira.style.setProperty('--cabezal', conf.cabezal);
    if (celdaEscrita !== null) reiniciarAnimacion(celdas[celdaEscrita], 'escrita');

    // corchete bajo el segmento modificado
    const m = modificadas(conf);
    marcaSegmento.hidden = m.length === 0;
    if (m.length) {
      marcaSegmento.style.setProperty('--desde', Math.min(...m));
      marcaSegmento.style.setProperty('--hasta', Math.max(...m));
    }
    seguirCabezal(conf.cabezal);
  }

  // En pantallas angostas la cinta se desliza de lado: mantiene visible el cabezal
  function seguirCabezal(i) {
    if (ventanaCinta.scrollWidth <= ventanaCinta.clientWidth) return;
    const celda = celdas[i];
    const centro = tira.offsetLeft + celda.offsetLeft + celda.offsetWidth / 2;
    ventanaCinta.scrollTo({ left: centro - ventanaCinta.clientWidth / 2, behavior: 'smooth' });
  }

  // Segmento modificado: antes (cinta inicial) y ahora
  function pintarSegmento(conf) {
    const m = modificadas(conf);
    const rango = $('segmento-rango');
    const cuerpo = $('segmento-cuerpo');
    if (!m.length) {
      rango.textContent = 'sin cambios';
      cuerpo.innerHTML = '';
      return;
    }
    const desde = Math.min(...m);
    const hasta = Math.max(...m);
    rango.textContent = `${desde === hasta ? `celda ${desde}` : `celdas ${desde} a ${hasta}`} · ${plural(m.length, 'cambio', 'cambios')}`;

    let indices = '';
    let antes = '';
    let ahora = '';
    for (let i = desde; i <= hasta; i++) {
      const cambio = conf.cinta[i] !== sesion.cinta[i] ? ' cambio' : '';
      const clase = (s) => `${s === BLANCO ? 'blanco' : ''}${cambio}`.trim();
      indices += `<td class="${cambio.trim()}">${i}</td>`;
      antes += `<td class="${clase(sesion.cinta[i])}">${escapar(sesion.cinta[i])}</td>`;
      ahora += `<td class="${clase(conf.cinta[i])}">${escapar(conf.cinta[i])}</td>`;
    }
    cuerpo.innerHTML =
      '<table class="segmento__tabla">' +
      `<tr class="indices"><th scope="row"></th>${indices}</tr>` +
      `<tr class="antes"><th scope="row">Antes</th>${antes}</tr>` +
      `<tr class="ahora"><th scope="row">Ahora</th>${ahora}</tr>` +
      '</table>';
  }

  // =========================================================
  // Paneles de información
  // =========================================================
  function pintarEncabezado() {
    const nombre = sesion.nombre || 'Sandbox';
    $('nombre-sesion').textContent = nombre;
    document.title = `${nombre} · Ejecución manual · Máquina de Turing`;
    $('objetivo').innerHTML =
      `Meta <span class="estado">${estadoHTML(sesion.final)}</span>` +
      '<span class="sep">·</span> paro con S';
  }

  function pintarDefinicion() {
    const conjunto = (lista, formato = escapar) => `{${lista.map(formato).join(', ')}}`;
    const sep = '<span class="sep">·</span>';
    $('definicion-formal').innerHTML =
      `Q = ${conjunto(sesion.estados, estadoHTML)}${sep}` +
      `Σ = ${conjunto(sesion.sigma)}${sep}` +
      `Γ = ${conjunto(MANUAL.gamma(sesion))}${sep}` +
      `F = {${estadoHTML(sesion.final)}}`;
  }

  function pintarDatos(conf, sit) {
    $('dato-estado').innerHTML = estadoHTML(conf.estado);
    $('dato-simbolo').textContent = conf.cinta[conf.cabezal];
    $('dato-posicion').textContent = conf.cabezal;
    $('dato-pasos').textContent = confs.length - 1;
    const resultado = $('dato-resultado');
    resultado.textContent = RESULTADO[sit].texto;
    resultado.dataset.situacion = RESULTADO[sit].clase;

    insignia.hidden = !INSIGNIA[sit];
    insignia.textContent = INSIGNIA[sit] ? INSIGNIA[sit].texto : '';
    insignia.dataset.situacion = INSIGNIA[sit] ? INSIGNIA[sit].clase : '';

    cabezalEstado.innerHTML = estadoHTML(conf.estado);
    cabezal.dataset.situacion = sit === 'final' ? 'aceptada' : sit;
  }

  function pintarLectura(conf) {
    const s = conf.cinta[conf.cabezal];
    lecturaSimbolo.textContent = s;
    lecturaSimbolo.classList.toggle('blanco', s === BLANCO);
    lecturaSimbolo.title = s === BLANCO ? 'Blanco ^ (□)' : `Símbolo ${s}`;
    $('lectura-detalle').innerHTML =
      `celda ${conf.cabezal} · ${estadoHTML(conf.estado)}<br>` +
      (terminada() ? 'ejecución terminada' : `paso ${confs.length}`);
  }

  // Botón-ficha para símbolos y estados
  function crearFicha({ html, clase = '', pulsada = null, esActual = false, datos = {}, titulo = '' }) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `ficha ${clase}${esActual ? ' es-actual' : ''}`.trim();
    boton.innerHTML = html;
    if (pulsada !== null) boton.setAttribute('aria-pressed', String(pulsada));
    Object.entries(datos).forEach(([k, v]) => { boton.dataset[k] = v; });
    if (titulo) boton.title = titulo;
    return boton;
  }

  // 1. ¿Cambiar el símbolo o continuar sin cambios? Si cambia: ¿por cuál?
  //    (las opciones son todos los símbolos del alfabeto Γ menos el que ya está)
  function pintarFichasSimbolo() {
    const lee = leido();
    opcionesCambio.replaceChildren(
      crearFicha({
        html: `Sin cambios · <b>${escapar(lee)}</b>`,
        clase: 'ficha--opcion',
        pulsada: !eleccion.cambiar,
        datos: { opcion: 'igual' },
        titulo: `Continuar sin cambios: la celda conserva ${lee} (Esc)`,
      }),
      crearFicha({
        html: 'Cambiar',
        clase: 'ficha--opcion',
        pulsada: eleccion.cambiar,
        datos: { opcion: 'cambiar' },
        titulo: 'Escribir otro símbolo del alfabeto en la celda (también con la tecla del símbolo)',
      }),
    );

    porCual.hidden = !eleccion.cambiar;
    porCual.classList.toggle('falta', faltaSimbolo());
    const flecha = $('por-cual-pregunta');
    flecha.textContent = `${lee} →`;
    flecha.title = `¿Por cuál símbolo cambia el ${lee}?`;
    flecha.setAttribute('aria-label', flecha.title);
    fichasSimbolo.replaceChildren(...MANUAL.gamma(sesion).filter((s) => s !== lee).map((s) => crearFicha({
      html: escapar(s),
      clase: s === BLANCO ? 'ficha--blanco' : '',
      pulsada: eleccion.simbolo === s,
      datos: { simbolo: s },
      titulo: s === BLANCO ? 'Escribir el blanco ^ (borrar la celda)' : `Cambiar por ${s} (tecla ${s})`,
    })));
  }

  // Un estado se puede quitar de Q si no es el inicial ni el final, la máquina
  // no está en él y ningún paso lo usa (así el registro no cambia).
  function sePuedeQuitar(q) {
    if (q === sesion.inicial || q === sesion.final || q === actual().estado) return false;
    return !sesion.pasos.some((p) => p.nuevoEstado === q);
  }

  // 2. Estado siguiente (o uno nuevo); los que no se usan llevan × para quitarlos
  function pintarFichasEstado() {
    const conf = actual();
    const fichas = sesion.estados.map((q) => {
      const ficha = crearFicha({
        html: estadoHTML(q),
        clase: `ficha--estado${q === sesion.final ? ' ficha--final' : ''}`,
        pulsada: eleccion.estado === q,
        esActual: q === conf.estado,
        datos: { estado: q },
        titulo: q === sesion.final
          ? `${q} es el estado final: al llegar termina la ejecución`
          : (q === conf.estado ? `Quedarse en ${q}` : `Pasar a ${q}`),
      });
      if (!sePuedeQuitar(q)) return ficha;
      const grupo = document.createElement('span');
      grupo.className = 'ficha-quitable';
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'ficha__quitar';
      quitar.dataset.quitar = q;
      quitar.title = `Quitar ${q} de Q`;
      quitar.setAttribute('aria-label', quitar.title);
      quitar.textContent = '×';
      grupo.append(ficha, quitar);
      return grupo;
    });
    const nuevo = MANUAL.nombreNuevoEstado(sesion.estados);
    fichas.push(crearFicha({
      html: '+ nuevo',
      clase: 'ficha--nuevo',
      datos: { nuevo: '1' },
      titulo: `Agregar el estado ${nuevo} a Q y pasar a él`,
    }));
    fichasEstado.replaceChildren(...fichas);
  }

  // 3. Movimientos: I no puede salir por la celda 0 ni D por la 49
  function pintarMovimientos() {
    const conf = actual();
    const fin = terminada();
    const regla = reglaDe(conf.estado, leido());
    const a = regla ? regla.acciones[0] : null;
    const escribe = eleccion.simbolo ?? leido();
    const sugerido = a && a.escribe === escribe && a.nuevoEstado === eleccion.estado ? a.mueve : null;

    botonesMov.forEach((boton) => {
      const m = boton.dataset.mueve;
      const orilla = (m === 'I' && conf.cabezal === 0) || (m === 'D' && conf.cabezal === CELDAS - 1);
      boton.disabled = fin || animando || orilla || faltaSimbolo();
      boton.classList.toggle('sugerido', !fin && m === sugerido);
      if (orilla) boton.title = `La cinta termina en la celda ${conf.cabezal}: el cabezal no puede salir`;
      else if (faltaSimbolo()) boton.title = 'Falta el símbolo nuevo de la celda (opción 1)';
      else boton.title = { I: 'I · Mover a la izquierda (←)', S: 'S · No se mueve: estado de paro (↓)', D: 'D · Mover a la derecha (→)' }[m];
    });
    panelDecision.classList.toggle('terminada', fin);
    btnDeshacer.disabled = animando || sesion.pasos.length === 0;
    btnReiniciar.disabled = animando || sesion.pasos.length === 0;
  }

  // Una línea con lo que se aplicará al mover (y una etiqueta si hay algo que
  // notar); las explicaciones largas van en «Más info»
  function pintarVistaPrevia() {
    const detalle = $('vista-previa-detalle');
    const etiqueta = (clase, texto) => `<span class="etiqueta etiqueta--${clase}">${texto}</span>`;
    const conf = actual();
    const lee = leido();

    if (terminada()) {
      vistaPrevia.innerHTML = situacion() === 'final'
        ? `${etiqueta('final', 'terminó')} La máquina llegó a ${estadoHTML(sesion.final)}`
        : `${etiqueta('paro', 'terminó')} La máquina quedó en paro en ${estadoHTML(conf.estado)}`;
      detalle.innerHTML = '';
      return;
    }
    if (faltaSimbolo()) {
      vistaPrevia.innerHTML = `${etiqueta('falta', 'falta')} El símbolo nuevo para el ${escapar(lee)}`;
      detalle.innerHTML = '';
      return;
    }

    const escribe = eleccion.simbolo ?? lee;
    const p = eleccion.estado;
    const m = movimientoVista;
    const accion = { nuevoEstado: p, escribe, mueve: m || '·' };
    const etiquetas = [];
    const avisos = [];

    const regla = reglaDe(conf.estado, lee);
    if (regla) {
      const a = regla.acciones[0];
      const coincide = a.escribe === escribe && a.nuevoEstado === p && (!m || a.mueve === m);
      if (coincide) {
        etiquetas.push(etiqueta('regla', 'regla repetida'));
        avisos.push(`Es la misma regla que la máquina aplicó en el paso ${a.pasos[0]}.`);
      } else {
        etiquetas.push(etiqueta('conflicto', 'no determinista'));
        avisos.push(`La máquina ya tiene ${deltaHTML(regla.estado, regla.lee, a)} (paso ${a.pasos[0]}): ` +
          'con otra acción deja de ser determinista y no se podrá exportar al Modo 1.');
      }
    }

    if (p === sesion.final) {
      etiquetas.push(etiqueta('final', 'meta'));
      avisos.push(`${estadoHTML(p)} es el estado final: al aplicar este paso la ejecución termina.`);
    } else if (m === 'S') {
      etiquetas.push(etiqueta('paro', 'paro'));
      avisos.push('Con S el cabezal no se mueve y la ejecución se detiene (estado de paro).');
      if (p === conf.estado && escribe === lee) {
        avisos.push('En el Modo 1 esta regla se repetiría sin fin.');
      } else if (reglaDe(p, escribe)) {
        avisos.push(`En el Modo 1 la máquina no se detendría: seguiría con δ(${estadoHTML(p)}, ${escapar(escribe)}).`);
      }
    }

    vistaPrevia.innerHTML =
      `<span class="resumen-paso__etiqueta">${m ? 'Se aplicará' : 'Siguiente'}</span>` +
      `<span class="resumen-paso__delta">${deltaHTML(conf.estado, lee, accion)}</span>${etiquetas.join('')}`;
    detalle.innerHTML = avisos.join(' ');
  }

  // Explicación del último paso (o de la configuración inicial)
  function pintarExplicacion(conf, sit) {
    const p = conf.paso;
    const qf = estadoHTML(sesion.final);
    let titulo;
    let texto;

    if (!p) {
      const { desde, hasta } = MANUAL.contenido(conf);
      const contenido = hasta >= desde && conf.cinta.slice(desde, hasta + 1).some((s) => s !== BLANCO)
        ? `con ${escapar(conf.cinta.slice(INICIO, hasta + 1).join(''))} desde la celda ${INICIO}`
        : 'en blanco';
      titulo = 'Configuración inicial';
      texto = `La cinta empieza ${contenido} y el cabezal está en la celda ${sesion.cabezal}. ` +
        `La máquina está en ${estadoHTML(sesion.inicial)} y espera la acción para el símbolo que lee el cabezal. ` +
        `La meta es llegar a ${qf}, o detenerse antes con S.`;
    } else {
      const cambio = p.escribe === p.lee
        ? `dejó ${escapar(p.lee)} sin cambios`
        : `cambió ${escapar(p.lee)} por ${escapar(p.escribe)}`;
      titulo = `Paso ${p.numero} · ${deltaHTML(p.estado, p.lee, p)}`;
      texto = `La máquina estaba en ${estadoHTML(p.estado)} y el cabezal leyó ${escapar(p.lee)} en la celda ${p.celda}: ` +
        `${cambio}, ${TEXTO_MOVIMIENTO[p.mueve]} y pasó a ${estadoHTML(p.nuevoEstado)}.`;
    }

    if (sit === 'final') {
      texto += ` ${qf} es el estado final: <strong>la máquina llegó a la meta</strong> y la ejecución terminó.`;
    } else if (sit === 'paro') {
      texto += ` La máquina entró en <strong>estado de paro</strong> y la ejecución terminó en ${estadoHTML(conf.estado)}.`;
    }
    if (sit === 'final' || sit === 'paro') {
      texto += ' El último paso se puede deshacer; la cinta se puede grabar y la configuración exportar al Modo 1.';
    }

    $('explicacion-titulo').innerHTML = titulo;
    $('explicacion-texto').innerHTML = texto;
  }

  // ---------- Registro: movimientos y cambios, con la terna de cada paso ----------
  function ternaHTML(conf) {
    const { desde, hasta } = MANUAL.contenido(conf);
    let contenido = '';
    for (let i = desde; i <= hasta; i++) {
      const s = escapar(conf.cinta[i]);
      contenido += i === conf.cabezal ? `<mark>${s}</mark>` : s;
    }
    return `<span class="registro__terna">(${estadoHTML(conf.estado)}, ${contenido}, ${conf.cabezal})</span>`;
  }

  function itemRegistro(conf, k, sit) {
    const item = document.createElement('li');
    item.className = 'registro__item';
    const { texto } = MANUAL.contenido(conf);
    item.title = `(${conf.estado}, ${texto}, ${conf.cabezal})`;

    if (!conf.paso) {
      item.innerHTML =
        '<span class="registro__paso">0</span>' +
        `<div><p class="registro__delta">Inicio · cinta inicial</p><p class="registro__detalle">${ternaHTML(conf)}</p></div>`;
    } else {
      const p = conf.paso;
      const regla = mapaReglas.get(clave(p.estado, p.lee));
      const conflicto = regla && regla.acciones.length > 1;
      const ultimo = k === confs.length - 1;
      const cambio = p.escribe === p.lee
        ? `celda ${p.celda}: ${escapar(p.lee)} sin cambios`
        : `<span class="registro__cambio">celda ${p.celda}: ${escapar(p.lee)} → ${escapar(p.escribe)}</span>`;
      let etiquetas = '';
      if (ultimo && sit === 'final') etiquetas += '<span class="etiqueta etiqueta--final">final</span>';
      if (ultimo && sit === 'paro') etiquetas += '<span class="etiqueta etiqueta--paro">paro</span>';
      if (conflicto) etiquetas += '<span class="etiqueta etiqueta--conflicto">no determinista</span>';
      item.innerHTML =
        `<span class="registro__paso">${p.numero}</span>` +
        `<div><p class="registro__delta">${deltaHTML(p.estado, p.lee, p)}${etiquetas}</p>` +
        `<p class="registro__detalle">${cambio} · ${ternaHTML(conf)}</p></div>`;
      if (conflicto) item.classList.add('conflicto');
    }
    if (k === confs.length - 1) item.classList.add('actual');
    return item;
  }

  function pintarRegistro(nuevoPaso = false) {
    const sit = situacion();
    listaRegistro.replaceChildren(...confs.map((c, k) => itemRegistro(c, k, sit)));
    if (nuevoPaso) listaRegistro.lastElementChild.classList.add('nuevo');
    if (!paneles.registro.hidden) paneles.registro.scrollTop = paneles.registro.scrollHeight;
  }

  // ---------- Transiciones δ registradas ----------
  function pintarDelta(accionNueva = null) {
    const posicion = (lista, valor) => lista.indexOf(valor);
    const gamma = MANUAL.gamma(sesion);
    const ordenadas = [...mapaReglas.values()].sort((a, b) =>
      posicion(sesion.estados, a.estado) - posicion(sesion.estados, b.estado) ||
      posicion(gamma, a.lee) - posicion(gamma, b.lee));

    const conf = actual();
    const fin = terminada();
    cuerpoDelta.textContent = '';
    let estadoAnterior = null;
    let filaProxima = null;

    ordenadas.forEach((r) => {
      r.acciones.forEach((a) => {
        const fila = document.createElement('tr');
        if (estadoAnterior !== null && estadoAnterior !== r.estado) fila.classList.add('nuevo-grupo');
        estadoAnterior = r.estado;
        if (r.acciones.length > 1) fila.classList.add('conflicto');
        const t = { estado: r.estado, lee: r.lee, ...a };
        if (accionNueva && claveAccion(t) === accionNueva) fila.classList.add('nueva');
        if (!fin && r.estado === conf.estado && r.lee === leido()) {
          fila.classList.add('proxima');
          filaProxima = filaProxima || fila;
        }
        fila.title = `Usada en ${a.pasos.length === 1 ? 'el paso' : 'los pasos'} ${a.pasos.join(', ')}`;
        fila.innerHTML =
          `<td>δ(${estadoHTML(r.estado)}, ${escapar(r.lee)})</td>` +
          '<td>=</td>' +
          `<td>(${estadoHTML(a.nuevoEstado)}, ${escapar(a.escribe)}, ${escapar(a.mueve)})</td>` +
          `<td class="usos">×${a.pasos.length}</td>`;
        cuerpoDelta.appendChild(fila);
      });
    });

    if (!ordenadas.length) {
      cuerpoDelta.innerHTML = '<tr><td class="vacia">Sin transiciones.</td></tr>';
    }

    $('alerta-delta').hidden = MANUAL.conflictos(mapaReglas).length === 0;
    if (filaProxima && !paneles.delta.hidden) {
      const caja = paneles.delta.getBoundingClientRect();
      const fila = filaProxima.getBoundingClientRect();
      if (fila.top < caja.top || fila.bottom > caja.bottom) {
        paneles.delta.scrollTop += fila.top - caja.top - caja.height / 2;
      }
    }
  }

  // ---------- Cintas grabadas ----------
  function pintarGrabadas() {
    const lista = MANUAL.leerGrabadas();
    $('cuenta-grabadas').textContent = lista.length ? `(${lista.length})` : '';
    if (!lista.length) {
      listaGrabadas.innerHTML = '<li class="grabadas__vacio">Sin cintas grabadas.</li>';
      return;
    }
    listaGrabadas.replaceChildren(...lista.map((g) => {
      const item = document.createElement('li');
      item.className = `grabada${g.id === grabadaNueva ? ' nueva' : ''}`;
      const fecha = new Date(g.fecha);
      const hora = Number.isNaN(fecha.getTime())
        ? ''
        : fecha.toLocaleString('es-GT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      item.innerHTML =
        `<p class="grabada__titulo"><span>${escapar(g.nombre)} · paso ${Number(g.paso) || 0}` +
        `${g.estado ? ` · ${estadoHTML(g.estado)}` : ''}</span><span class="grabada__fecha">${escapar(hora)}</span></p>` +
        `<p class="grabada__cinta" title="${escapar(MANUAL.normalizarCinta(g.celdas).join(''))}">${escapar(MANUAL.normalizarCinta(g.celdas).join(''))}</p>` +
        '<div class="grabada__acciones">' +
        `<button type="button" class="mini" data-accion="descargar" data-id="${g.id}">Descargar</button>` +
        `<button type="button" class="mini" data-accion="usar" data-id="${g.id}">Usar como cinta inicial</button>` +
        `<button type="button" class="mini mini--peligro" data-accion="eliminar" data-id="${g.id}">Eliminar</button>` +
        '</div>';
      return item;
    }));
  }

  // ---------- Configuración para el Modo 1 ----------
  function pintarExportar() {
    exportacion = MANUAL.configuracionModo1(sesion, confs);
    const { maquina, errores, palabra } = exportacion;
    const conjunto = (lista, formato = escapar) => `{${lista.map(formato).join(', ')}}`;
    const gamma1 = [...new Set([...sesion.sigma, ...sesion.auxiliares, MANUAL.BLANCO_MODO1])];
    const n = [...mapaReglas.values()].reduce((suma, r) => suma + r.acciones.length, 0);
    $('exportar-tupla').innerHTML =
      `M = (${conjunto(sesion.estados, estadoHTML)}, ${conjunto(sesion.sigma)}, ${conjunto(gamma1)}, δ, ` +
      `${estadoHTML(sesion.inicial)}, ${MANUAL.BLANCO_MODO1}, {${estadoHTML(sesion.final)}})`;

    // Detalle (en «Más info»): cómo queda el archivo
    $('exportar-notas').innerHTML =
      `δ: ${plural(n, 'transición', 'transiciones')} · w = ${palabra.length ? escapar(palabra.join('')) : 'ε'}` +
      `${sesion.cabezal !== INICIO ? ` (desde la celda ${sesion.cabezal})` : ''}<br>` +
      `D → R · I → L · ^ → ${MANUAL.BLANCO_MODO1} · con .json el Modo 1 llena el resto de la cinta al azar`;

    // Una línea corta con el estado; la explicación completa va en «Más info»
    const estado = $('exportar-estado');
    const detalle = $('exportar-detalle');
    const conflictos = exportacion.conflictos || [];
    if (!sesion.pasos.length) {
      estado.dataset.tipo = 'neutro';
      estado.textContent = 'Sin pasos todavía: δ se crea con cada paso';
      detalle.textContent = errores[0] ? errores[0].mensaje : '';
    } else if (conflictos.length) {
      const r = conflictos[0];
      estado.dataset.tipo = 'error';
      estado.textContent = `No determinista · δ(${r.estado}, ${r.lee}) tiene ${r.acciones.length} respuestas`;
      detalle.textContent = errores.map((e) => e.mensaje).join(' ');
    } else if (errores.length) {
      estado.dataset.tipo = 'error';
      estado.textContent = 'No se puede exportar todavía';
      detalle.textContent = errores.map((e) => e.mensaje).join(' ');
    } else {
      const revision = MANUAL.comprobar(maquina, sesion, confs);
      estado.dataset.tipo = revision.tipo;
      estado.textContent = revision.corto || revision.texto;
      detalle.textContent = revision.texto;
    }
    btnJSON.disabled = !maquina;
    btnModo1.disabled = !maquina;
  }

  // Dibuja todo según la configuración actual
  function pintarTodo({ nuevoPaso = false, accionNueva = null } = {}) {
    const conf = actual();
    const sit = situacion();
    pintarCinta(conf);
    pintarSegmento(conf);
    resaltarTransicion(null);
    marcarEstado(conf.estado, sit);
    pintarDatos(conf, sit);
    pintarLectura(conf);
    pintarFichasSimbolo();
    pintarFichasEstado();
    pintarMovimientos();
    pintarVistaPrevia();
    pintarExplicacion(conf, sit);
    pintarRegistro(nuevoPaso);
    pintarDelta(accionNueva);
    pintarDefinicion();
    pintarExportar();
  }

  // =========================================================
  // Aplicar un paso
  // =========================================================
  async function animarPaso(antes, despues, redibujar) {
    const miGeneracion = ++generacion;
    const sigueVigente = () => miGeneracion === generacion;
    const t = despues.paso;
    ajustarTiempos(DURACION_PASO);
    if (redibujar) dibujarDiagrama();

    // 1. Leer
    marcarEstado(antes.estado, 'activa');
    resaltarTransicion(t);
    reiniciarAnimacion(celdas[antes.cabezal], 'leyendo');
    reiniciarAnimacion(lecturaSimbolo, 'leyendo');
    await esperar(DURACION_PASO * 0.22);
    if (!sigueVigente()) return false;

    // 2. Escribir (el cabezal todavía no se mueve)
    pintarCinta({ ...despues, cabezal: antes.cabezal }, antes.cabezal);
    await esperar(DURACION_PASO * 0.24);
    if (!sigueVigente()) return false;

    // 3. Mover el cabezal y recorrer la flecha hacia el nuevo estado
    marcarEstado(null);
    pintarCinta(despues);
    await recorrerArista(t, DURACION_PASO * 0.42, sigueVigente);
    if (!sigueVigente()) return false;

    // 4. Llegar
    await esperar(DURACION_PASO * 0.08);
    return sigueVigente();
  }

  async function aplicar(mueve) {
    if (animando || terminada()) return;
    if (faltaSimbolo()) {
      mostrarAviso('Falta el símbolo nuevo.', true);
      fichasSimbolo.querySelector('.ficha')?.focus();
      return;
    }
    const antes = actual();
    const orilla = (mueve === 'I' && antes.cabezal === 0) || (mueve === 'D' && antes.cabezal === CELDAS - 1);
    if (orilla) {
      mostrarAviso(`Fin de la cinta (celda ${antes.cabezal}).`, true);
      return;
    }

    const lee = antes.cinta[antes.cabezal];
    const paso = { escribe: eleccion.simbolo ?? lee, mueve, nuevoEstado: eleccion.estado };
    const reglaPrevia = reglaDe(antes.estado, lee);
    const esNueva = !reglaPrevia || !reglaPrevia.acciones.some((a) => MANUAL.mismaAccion(a, paso));

    sesion.pasos.push(paso);
    guardar();
    recalcular();
    const despues = actual();
    movimientoVista = null;

    animando = true;
    panelDecision.classList.add('ocupada');
    pintarMovimientos();
    const completo = await animarPaso(antes, despues, esNueva);
    animando = false;
    panelDecision.classList.remove('ocupada');
    if (!completo) return; // se deshizo o reinició a mitad del paso

    // «Al final»: al terminar la ejecución se genera el diagrama completo
    if (vistaDiagrama === 'final' && !generadoManual && terminada()) dibujarDiagrama({ construir: true });

    eleccionPorDefecto();
    pintarTodo({ nuevoPaso: true, accionNueva: esNueva ? claveAccion(despues.paso) : null });

    const sit = situacion();
    if (sit === 'final') {
      mostrarAviso(`Estado final ${sesion.final} · ${plural(sesion.pasos.length, 'paso', 'pasos')}.`);
    } else if (sit === 'paro') {
      mostrarAviso(`Paro en ${despues.estado}.`);
    } else if (esNueva && reglaPrevia) {
      mostrarAviso(`No determinista: δ(${antes.estado}, ${lee}) ya tenía otra respuesta.`, true);
    }
  }

  function deshacer() {
    if (animando || !sesion.pasos.length) return;
    const numero = sesion.pasos.length;
    const quitado = sesion.pasos.pop();
    generacion += 1;
    capaFicha.textContent = '';
    guardar();
    recalcular();
    // Si ya hay una regla para (estado, símbolo) se proponen sus opciones;
    // si no, quedan elegidas las del paso deshecho, por si quieres repetirlo
    // cambiando solo una parte.
    eleccionPorDefecto();
    if (!reglaDe(actual().estado, leido())) {
      const simbolo = quitado.escribe !== leido() ? quitado.escribe : null;
      eleccion = { cambiar: simbolo !== null, simbolo, estado: quitado.nuevoEstado };
    }
    ajustarTiempos(600);
    dibujarDiagrama();
    pintarTodo();
    mostrarAviso(`Paso ${numero} deshecho.`);
  }

  function reiniciar() {
    if (animando || !sesion.pasos.length) return;
    if (!confirm(`¿Reiniciar? Se borran ${plural(sesion.pasos.length, 'paso', 'pasos')}.`)) return;
    sesion.pasos = [];
    generacion += 1;
    generadoManual = false;
    guardar();
    recalcular();
    eleccionPorDefecto();
    ajustarTiempos(700);
    dibujarDiagrama();
    pintarTodo();
    mostrarAviso('Ejecución reiniciada.');
  }

  // =========================================================
  // Elecciones del paso
  // =========================================================
  // '' (o el mismo símbolo que ya está) = continuar sin cambios
  function elegirSimbolo(s) {
    if (animando || terminada()) return;
    const igual = s === '' || s === leido();
    eleccion.cambiar = !igual;
    eleccion.simbolo = igual ? null : s;
    pintarFichasSimbolo();
    pintarMovimientos();
    pintarVistaPrevia();
  }

  // «Cambiar el símbolo»: se despliegan las opciones del alfabeto
  function elegirCambiar() {
    if (animando || terminada()) return;
    if (!eleccion.cambiar) {
      eleccion.cambiar = true;
      eleccion.simbolo = null;
    }
    pintarFichasSimbolo();
    pintarMovimientos();
    pintarVistaPrevia();
    fichasSimbolo.querySelector('.ficha')?.focus({ preventScroll: true });
  }

  function elegirEstado(q) {
    if (animando || terminada()) return;
    eleccion.estado = q;
    pintarFichasEstado();
    pintarMovimientos();
    pintarVistaPrevia();
  }

  function agregarEstado() {
    if (animando || terminada()) return;
    const q = MANUAL.nombreNuevoEstado(sesion.estados);
    sesion.estados.push(q);
    guardar();
    eleccion.estado = q;
    dibujarDiagrama();
    marcarEstado(actual().estado, situacion());
    pintarDefinicion();
    pintarFichasEstado();
    pintarMovimientos();
    pintarVistaPrevia();
    pintarExportar();
    mostrarAviso(`${q} agregado.`);
  }

  function quitarEstado(q) {
    if (animando || terminada() || !sePuedeQuitar(q)) return;
    sesion.estados = sesion.estados.filter((x) => x !== q);
    if (eleccion.estado === q) eleccion.estado = actual().estado;
    guardar();
    dibujarDiagrama();
    marcarEstado(actual().estado, situacion());
    pintarDefinicion();
    pintarFichasEstado();
    pintarMovimientos();
    pintarVistaPrevia();
    pintarExportar();
    mostrarAviso(`${q} quitado.`);
  }

  // =========================================================
  // Grabar la cinta
  // =========================================================
  function grabar() {
    const conf = actual();
    const { grabacion, guardada } = MANUAL.grabarCinta({
      nombre: sesion.nombre || 'Sesión manual',
      paso: confs.length - 1,
      estado: conf.estado,
      cabezal: conf.cabezal,
      celdas: conf.cinta,
    });
    grabadaNueva = grabacion.id;
    mostrarPestana('grabadas');
    pintarGrabadas();
    paneles.grabadas.scrollTop = 0;
    mostrarAviso(
      guardada
        ? `Cinta grabada (paso ${grabacion.paso}).`
        : 'El navegador no guarda datos: la cinta se pierde al cerrar. Conviene descargarla.',
      !guardada
    );
  }

  // La cinta inicial solo lleva Σ y ^: los auxiliares (X, Y, …) que la
  // máquina escribió durante la ejecución se cambian por el blanco ^.
  function usarComoInicial(g) {
    const { cinta: nueva, quitados } = MANUAL.cintaSoloSigma(MANUAL.normalizarCinta(g.celdas), sesion.sigma);
    const n = sesion.pasos.length;
    const nota = quitados.length ? `\n${quitados.join(', ')} → ^ (no están en Σ).` : '';
    if (!confirm(`¿Usar esta cinta como inicial?${n ? ` Se pierden ${plural(n, 'paso', 'pasos')}.` : ''}${nota}`)) return;

    sesion.cinta = nueva;
    // la máquina arranca donde estaba el cabezal al grabar
    const c = Number(g.cabezal);
    if (Number.isInteger(c) && c >= 0 && c <= CELDAS - 1) sesion.cabezal = c;
    sesion.pasos = [];
    generacion += 1;
    generadoManual = false;
    guardar();
    recalcular();
    eleccionPorDefecto();
    dibujarDiagrama();
    pintarTodo();
    mostrarAviso(`Nueva cinta inicial · cabezal en la celda ${sesion.cabezal}.`);
  }

  // =========================================================
  // Pestañas
  // =========================================================
  function mostrarPestana(nombre) {
    document.querySelectorAll('.pestanas__boton').forEach((boton) => {
      boton.setAttribute('aria-selected', String(boton.dataset.pestana === nombre));
    });
    Object.entries(paneles).forEach(([clavePanel, panel]) => { panel.hidden = clavePanel !== nombre; });
    if (nombre === 'registro') paneles.registro.scrollTop = paneles.registro.scrollHeight;
    if (nombre === 'delta') pintarDelta();
  }

  // =========================================================
  // Arranque
  // =========================================================
  recalcular();
  eleccionPorDefecto();
  construirCinta();
  pintarEncabezado();
  document.querySelectorAll('.vista-diagrama__opcion').forEach((boton) => {
    boton.setAttribute('aria-pressed', String(boton.dataset.vista === vistaDiagrama));
  });
  dibujarDiagrama();
  ajustarTiempos(700);
  pintarTodo();
  pintarGrabadas();

  // con la fuente ya cargada, los textos del diagrama miden distinto
  if (document.fonts) document.fonts.ready.then(ajustarVista);

  // ---------- Eventos ----------
  // Diagrama paso a paso o al final
  document.querySelectorAll('.vista-diagrama__opcion').forEach((boton) => {
    boton.addEventListener('click', () => ponerVistaDiagrama(boton.dataset.vista));
  });

  $('btn-generar').addEventListener('click', () => {
    generadoManual = true;
    dibujarDiagrama({ construir: true });
    marcarEstado(actual().estado, situacion());
  });

  opcionesCambio.addEventListener('click', (e) => {
    const ficha = e.target.closest('.ficha');
    if (!ficha) return;
    if (ficha.dataset.opcion === 'cambiar') elegirCambiar();
    else elegirSimbolo('');
  });

  fichasSimbolo.addEventListener('click', (e) => {
    const ficha = e.target.closest('.ficha');
    if (ficha) elegirSimbolo(ficha.dataset.simbolo);
  });

  fichasEstado.addEventListener('click', (e) => {
    const quitar = e.target.closest('.ficha__quitar');
    if (quitar) {
      quitarEstado(quitar.dataset.quitar);
      return;
    }
    const ficha = e.target.closest('.ficha');
    if (!ficha) return;
    if (ficha.dataset.nuevo) agregarEstado();
    else elegirEstado(ficha.dataset.estado);
  });

  botonesMov.forEach((boton) => {
    const m = boton.dataset.mueve;
    boton.addEventListener('click', () => aplicar(m));
    const ver = (valor) => () => {
      movimientoVista = valor;
      pintarVistaPrevia();
    };
    boton.addEventListener('mouseenter', ver(m));
    boton.addEventListener('focus', ver(m));
    boton.addEventListener('mouseleave', ver(null));
    boton.addEventListener('blur', ver(null));
  });

  // «Más info»: abre o cierra el detalle; el navegador recuerda cómo quedó
  document.querySelectorAll('.mas-info').forEach((boton) => {
    const destino = $(boton.getAttribute('aria-controls'));
    const claveInfo = `mt-sandbox-${destino.id}`;
    const poner = (abierto) => {
      destino.hidden = !abierto;
      boton.setAttribute('aria-expanded', String(abierto));
      boton.textContent = abierto ? 'Menos info' : 'Más info';
    };
    try {
      poner(localStorage.getItem(claveInfo) === '1');
    } catch (e) { /* sin localStorage empieza cerrado */ }
    boton.addEventListener('click', () => {
      const abierto = destino.hidden;
      poner(abierto);
      try {
        localStorage.setItem(claveInfo, abierto ? '1' : '0');
      } catch (e) { /* no se recuerda, no pasa nada */ }
    });
  });

  btnDeshacer.addEventListener('click', deshacer);
  btnReiniciar.addEventListener('click', reiniciar);
  $('btn-grabar').addEventListener('click', grabar);

  document.querySelectorAll('.pestanas__boton').forEach((boton) => {
    boton.addEventListener('click', () => mostrarPestana(boton.dataset.pestana));
  });

  listaGrabadas.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-accion]');
    if (!boton) return;
    const g = MANUAL.leerGrabadas().find((x) => String(x.id) === boton.dataset.id);
    if (!g) return;
    if (boton.dataset.accion === 'descargar') {
      const archivo = MANUAL.descargar(
        `cinta-${MANUAL.baseArchivo(g.nombre)}-paso-${Number(g.paso) || 0}.json`,
        MANUAL.grabacionJSON(g),
        'application/json'
      );
      mostrarAviso(`Se descargó ${archivo}.`);
    } else if (boton.dataset.accion === 'usar') {
      usarComoInicial(g);
    } else if (boton.dataset.accion === 'eliminar') {
      if (!confirm('¿Eliminar esta cinta grabada?')) return;
      MANUAL.eliminarGrabada(g.id);
      pintarGrabadas();
    }
  });

  // Exportar al Modo 1
  btnJSON.addEventListener('click', () => {
    if (!exportacion || !exportacion.maquina) return;
    const archivo = MT.descargar(exportacion.maquina);
    mostrarAviso(`Se descargó ${archivo}.`);
  });

  btnModo1.addEventListener('click', () => {
    if (!exportacion || !exportacion.maquina) return;
    MT.guardarEnSesion(exportacion.maquina);
    // El Modo 1 usará esta misma cinta (con B en lugar de ^) para reproducir la
    // sesión, corrida para que la palabra empiece en la celda 1, donde la toma
    MT.guardarCintaInicial(exportacion.cintaModo1);
    window.location.href = PANTALLA_MODO1;
  });

  btnTXT.addEventListener('click', () => {
    const archivo = MANUAL.descargar(
      `registro-${MANUAL.baseArchivo(sesion.nombre || 'Sesión manual')}.txt`,
      `﻿${MANUAL.registroTexto(sesion, confs)}`,
      'text/plain;charset=utf-8'
    );
    mostrarAviso(`Se descargó ${archivo}.`);
  });

  // Atajos: ← I, ↓ S, → D, una tecla de Γ elige ese símbolo,
  // Esc = sin cambios, Ctrl+Z o Retroceso = deshacer, R = reiniciar
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      deshacer();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      aplicar('I');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      aplicar('D');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      aplicar('S');
    } else if (e.key === 'Escape') {
      elegirSimbolo('');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      deshacer();
    } else if (MANUAL.gamma(sesion).includes(e.key)) {
      elegirSimbolo(e.key);
    } else if (e.key === 'r' || e.key === 'R') {
      reiniciar();
    }
  });
});
