// =========================================================
// Simulador · Máquina de Turing — Modo 2: preparar la ejecución manual
// Usa maquina.js (MT) y sesion.js (MANUAL), que se cargan antes.
//
//   01 · Alfabeto  → Σ (con él se llena la cinta) y símbolos auxiliares
//   02 · Estados   → Q, estado inicial y estado final (la meta)
//   03 · Cinta     → al azar con Σ (y el blanco ^), escrita o grabada
//   Comenzar       → guarda la sesión en la pestaña y abre el sandbox
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  const PANTALLA_SANDBOX = 'Sandbox/sandbox.html';
  const { BLANCO, CELDAS, INICIO } = MANUAL;

  // Valores con los que empieza el formulario
  const INICIAL = {
    nombre: '',
    sigma: '0, 1',
    auxiliares: '',
    estados: 'q0, q1, q2, q3',
    inicial: 'q0',
    final: 'q3',
    cantidad: 49,
  };

  // ---------- Elementos de la página ----------
  const $ = (id) => document.getElementById(id);
  const formulario = $('formulario');
  const entradas = {
    nombre: $('nombre'),
    sigma: $('sigma'),
    auxiliares: $('auxiliares'),
    estados: $('estados'),
    contenido: $('contenido'),
    cantidad: $('cantidad'),
    cabezal: $('cabezal'),
  };
  const conBlanco = $('con-blanco');
  const pildorasInicial = $('pildoras-inicial');
  const pildorasFinal = $('pildoras-final');
  const cintaPrevia = $('cinta-previa');
  const listaGrabadas = $('lista-grabadas');
  const archivoCinta = $('archivo-cinta');
  const resumenErrores = $('resumen-errores');
  const aviso = $('aviso');

  // ---------- Datos que se van llenando ----------
  let cinta = MANUAL.cintaVacia();
  let cabezal = INICIO;          // celda donde arranca la máquina
  let toque = 'simbolo';         // tocar una celda: 'simbolo' (la cambia) o 'cabezal' (lo pone ahí)
  let inicial = '';
  let final = '';
  let intentoComenzar = false; // después del primer intento se revisa mientras escribes
  const escapar = MANUAL.escapar;
  const unicos = (lista) => [...new Set(lista)];

  const estadosValidos = () => unicos(MT.separar(entradas.estados.value).filter(MT.esEstado));
  const simbolosValidos = (entrada) => unicos(MT.separar(entrada.value).filter(MT.esSimbolo))
    .filter((s) => s !== BLANCO && s !== MANUAL.BLANCO_MODO1);

  // ---------- Mensaje flotante ----------
  let temporizadorAviso;
  function mostrarAviso(texto, esError = false) {
    aviso.textContent = texto;
    aviso.classList.toggle('error', esError);
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), esError ? 5500 : 3800);
  }

  // =========================================================
  // Leer el formulario
  // =========================================================
  function leerDatos() {
    const Q = estadosValidos();
    return {
      nombre: entradas.nombre.value.trim(),
      sigma: MT.separar(entradas.sigma.value),
      auxiliares: MT.separar(entradas.auxiliares.value),
      estados: MT.separar(entradas.estados.value),
      inicial: Q.includes(inicial) ? inicial : '',
      final: Q.includes(final) ? final : '',
      cinta: cinta.slice(),
      cabezal,
    };
  }

  const celdaValida = (n) => Number.isInteger(n) && n >= 0 && n <= CELDAS - 1;

  // =========================================================
  // Dibujar las partes que dependen de lo escrito
  // =========================================================

  // Σ = { 0, 1 }  (marca en rojo lo inválido o repetido)
  function vistaConjunto(elemento, simbolo, texto, esValido) {
    const tokens = MT.separar(texto);
    if (!tokens.length) {
      elemento.innerHTML = `${simbolo} = <span class="tenue">{ }</span>`;
      return;
    }
    const vistos = new Set();
    const partes = tokens.map((t) => {
      const malo = !esValido(t) || vistos.has(t);
      vistos.add(t);
      return malo ? `<span class="malo">${escapar(t)}</span>` : escapar(t);
    });
    const cuantos = unicos(tokens.filter(esValido)).length;
    elemento.innerHTML = `${simbolo} = { ${partes.join(', ')} }  <span class="tenue">|${simbolo}| = ${cuantos}</span>`;
  }

  const esSimboloValido = (s) => MT.esSimbolo(s) && s !== BLANCO && s !== MANUAL.BLANCO_MODO1;

  function vistaGamma() {
    const sigma = simbolosValidos(entradas.sigma);
    const aux = simbolosValidos(entradas.auxiliares).filter((s) => !sigma.includes(s));
    const partes = [...sigma, ...aux].map(escapar);
    $('vista-gamma').innerHTML = `Γ = { ${[...partes, `<span class="acento">${BLANCO}</span>`].join(', ')} }`;
  }

  // Píldoras del estado inicial y del final (uno cada uno)
  function dibujarPildoras() {
    const Q = estadosValidos();
    if (!Q.length) {
      const vacio = '<p class="pildoras__vacio">Faltan los estados.</p>';
      pildorasInicial.innerHTML = vacio;
      pildorasFinal.innerHTML = vacio;
      return;
    }
    pildorasInicial.replaceChildren(...Q.map((q) => crearPildora('inicial', q, q === inicial)));
    pildorasFinal.replaceChildren(...Q.map((q) => crearPildora('final', q, q === final, true)));
  }

  function crearPildora(nombre, valor, marcada, esFinal = false) {
    const etiqueta = document.createElement('label');
    etiqueta.className = esFinal ? 'pildora pildora--final' : 'pildora';
    const entrada = document.createElement('input');
    entrada.type = 'radio';
    entrada.name = nombre;
    entrada.value = valor;
    entrada.checked = marcada;
    const texto = document.createElement('span');
    texto.textContent = valor;
    etiqueta.append(entrada, texto);
    return etiqueta;
  }

  // Las 50 celdas; la celda 0 queda en blanco y el cabezal puede empezar en cualquiera
  const celdas = [];
  function construirCinta() {
    const cabezal = document.createElement('span');
    cabezal.className = 'cinta-previa__cabezal';
    cabezal.setAttribute('aria-hidden', 'true');
    cintaPrevia.appendChild(cabezal);
    for (let i = 0; i < CELDAS; i++) {
      const celda = document.createElement('button');
      celda.type = 'button';
      celda.className = 'celda-previa';
      celda.dataset.i = i;
      cintaPrevia.appendChild(celda);
      celdas.push(celda);
    }
  }

  function dibujarCinta(cambiadas = []) {
    const sigma = simbolosValidos(entradas.sigma);
    celdas.forEach((celda, i) => {
      const s = cinta[i];
      if (celda.textContent !== s) celda.textContent = s;
      celda.classList.toggle('blanco', s === BLANCO);
      celda.classList.toggle('mala', s !== BLANCO && sigma.length > 0 && !sigma.includes(s));
      celda.classList.toggle('inicio', i === cabezal);
      celda.title = `Celda ${i}: ${s === BLANCO ? '^' : s}${i === cabezal ? ' · cabezal' : ''}`;
      celda.setAttribute('aria-label', celda.title);
    });
    cintaPrevia.style.setProperty('--cabezal', cabezal);
    cintaPrevia.classList.toggle('poner-cabezal', toque === 'cabezal');
    cambiadas.forEach((i) => {
      const celda = celdas[i];
      celda.classList.remove('cambio');
      void celda.offsetWidth; // reinicia la animación
      celda.classList.add('cambio');
    });

    // Resumen: contenido desde la celda 1 hasta la última no blanca
    let ultima = -1;
    for (let i = CELDAS - 1; i >= INICIO; i--) {
      if (cinta[i] !== BLANCO) {
        ultima = i;
        break;
      }
    }
    const arranque = `<span class="acento">cabezal: celda ${cabezal}</span>`;
    if (ultima < 0) {
      $('vista-cinta').innerHTML = `w = ε · ${arranque}`;
    } else {
      const contenido = cinta.slice(INICIO, ultima + 1).join('');
      $('vista-cinta').innerHTML =
        `w = ${escapar(contenido)} <span class="tenue">(${INICIO}–${ultima})</span> · ${arranque}`;
    }
  }

  // M = (Q, Σ, Γ, δ, q0, ^, F) con lo escrito hasta ahora
  function dibujarTupla() {
    const d = leerDatos();
    const conjunto = (arr) =>
      arr.length ? `{${unicos(arr).map(escapar).join(', ')}}` : '<span class="tenue">{ }</span>';
    const valor = (v) => (v ? escapar(v) : '<span class="tenue">?</span>');
    const sigma = simbolosValidos(entradas.sigma);
    const gamma = unicos([...sigma, ...simbolosValidos(entradas.auxiliares), BLANCO]);
    $('tupla').innerHTML =
      `M = (${conjunto(d.estados)}, ${conjunto(d.sigma)}, ${conjunto(gamma)}, δ, ` +
      `${valor(d.inicial)}, ${BLANCO}, ${conjunto(d.final ? [d.final] : [])})`;
  }

  function actualizarVistas() {
    vistaConjunto($('vista-sigma'), 'Σ', entradas.sigma.value, esSimboloValido);
    vistaConjunto($('vista-estados'), 'Q', entradas.estados.value, MT.esEstado);
    vistaGamma();
    dibujarCinta();
    dibujarTupla();
  }

  function alCambiar() {
    actualizarVistas();
    if (intentoComenzar) revisar();
  }

  // =========================================================
  // Revisión de los datos
  // =========================================================
  const SECCION_DE_CAMPO = {
    sigma: 'alfabeto',
    auxiliares: 'alfabeto',
    estados: 'estados',
    inicial: 'estados',
    final: 'estados',
    cinta: 'cinta',
    cabezal: 'cinta',
  };
  const NUMERO_SECCION = { alfabeto: '01', estados: '02', cinta: '03' };
  const ELEMENTO_DE_CAMPO = {
    sigma: entradas.sigma,
    auxiliares: entradas.auxiliares,
    estados: entradas.estados,
    inicial: pildorasInicial,
    final: pildorasFinal,
    cinta: $('marco-cinta'),
    cabezal: entradas.cabezal,
  };

  function revisar() {
    const resultado = MANUAL.validar(leerDatos());
    mostrarErrores(resultado.errores);
    return resultado;
  }

  function agregarMensaje(lista, texto) {
    const item = document.createElement('li');
    item.textContent = texto;
    lista.appendChild(item);
  }

  function mostrarErrores(errores) {
    formulario.querySelectorAll('.campo__errores').forEach((lista) => lista.replaceChildren());
    formulario.querySelectorAll('.invalida').forEach((el) => el.classList.remove('invalida'));
    const porSeccion = {};

    errores.forEach((err) => {
      const seccion = SECCION_DE_CAMPO[err.campo] || 'comenzar';
      porSeccion[seccion] = (porSeccion[seccion] || 0) + 1;
      const lista = formulario.querySelector(`[data-errores="${err.campo}"]`);
      if (lista) agregarMensaje(lista, err.mensaje);
      ELEMENTO_DE_CAMPO[err.campo]?.classList.add('invalida');
    });

    formulario.querySelectorAll('.seccion[data-seccion]').forEach((sec) => {
      const n = porSeccion[sec.dataset.seccion] || 0;
      const marca = sec.querySelector('[data-marca]');
      sec.classList.toggle('con-error', n > 0);
      sec.classList.toggle('completa', n === 0 && sec.dataset.seccion !== 'comenzar');
      if (marca) marca.textContent = n === 0 ? '✓ listo' : `${n} por corregir`;
    });

    const lista = $('resumen-lista');
    lista.replaceChildren();
    resumenErrores.hidden = errores.length === 0;
    if (!errores.length) return;

    $('resumen-titulo').textContent = errores.length === 1
      ? 'No se puede comenzar todavía: hay 1 dato por corregir.'
      : `No se puede comenzar todavía: hay ${errores.length} datos por corregir.`;

    errores.slice(0, 8).forEach((err) => {
      const item = document.createElement('li');
      const boton = document.createElement('button');
      boton.type = 'button';
      const numero = document.createElement('span');
      numero.className = 'resumen__seccion';
      numero.textContent = NUMERO_SECCION[SECCION_DE_CAMPO[err.campo]] || '';
      const texto = document.createElement('span');
      texto.textContent = err.mensaje;
      boton.append(numero, texto);
      boton.addEventListener('click', () => irAlError(err));
      item.appendChild(boton);
      lista.appendChild(item);
    });
    if (errores.length > 8) agregarMensaje(lista, `… y ${errores.length - 8} más.`);
  }

  function irAlError(err) {
    let destino = ELEMENTO_DE_CAMPO[err.campo] || $('btn-comenzar');
    if (err.campo === 'inicial' || err.campo === 'final') {
      destino = destino.querySelector('input') || entradas.estados;
    }
    if (err.campo === 'cinta') destino = celdas[INICIO];
    destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
    destino.focus({ preventScroll: true });
  }

  // =========================================================
  // Llenar el formulario
  // =========================================================
  function llenar(datos) {
    const texto = (valor) => (Array.isArray(valor) ? valor.join(', ') : (valor || ''));
    entradas.nombre.value = datos.nombre || '';
    entradas.sigma.value = texto(datos.sigma);
    entradas.auxiliares.value = texto(datos.auxiliares);
    entradas.estados.value = texto(datos.estados);
    entradas.cantidad.value = datos.cantidad || INICIAL.cantidad;
    inicial = datos.inicial || '';
    final = datos.final || '';
    cabezal = celdaValida(datos.cabezal) ? datos.cabezal : INICIO;
    entradas.cabezal.value = cabezal;
    cinta = datos.cinta
      ? MANUAL.normalizarCinta(datos.cinta)
      : MANUAL.llenarAlAzar(simbolosValidos(entradas.sigma), INICIAL.cantidad, conBlanco.checked);
    cinta[0] = BLANCO;
    entradas.contenido.value = '';
    intentoComenzar = false;
    mostrarErrores([]);
    formulario.querySelectorAll('.seccion').forEach((s) => s.classList.remove('con-error', 'completa'));
    dibujarPildoras();
    actualizarVistas();
  }

  // Pone el cabezal (donde arranca la máquina) en la celda i
  function ponerCabezal(i) {
    const n = Math.round(Number(i));
    if (!Number.isFinite(n)) {
      entradas.cabezal.value = cabezal;
      return;
    }
    cabezal = Math.min(CELDAS - 1, Math.max(0, n));
    entradas.cabezal.value = cabezal;
    dibujarCinta();
    alCambiar();
    celdas[cabezal].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  // Cambia la cinta y anima las celdas que cambiaron
  function ponerCinta(nueva) {
    const cambiadas = [];
    nueva.forEach((s, i) => { if (s !== cinta[i]) cambiadas.push(i); });
    cinta = nueva;
    cinta[0] = BLANCO;
    dibujarCinta(cambiadas);
    alCambiar();
  }

  // =========================================================
  // Cintas grabadas
  // =========================================================
  function dibujarGrabadas() {
    const grabadas = MANUAL.leerGrabadas();
    if (!grabadas.length) {
      listaGrabadas.innerHTML = '<li class="grabadas__vacio">Sin cintas grabadas.</li>';
      return;
    }
    listaGrabadas.replaceChildren(...grabadas.map((g) => {
      const item = document.createElement('li');
      item.className = 'grabada';
      const fecha = new Date(g.fecha);
      const cuando = Number.isNaN(fecha.getTime())
        ? ''
        : fecha.toLocaleString('es-GT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      item.innerHTML =
        '<div>' +
        `<p class="grabada__titulo">${escapar(g.nombre)} · paso ${Number(g.paso) || 0}` +
        `${g.estado ? ` · ${MANUAL.estadoHTML(g.estado)}` : ''}${cuando ? ` · <span class="tenue">${escapar(cuando)}</span>` : ''}</p>` +
        `<p class="grabada__cinta">${escapar(MANUAL.normalizarCinta(g.celdas).join(''))}</p>` +
        '</div>';
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'boton boton--mini';
      boton.textContent = 'Usar';
      boton.title = 'Usar esta cinta como cinta inicial';
      boton.addEventListener('click', () => usarCinta(MANUAL.normalizarCinta(g.celdas), `«${g.nombre}»`, g.cabezal));
      item.appendChild(boton);
      return item;
    }));
  }

  // La cinta inicial solo lleva Σ y ^: si la cinta grabada tiene símbolos
  // auxiliares (X, Y, …) que la máquina escribió durante la ejecución, o
  // cualquier otro que no esté en Σ, se cambian por el blanco ^.
  // Si la grabación dice dónde estaba el cabezal, la máquina arranca ahí.
  function usarCinta(nueva, origen, cabezalGrabado) {
    const { cinta: limpia, quitados } = MANUAL.cintaSoloSigma(nueva, simbolosValidos(entradas.sigma));
    const notas = [];
    if (nueva[0] !== BLANCO) notas.push('celda 0 → ^');
    if (quitados.length) notas.push(`${quitados.join(', ')} → ^ (no están en Σ)`);
    if (celdaValida(cabezalGrabado)) {
      cabezal = cabezalGrabado;
      entradas.cabezal.value = cabezal;
    }
    ponerCinta(limpia);
    mostrarAviso(
      `Cinta ${origen} cargada · cabezal en la celda ${cabezal}.${notas.length ? ` ${notas.join(' · ')}.` : ''}`,
      quitados.length > 0
    );
    celdas[cabezal].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  // =========================================================
  // Eventos
  // =========================================================
  formulario.addEventListener('input', (e) => {
    if (e.target === entradas.contenido || e.target === entradas.cantidad) return;
    if (!e.target.matches('input[type="text"]')) return;
    if (e.target === entradas.estados) dibujarPildoras();
    alCambiar();
  });

  // Enter en un campo de texto no envía el formulario
  formulario.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input')) return;
    e.preventDefault();
    if (e.target === entradas.contenido) $('btn-escribir').click();
    if (e.target === entradas.cantidad) $('btn-azar').click();
    if (e.target === entradas.cabezal) ponerCabezal(entradas.cabezal.value);
  });

  // «Más info»: reglas del Modo 2; el navegador recuerda si quedó abierto
  document.querySelectorAll('.mas-info').forEach((boton) => {
    const destino = $(boton.getAttribute('aria-controls'));
    const claveInfo = `mt-manual-${destino.id}`;
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

  // Inicio del cabezal: número de celda, al azar o tocando la cinta
  entradas.cabezal.addEventListener('change', () => ponerCabezal(entradas.cabezal.value));

  $('btn-cabezal-azar').addEventListener('click', () => {
    const azar = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(azar);
    else azar[0] = Math.floor(Math.random() * 2 ** 32);
    ponerCabezal(azar[0] % CELDAS);
    mostrarAviso(`Cabezal en la celda ${cabezal}.`);
  });

  document.querySelectorAll('.toque__opcion').forEach((boton) => {
    boton.addEventListener('click', () => {
      toque = boton.dataset.toque;
      document.querySelectorAll('.toque__opcion').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
      dibujarCinta();
    });
  });

  pildorasInicial.addEventListener('change', (e) => {
    inicial = e.target.value;
    alCambiar();
  });

  pildorasFinal.addEventListener('change', (e) => {
    final = e.target.value;
    alCambiar();
  });

  // Llenar al azar con Σ (y el blanco ^ si está marcado)
  $('btn-azar').addEventListener('click', () => {
    const sigma = simbolosValidos(entradas.sigma);
    if (!sigma.length) {
      mostrarAviso('Falta el alfabeto Σ (sección 01).', true);
      entradas.sigma.focus();
      return;
    }
    const cantidad = Math.min(CELDAS - INICIO, Math.max(1, Math.round(Number(entradas.cantidad.value) || INICIAL.cantidad)));
    entradas.cantidad.value = cantidad;
    ponerCinta(MANUAL.llenarAlAzar(sigma, cantidad, conBlanco.checked));
    mostrarAviso(`${cantidad} ${cantidad === 1 ? 'celda llenada' : 'celdas llenadas'} al azar.`);
  });

  // Escribir el contenido desde la celda 1
  $('btn-escribir').addEventListener('click', () => {
    const simbolos = MANUAL.separarContenido(entradas.contenido.value);
    if (simbolos.length > CELDAS - INICIO) {
      mostrarAviso(`Máximo ${CELDAS - INICIO} símbolos.`, true);
      return;
    }
    const sigma = simbolosValidos(entradas.sigma);
    const fuera = unicos(simbolos.filter((s) => s !== BLANCO && !sigma.includes(s)));
    if (fuera.length) {
      mostrarAviso(`${fuera.join(', ')} no ${fuera.length === 1 ? 'está' : 'están'} en Σ.`, true);
      return;
    }
    ponerCinta(MANUAL.cintaDesde(simbolos));
    mostrarAviso(simbolos.length ? `Escrito desde la celda ${INICIO}.` : 'Cinta en blanco.');
  });

  $('btn-vaciar').addEventListener('click', () => {
    ponerCinta(MANUAL.cintaVacia());
    mostrarAviso('Cinta en blanco.');
  });

  // Tocar una celda: pasa al siguiente símbolo de ^, Σ (o pone ahí el cabezal)
  cintaPrevia.addEventListener('click', (e) => {
    const celda = e.target.closest('.celda-previa');
    if (!celda) return;
    const i = Number(celda.dataset.i);
    if (toque === 'cabezal') {
      ponerCabezal(i);
      return;
    }
    if (i === 0) {
      mostrarAviso('La celda 0 empieza en ^.');
      return;
    }
    const opciones = [BLANCO, ...simbolosValidos(entradas.sigma)];
    const actual = opciones.indexOf(cinta[i]);
    const nueva = cinta.slice();
    nueva[i] = opciones[(actual + 1) % opciones.length];
    ponerCinta(nueva);
  });

  // Abrir un archivo de cinta grabada
  $('btn-abrir-cinta').addEventListener('click', () => archivoCinta.click());
  archivoCinta.addEventListener('change', async () => {
    const archivo = archivoCinta.files[0];
    archivoCinta.value = '';
    if (!archivo) return;
    try {
      const nueva = MANUAL.leerArchivoCinta(await archivo.text());
      usarCinta(nueva, archivo.name);
    } catch (error) {
      mostrarAviso(error.message, true);
    }
  });

  $('btn-restablecer').addEventListener('click', () => {
    if (!confirm('¿Restablecer el formulario?')) return;
    llenar(INICIAL);
    mostrarAviso('Formulario restablecido.');
  });

  // ---------- Comenzar ----------
  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    intentoComenzar = true;
    const { sesion, errores } = revisar();
    if (errores.length) {
      mostrarAviso(errores.length === 1 ? '1 dato por corregir.' : `${errores.length} datos por corregir.`, true);
      irAlError(errores[0]);
      return;
    }

    const anterior = MANUAL.leerSesion();
    if (anterior && anterior.pasos.length &&
        !confirm(`¿Empezar de nuevo? Se pierden los ${anterior.pasos.length} pasos de la ejecución en curso.`)) {
      return;
    }

    if (!MANUAL.guardarSesion(sesion)) {
      mostrarAviso('El navegador no permite guardar datos en esta pestaña; el proyecto debe abrirse con INICIAR.bat.', true);
      return;
    }
    window.location.href = PANTALLA_SANDBOX;
  });

  // =========================================================
  // Inicio
  // =========================================================
  construirCinta();

  const parametros = new URLSearchParams(window.location.search);
  if (parametros.get('aviso') === 'sin-configuracion') {
    setTimeout(() => mostrarAviso('Falta la configuración.', true), 400);
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch (e) { /* algunos navegadores no lo permiten al abrir el archivo directo */ }
  }

  // Si en esta pestaña ya hay una sesión, el formulario se llena con ella
  const guardada = MANUAL.leerSesion();
  if (guardada) {
    llenar(guardada);
    if (guardada.pasos.length) {
      const confs = MANUAL.recorrer(guardada);
      const ultima = confs[confs.length - 1];
      const sit = { final: ' · terminada', paro: ' · paro' }[MANUAL.situacion(guardada, confs)] || '';
      $('en-curso-detalle').textContent =
        `${guardada.nombre || 'Sesión manual'} · ${guardada.pasos.length} ${guardada.pasos.length === 1 ? 'paso' : 'pasos'} · ` +
        `${ultima.estado} · celda ${ultima.cabezal}${sit}`;
      $('en-curso').hidden = false;
    }
  } else {
    llenar(INICIAL);
  }
  dibujarGrabadas();

  // Al volver con "atrás" la página puede venir de caché
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) dibujarGrabadas();
  });
});
