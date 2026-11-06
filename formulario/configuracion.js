// =========================================================
// PESTAÑA DEL FORMULARIO MODO 1
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  // Pantalla de simulación. Cuando la crees, escribe aquí su nombre,
  // por ejemplo 'simulacion.html'.
 const PANTALLAS = {
  simulacion: '../modo1/Simulacion/simulacion.html?modo=automatico',
};

  // Ejemplo del botón "Usar ejemplo": acepta 0ⁿ1ⁿ con n ≥ 1
  const EJEMPLO = {
    nombre: 'Acepta 0ⁿ1ⁿ',
    estados: ['q0', 'q1', 'q2', 'q3', 'q4'],
    alfabetoEntrada: ['0', '1'],
    alfabetoCinta: ['0', '1', 'X', 'Y', 'B'],
    estadoInicial: 'q0',
    blanco: 'B',
    estadosFinales: ['q4'],
    transiciones: [
      { estado: 'q0', lee: '0', nuevoEstado: 'q1', escribe: 'X', mueve: 'R' },
      { estado: 'q0', lee: 'Y', nuevoEstado: 'q3', escribe: 'Y', mueve: 'R' },
      { estado: 'q1', lee: '0', nuevoEstado: 'q1', escribe: '0', mueve: 'R' },
      { estado: 'q1', lee: '1', nuevoEstado: 'q2', escribe: 'Y', mueve: 'L' },
      { estado: 'q1', lee: 'Y', nuevoEstado: 'q1', escribe: 'Y', mueve: 'R' },
      { estado: 'q2', lee: '0', nuevoEstado: 'q2', escribe: '0', mueve: 'L' },
      { estado: 'q2', lee: 'X', nuevoEstado: 'q0', escribe: 'X', mueve: 'R' },
      { estado: 'q2', lee: 'Y', nuevoEstado: 'q2', escribe: 'Y', mueve: 'L' },
      { estado: 'q3', lee: 'Y', nuevoEstado: 'q3', escribe: 'Y', mueve: 'R' },
      { estado: 'q3', lee: 'B', nuevoEstado: 'q4', escribe: 'B', mueve: 'R' },
    ],
    palabra: '0011',
  };

  const FORMULARIO_VACIO = {};

  // ---------- Elementos de la página ----------
  const $ = (id) => document.getElementById(id);

  const formulario = $('formulario');
  const entradas = {
    estados: $('estados'),
    alfabetoEntrada: $('alfabeto-entrada'),
    alfabetoCinta: $('alfabeto-cinta'),
    palabra: $('palabra'),
    nombre: $('nombre'),
  };
  const pildorasInicial = $('pildoras-inicial');
  const pildorasFinales = $('pildoras-finales');
  const listaTrans = $('lista-transiciones');
  const marcoMatriz = $('matriz');
  const resumenErrores = $('resumen-errores');
  const resumenExito = $('resumen-exito');
  const aviso = $('aviso');

  // ---------- Datos que se van llenando ----------
  // Lo que se elige (q0, F y cada transición) se guarda aquí y no solo en
  // la página, para no perderlo mientras escribes los estados
  // (al teclear "q1" la lista pasa un momento por "q").
  const PARTES = ['estado', 'lee', 'nuevoEstado', 'escribe', 'mueve'];
  const MARCADORES = { estado: 'qᵢ', lee: 'X', nuevoEstado: 'qⱼ', escribe: 'Y', mueve: 'D' };
  const ETIQUETAS = {
    estado: 'estado actual qᵢ',
    lee: 'símbolo que lee X',
    nuevoEstado: 'nuevo estado qⱼ',
    escribe: 'símbolo que escribe Y',
    mueve: 'movimiento D',
  };
  const MOVIMIENTOS = [['R', 'R →'], ['L', 'L ←'], ['S', 'S ·']];

  const filaVacia = () => ({ estado: '', lee: '', nuevoEstado: '', escribe: '', mueve: '' });
  const filaEnBlanco = (t) => PARTES.every((p) => !t[p]);

  let estadoInicial = '';
  let finales = new Set();
  let transiciones = [filaVacia()];
  let vista = 'lista';
  let intentoGuardar = false;   // después del primer intento se revisa mientras escribes
  let cambiosSinGuardar = false;
  let ultimaGuardada = null;

  // ---------- Utilidades ----------
  const unicos = (lista) => [...new Set(lista)];
  const escapar = (texto) =>
    String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const estadosValidos = () => unicos(MT.separar(entradas.estados.value).filter(MT.esEstado));
  const simbolosValidos = (entrada) => unicos(MT.separar(entrada.value).filter(MT.esSimbolo));
  const blancoActual = () => MT.BLANCO; // el blanco siempre es B

  // ---------- Mensaje flotante ----------
  let temporizadorAviso;

  function mostrarAviso(texto, esError = false) {
    aviso.textContent = texto;
    aviso.classList.toggle('error', esError);
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), esError ? 5000 : 3800);
  }

  // =========================================================
  // Leer el formulario
  // =========================================================
  function leerDatos() {
    const Q = estadosValidos();
    return {
      nombre: entradas.nombre.value.trim(),
      estados: MT.separar(entradas.estados.value),
      alfabetoEntrada: MT.separar(entradas.alfabetoEntrada.value),
      alfabetoCinta: MT.separar(entradas.alfabetoCinta.value),
      blanco: blancoActual(),
      estadoInicial: Q.includes(estadoInicial) ? estadoInicial : '',
      estadosFinales: Q.filter((q) => finales.has(q)),
      transiciones: transiciones.map((t) => ({ ...t })),
      palabra: entradas.palabra.value.trim(),
    };
  }

  function hayDatos() {
    return ['estados', 'alfabetoEntrada', 'alfabetoCinta', 'palabra', 'nombre']
      .some((k) => entradas[k].value.trim() !== '') ||
      transiciones.some((t) => !filaEnBlanco(t));
  }

  // =========================================================
  // Dibujar las partes que dependen de lo escrito
  // =========================================================

  // Q = { q0, q1 }  (marca en rojo lo inválido o repetido)
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

  // Píldoras de q0 (una) y F (varias)
  function dibujarPildoras() {
    const Q = estadosValidos();
    if (!Q.length) {
      const vacio = '<p class="pildoras__vacio">Primero escribe los estados en la sección 01.</p>';
      pildorasInicial.innerHTML = vacio;
      pildorasFinales.innerHTML = vacio;
      return;
    }
    pildorasInicial.replaceChildren(...Q.map((q) => crearPildora('radio', 'estadoInicial', q, q === estadoInicial)));
    pildorasFinales.replaceChildren(...Q.map((q) => crearPildora('checkbox', 'estadosFinales', q, finales.has(q))));
  }

  function crearPildora(tipo, nombre, valor, marcada) {
    const etiqueta = document.createElement('label');
    etiqueta.className = tipo === 'checkbox' ? 'pildora pildora--final' : 'pildora';
    const entrada = document.createElement('input');
    entrada.type = tipo;
    entrada.name = nombre;
    entrada.value = valor;
    entrada.checked = marcada;
    const texto = document.createElement('span');
    texto.textContent = valor;
    etiqueta.append(entrada, texto);
    return etiqueta;
  }

  // Filas de transiciones:  δ( qi , X ) = ( qj , Y , D )
  function dibujarTransiciones() {
    listaTrans.replaceChildren(...transiciones.map((t, i) => crearFila(i)));
    actualizarOpciones();
  }

  function crearFila(i) {
    const lista = (parte) =>
      `<select class="entrada" data-parte="${parte}" aria-label="Transición ${i + 1}: ${ETIQUETAS[parte]}"></select>`;
    const op = (texto) => `<span class="trans__op">${texto}</span>`;

    const fila = document.createElement('div');
    fila.className = 'trans';
    fila.innerHTML = `
      <span class="trans__num">${i + 1}</span>
      <div class="trans__formula">
        <span class="trans__parte">${op('δ(')}${lista('estado')}${op(',')}${lista('lee')}${op(')')}</span>
        <span class="trans__parte">${op('=')}${op('(')}${lista('nuevoEstado')}${op(',')}${lista('escribe')}${op(',')}${lista('mueve')}${op(')')}</span>
      </div>
      <button type="button" class="trans__quitar" title="Eliminar transición" aria-label="Eliminar transición ${i + 1}">
        <svg viewBox="0 0 24 24"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
      <ul class="campo__errores"></ul>`;
    return fila;
  }

  // Llena cada lista con los estados de Q y los símbolos de Γ
  function actualizarOpciones() {
    const Q = estadosValidos();
    const G = simbolosValidos(entradas.alfabetoCinta);

    [...listaTrans.children].forEach((fila, i) => {
      fila.querySelectorAll('select').forEach((lista) => {
        const parte = lista.dataset.parte;
        let opciones;
        if (parte === 'mueve') opciones = MOVIMIENTOS;
        else if (parte === 'estado' || parte === 'nuevoEstado') opciones = Q.map((q) => [q, q]);
        else opciones = G.map((s) => [s, s]);
        llenarLista(lista, opciones, transiciones[i][parte], MARCADORES[parte]);
      });
    });

    $('nota-transiciones').hidden = Q.length > 0 && G.length > 0;
  }

  function llenarLista(lista, opciones, valor, marcador) {
    lista.replaceChildren(new Option(marcador, ''));
    opciones.forEach(([v, texto]) => lista.add(new Option(texto, v)));
    // Si el valor elegido ya no existe (borraste ese estado), se conserva
    // marcado con "?" para que la revisión lo señale.
    if (valor && !opciones.some(([v]) => v === valor)) {
      const fuera = new Option(`${valor} ?`, valor);
      fuera.className = 'fuera';
      lista.add(fuera);
    }
    lista.value = valor;
    lista.classList.toggle('vacia', !valor);
  }

  // Matriz: filas = estados, columnas = símbolos de Γ
  function dibujarMatriz() {
    const Q = estadosValidos();
    const G = simbolosValidos(entradas.alfabetoCinta);
    if (!Q.length || !G.length) {
      marcoMatriz.innerHTML = '<p class="matriz__vacia">Escribe Q y Γ para ver la matriz de transiciones.</p>';
      return;
    }

    const celdas = new Map();
    transiciones.forEach((t, i) => {
      if (!t.estado || !t.lee) return;
      const clave = `${t.estado}\u0000${t.lee}`;
      if (!celdas.has(clave)) celdas.set(clave, []);
      celdas.get(clave).push(i);
    });

    const mostrar = (v) => escapar(v || '?');
    let html = '<table class="matriz"><thead><tr><th scope="col">δ</th>';
    G.forEach((s) => { html += `<th scope="col">${escapar(s)}</th>`; });
    html += '</tr></thead><tbody>';

    Q.forEach((q) => {
      const marcas = (q === estadoInicial ? '→' : '') + (finales.has(q) ? '*' : '');
      html += `<tr><th scope="row"><span class="matriz__marcas">${marcas}</span>${escapar(q)}</th>`;
      G.forEach((s) => {
        const indices = celdas.get(`${q}\u0000${s}`) || [];
        if (!indices.length) {
          html += `<td class="vacia"><button type="button" data-q="${escapar(q)}" data-s="${escapar(s)}" ` +
            `title="Agregar δ(${escapar(q)}, ${escapar(s)})"><span class="guion">—</span><span class="mas">+</span></button></td>`;
        } else {
          const texto = indices
            .map((i) => `(${mostrar(transiciones[i].nuevoEstado)}, ${mostrar(transiciones[i].escribe)}, ${mostrar(transiciones[i].mueve)})`)
            .join(' / ');
          html += `<td class="${indices.length > 1 ? 'conflicto' : ''}"><button type="button" data-indice="${indices[0]}" ` +
            `title="Editar la transición ${indices[0] + 1}">${texto}</button></td>`;
        }
      });
      html += '</tr>';
    });

    marcoMatriz.innerHTML = `${html}</tbody></table>`;
  }

  // Botón B: blanco con ✓ si ya está en Γ, con + si falta
  function dibujarBotonBlanco() {
    const B = MT.BLANCO;
    const enGamma = MT.separar(entradas.alfabetoCinta.value).includes(B);
    const boton = $('btn-blanco');
    boton.classList.toggle('en-gamma', enGamma);
    boton.title = enGamma ? `${B} ya está en Γ` : `Agregar ${B} al alfabeto de la cinta Γ`;
    boton.setAttribute('aria-label', `Símbolo blanco ${B}: ${boton.title}`);
    $('vista-blanco').innerHTML = enGamma
      ? `${B} ∈ Γ`
      : `${B} ∉ Γ <span class="tenue">· tócalo para agregarlo</span>`;
  }

  // Cinta con la palabra:  B w B
  function dibujarCinta() {
    const B = blancoActual() || 'B';
    const sigma = simbolosValidos(entradas.alfabetoEntrada);
    const w = [...entradas.palabra.value.trim()];
    const celdas = w.length ? [B, ...w, B] : [B, B, B];

    $('celdas-vista').replaceChildren(...celdas.map((s, i) => {
      const celda = document.createElement('span');
      const esPalabra = w.length > 0 && i >= 1 && i <= w.length;
      celda.textContent = /\s/.test(s) ? '␣' : s;
      if (!esPalabra || s === B) celda.classList.add('blanco');
      else if (sigma.length && !sigma.includes(s)) celda.classList.add('mala');
      if (i === 1) celda.classList.add('activa');
      return celda;
    }));

    $('vista-palabra').innerHTML = w.length
      ? `w = ${escapar(w.join(''))}  <span class="tenue">|w| = ${w.length}</span>`
      : 'w = ε <span class="tenue">(palabra vacía)</span>';
  }

  // M = (Q, Σ, Γ, δ, q0, B, F) con lo escrito hasta ahora
  function dibujarTupla() {
    const d = leerDatos();
    const conjunto = (lista) =>
      lista.length ? `{${unicos(lista).map(escapar).join(', ')}}` : '<span class="tenue">{ }</span>';
    const valor = (v) => (v ? escapar(v) : '<span class="tenue">?</span>');
    const n = transiciones.filter((t) => !filaEnBlanco(t)).length;

    $('tupla').innerHTML =
      `M = (${conjunto(d.estados)}, ${conjunto(d.alfabetoEntrada)}, ${conjunto(d.alfabetoCinta)}, δ, ` +
      `${valor(d.estadoInicial)}, ${valor(d.blanco)}, ${conjunto(d.estadosFinales)})<br>` +
      `<span class="tenue">δ con ${n} ${n === 1 ? 'transición' : 'transiciones'} · ` +
      `w = ${d.palabra ? escapar(d.palabra) : 'ε'}</span>`;
  }

  function actualizarVistas() {
    vistaConjunto($('vista-estados'), 'Q', entradas.estados.value, MT.esEstado);
    vistaConjunto($('vista-sigma'), 'Σ', entradas.alfabetoEntrada.value, MT.esSimbolo);
    vistaConjunto($('vista-gamma'), 'Γ', entradas.alfabetoCinta.value, MT.esSimbolo);
    dibujarBotonBlanco();
    dibujarCinta();
    dibujarTupla();

    const n = transiciones.filter((t) => !filaEnBlanco(t)).length;
    $('conteo-transiciones').textContent = `${n} ${n === 1 ? 'transición' : 'transiciones'}`;
    $('vista-archivo').textContent = MT.nombreArchivo(entradas.nombre.value);

    if (vista === 'matriz') dibujarMatriz();
  }

  // Cada vez que algo cambia
  function alCambiar() {
    cambiosSinGuardar = true;
    resumenExito.hidden = true;
    actualizarVistas();
    if (intentoGuardar) revisar();
  }

  // =========================================================
  // Revisión de los datos
  // =========================================================
  const SECCION_DE_CAMPO = {
    estados: 'estados',
    alfabetoEntrada: 'alfabetos',
    alfabetoCinta: 'alfabetos',
    blanco: 'alfabetos',
    estadoInicial: 'inicioFin',
    estadosFinales: 'inicioFin',
    transiciones: 'transiciones',
    palabra: 'palabra',
    general: 'guardar',
  };
  const NUMERO_SECCION = { estados: '01', alfabetos: '02', inicioFin: '03', transiciones: '04', palabra: '05', guardar: '' };
  const ELEMENTO_DE_CAMPO = {
    estados: entradas.estados,
    alfabetoEntrada: entradas.alfabetoEntrada,
    alfabetoCinta: entradas.alfabetoCinta,
    blanco: $('btn-blanco'),
    palabra: entradas.palabra,
    estadoInicial: pildorasInicial,
    estadosFinales: pildorasFinales,
  };

  function revisar() {
    const resultado = MT.validar(leerDatos());
    mostrarErrores(resultado.errores);
    return resultado;
  }

  function agregarMensaje(lista, texto) {
    const item = document.createElement('li');
    item.textContent = texto;
    lista.appendChild(item);
  }

  function limpiarErrores() {
    formulario.querySelectorAll('.campo__errores').forEach((lista) => lista.replaceChildren());
    formulario.querySelectorAll('.invalida').forEach((el) => el.classList.remove('invalida'));
    formulario.querySelectorAll('.con-error, .completa').forEach((el) => el.classList.remove('con-error', 'completa'));
    resumenErrores.hidden = true;
  }

  function mostrarErrores(errores) {
    limpiarErrores();
    const porSeccion = {};

    errores.forEach((err) => {
      const seccion = SECCION_DE_CAMPO[err.campo] || 'guardar';
      porSeccion[seccion] = (porSeccion[seccion] || 0) + 1;

      if (err.campo === 'transiciones' && err.indice !== undefined) {
        // error de una fila: mensaje debajo de la fila y listas en rojo
        const fila = listaTrans.children[err.indice];
        if (!fila) return;
        fila.classList.add('con-error');
        agregarMensaje(fila.querySelector('.campo__errores'), err.mensaje.replace(/^Transición \d+: /, ''));
        (err.partes || []).forEach((p) => fila.querySelector(`[data-parte="${p}"]`)?.classList.add('invalida'));

        // en las transiciones repetidas también se marca la otra fila
        const otra = err.relacionada !== undefined ? listaTrans.children[err.relacionada] : null;
        if (otra) {
          otra.classList.add('con-error');
          ['estado', 'lee'].forEach((p) => otra.querySelector(`[data-parte="${p}"]`).classList.add('invalida'));
        }
      } else {
        const lista = formulario.querySelector(`[data-errores="${err.campo}"]`);
        if (lista) agregarMensaje(lista, err.mensaje);
        ELEMENTO_DE_CAMPO[err.campo]?.classList.add('invalida');
      }
    });

    // Marca de cada sección: "2 por corregir" o "✓ listo"
    formulario.querySelectorAll('.seccion[data-seccion]').forEach((sec) => {
      const n = porSeccion[sec.dataset.seccion] || 0;
      const marca = sec.querySelector('[data-marca]');
      sec.classList.toggle('con-error', n > 0);
      sec.classList.toggle('completa', n === 0 && sec.dataset.seccion !== 'guardar');
      if (marca) marca.textContent = n === 0 ? '✓ listo' : `${n} por corregir`;
    });

    // Resumen junto al botón de guardar
    const lista = $('resumen-lista');
    lista.replaceChildren();
    resumenErrores.hidden = errores.length === 0;
    if (!errores.length) return;

    $('resumen-titulo').textContent = errores.length === 1
      ? 'No se puede guardar todavía: hay 1 dato por corregir.'
      : `No se puede guardar todavía: hay ${errores.length} datos por corregir.`;

    const MAXIMO = 8;
    errores.slice(0, MAXIMO).forEach((err) => {
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
    if (errores.length > MAXIMO) {
      agregarMensaje(lista, `… y ${errores.length - MAXIMO} más.`);
    }
  }

  // Lleva la vista al dato que hay que corregir
  function irAlError(err) {
    let destino;
    if (err.campo === 'transiciones') {
      cambiarVista('lista');
      const fila = err.indice !== undefined ? listaTrans.children[err.indice] : null;
      destino = fila
        ? fila.querySelector(`[data-parte="${(err.partes || [])[0]}"]`) || fila.querySelector('select')
        : $('btn-agregar');
    } else if (err.campo === 'estadoInicial' || err.campo === 'estadosFinales') {
      destino = ELEMENTO_DE_CAMPO[err.campo].querySelector('input') || entradas.estados;
    } else {
      destino = ELEMENTO_DE_CAMPO[err.campo] || $('btn-guardar');
    }
    destino.scrollIntoView({ behavior: 'smooth', block: 'center' });
    destino.focus({ preventScroll: true });
  }

  // =========================================================
  // Llenar el formulario (vacío, ejemplo o máquina guardada)
  // =========================================================
  function llenar(m) {
    const texto = (lista) => (lista || []).join(', ');
    entradas.nombre.value = m.nombre || '';
    entradas.estados.value = texto(m.estados);
    entradas.alfabetoEntrada.value = texto(m.alfabetoEntrada);
    entradas.alfabetoCinta.value = texto(m.alfabetoCinta);
    entradas.palabra.value = Array.isArray(m.palabra) ? m.palabra.join('') : (m.palabra || '');

    estadoInicial = m.estadoInicial || '';
    finales = new Set(m.estadosFinales || []);
    transiciones = (m.transiciones || []).map((t) => ({ ...filaVacia(), ...t }));
    if (!transiciones.length) transiciones.push(filaVacia());

    intentoGuardar = false;
    limpiarErrores();
    resumenExito.hidden = true;
    dibujarPildoras();
    dibujarTransiciones();
    actualizarVistas();
  }

  function agregarFila(valores = {}) {
    // si la última fila está en blanco, se usa esa en lugar de crear otra
    const ultima = transiciones[transiciones.length - 1];
    if (ultima && filaEnBlanco(ultima)) Object.assign(ultima, valores);
    else transiciones.push({ ...filaVacia(), ...valores });
    dibujarTransiciones();
    alCambiar();
    return listaTrans.lastElementChild;
  }

  function cambiarVista(nueva) {
    vista = nueva;
    const esLista = nueva === 'lista';
    $('pestana-lista').setAttribute('aria-selected', String(esLista));
    $('pestana-matriz').setAttribute('aria-selected', String(!esLista));
    $('panel-lista').hidden = !esLista;
    $('panel-matriz').hidden = esLista;
    if (!esLista) dibujarMatriz();
  }

  function resaltarFila(fila) {
    fila.classList.remove('resaltada');
    void fila.offsetWidth; // reinicia la animación
    fila.classList.add('resaltada');
  }

  // =========================================================
  // Eventos
  // =========================================================

  // Campos de texto
  formulario.addEventListener('input', (e) => {
    if (!e.target.matches('input[type="text"]')) return;
    if (e.target === entradas.estados) dibujarPildoras();
    if (e.target === entradas.estados || e.target === entradas.alfabetoCinta) actualizarOpciones();
    alCambiar();
  });

  // Enter en un campo de texto no envía el formulario
  formulario.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[type="text"]')) e.preventDefault();
  });

  // q0 y F
  pildorasInicial.addEventListener('change', (e) => {
    estadoInicial = e.target.value;
    alCambiar();
  });

  pildorasFinales.addEventListener('change', (e) => {
    if (e.target.checked) finales.add(e.target.value);
    else finales.delete(e.target.value);
    alCambiar();
  });

  // Botón "Σ y B": agrega a Γ lo que le falte (Σ primero y B al final)
  $('btn-completar-gamma').addEventListener('click', () => {
    const sigma = simbolosValidos(entradas.alfabetoEntrada);
    const B = MT.BLANCO;
    const gamma = MT.separar(entradas.alfabetoCinta.value);

    const nuevo = unicos([...sigma, ...gamma.filter((s) => s !== B), B]);
    if (nuevo.length === gamma.length && nuevo.every((s) => gamma.includes(s))) {
      mostrarAviso(sigma.length ? `Γ ya contiene a Σ y al blanco ${B}.` : 'Primero escribe Σ.');
      return;
    }
    entradas.alfabetoCinta.value = nuevo.join(', ');
    actualizarOpciones();
    alCambiar();
  });

  // Botón "B": el blanco es fijo; al tocarlo se agrega a Γ si falta
  $('btn-blanco').addEventListener('click', () => {
    const B = MT.BLANCO;
    const gamma = MT.separar(entradas.alfabetoCinta.value);
    if (gamma.includes(B)) {
      mostrarAviso(`${B} ya está en Γ. El símbolo blanco siempre es ${B}.`);
      return;
    }
    entradas.alfabetoCinta.value = [...gamma, B].join(', ');
    actualizarOpciones();
    alCambiar();
  });

  // Transiciones: elegir una opción
  listaTrans.addEventListener('change', (e) => {
    const lista = e.target.closest('select');
    if (!lista) return;
    const i = [...listaTrans.children].indexOf(lista.closest('.trans'));
    transiciones[i][lista.dataset.parte] = lista.value;
    lista.classList.toggle('vacia', !lista.value);
    alCambiar();
  });

  // Transiciones: eliminar una fila
  listaTrans.addEventListener('click', (e) => {
    const boton = e.target.closest('.trans__quitar');
    if (!boton) return;
    const i = [...listaTrans.children].indexOf(boton.closest('.trans'));
    transiciones.splice(i, 1);
    if (!transiciones.length) transiciones.push(filaVacia());
    dibujarTransiciones();
    alCambiar();
    const siguiente = listaTrans.children[Math.min(i, listaTrans.children.length - 1)];
    siguiente.querySelector('.trans__quitar').focus();
  });

  $('btn-agregar').addEventListener('click', () => {
    const fila = agregarFila();
    fila.querySelector('select').focus();
  });

  // Pestañas
  $('pestana-lista').addEventListener('click', () => cambiarVista('lista'));
  $('pestana-matriz').addEventListener('click', () => cambiarVista('matriz'));

  // Clic en la matriz: editar esa transición o agregar una nueva
  marcoMatriz.addEventListener('click', (e) => {
    const celda = e.target.closest('button');
    if (!celda) return;

    let fila;
    let destino;
    if (celda.dataset.indice !== undefined) {
      cambiarVista('lista');
      fila = listaTrans.children[Number(celda.dataset.indice)];
      destino = fila.querySelector('select');
    } else {
      fila = agregarFila({ estado: celda.dataset.q, lee: celda.dataset.s });
      cambiarVista('lista');
      destino = fila.querySelector('[data-parte="nuevoEstado"]');
    }
    fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resaltarFila(fila);
    destino.focus({ preventScroll: true });
  });

  // ---------- Guardar ----------
  formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    intentoGuardar = true;

    const { maquina, errores } = revisar();
    if (errores.length) {
      resumenExito.hidden = true;
      mostrarAviso(
        errores.length === 1
          ? 'Hay 1 dato por corregir antes de guardar.'
          : `Hay ${errores.length} datos por corregir antes de guardar.`,
        true
      );
      irAlError(errores[0]);
      return;
    }

    // Todo es válido: se guarda en la pestaña y se descarga el .json
    MT.guardarEnSesion(maquina);
    const archivo = MT.descargar(maquina);
    ultimaGuardada = maquina;
    cambiosSinGuardar = false;

    $('exito-archivo').textContent = archivo;
    resumenExito.hidden = false;
    resumenExito.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mostrarAviso(`Configuración guardada como ${archivo}.`);
  });

  $('btn-descargar').addEventListener('click', () => {
    if (ultimaGuardada) MT.descargar(ultimaGuardada);
  });

  $('btn-simular').addEventListener('click', () => {
    if (PANTALLAS.simulacion) {
      window.location.href = PANTALLAS.simulacion;
    } else {
      mostrarAviso('La pantalla de simulación aún está en construcción.');
    }
  });

  // ---------- Ejemplo y limpiar ----------
  $('btn-ejemplo').addEventListener('click', () => {
    if (hayDatos() && !confirm('Se reemplazarán los datos que escribiste por el ejemplo. ¿Continuar?')) return;
    llenar(EJEMPLO);
    cambiosSinGuardar = true;
    mostrarAviso('Ejemplo cargado: máquina que acepta 0ⁿ1ⁿ.');
  });

  $('btn-limpiar').addEventListener('click', () => {
    if (hayDatos() && !confirm('Se borrarán todos los datos del formulario. ¿Continuar?')) return;
    llenar(FORMULARIO_VACIO);
    cambiosSinGuardar = false;
    entradas.estados.focus();
  });

  // ---------- Volver ----------
  $('btn-volver').addEventListener('click', (e) => {
    if (cambiosSinGuardar && hayDatos() && !confirm('Tienes datos sin guardar. ¿Salir de todos modos?')) {
      e.preventDefault();
    }
  });

  // ---------- Inicio ----------
  // Si en esta pestaña ya hay una máquina guardada, se abre para editarla;
  // "Nueva configuración" la borra antes de venir, así que llega vacío.
  llenar(MT.leerDeSesion() || FORMULARIO_VACIO);
  cambiosSinGuardar = false;
});
