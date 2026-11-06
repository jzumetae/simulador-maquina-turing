// =========================================================
// Simulador · Máquina de Turing — Modo 2: datos de la ejecución manual
// =========================================================
//
// Lo usan las dos pantallas del Modo 2: la preparación (manual.html)
// y el sandbox (Sandbox/sandbox.html). Se carga DESPUÉS de
// formulario/maquina.js: usa MT para las 50 celdas, la validación
// y el archivo .json del Modo 1.
//
// La sesión se guarda en la pestaña (sessionStorage, clave 'mt-manual'):
//
// {
//   "nombre": "Mi sesión",
//   "sigma": ["0", "1"],             // alfabeto Σ (con él se llena la cinta)
//   "auxiliares": ["X"],             // símbolos extra que se pueden escribir
//   "estados": ["q0", "q1", "q2"],   // Q
//   "inicial": "q0",                 // estado inicial
//   "final": "q2",                   // estado final al que hay que llegar
//   "cinta": ["^", "0", "1", ...],   // las 50 celdas al empezar (^ = blanco)
//   "cabezal": 1,                    // celda (0 a 49) donde arranca la máquina
//   "pasos": [                      // lo que el usuario decidió en cada paso
//     { "escribe": "X", "mueve": "D", "nuevoEstado": "q1" }
//   ]
// }
//
// Cada paso guarda solo la decisión. El estado, la celda y el símbolo
// leído se obtienen repitiendo los pasos desde la cinta inicial.
//
// Movimientos del Modo 2: D (derecha), I (izquierda) y S (no se mueve:
// estado de paro, la ejecución termina). Al exportar al Modo 1 se
// escriben como R, L y S, y el blanco ^ se escribe como B.

const MANUAL = (() => {
  const BLANCO = '^';               // blanco del Modo 2 (□ = ^)
  const BLANCO_MODO1 = MT.BLANCO;   // blanco del Modo 1 (B)
  const CELDAS = MT.CELDAS;         // 50 celdas: de la 0 a la 49
  const INICIO = MT.INICIO_PALABRA; // celda donde empieza el cabezal si no se elige otra
  const CLAVE_SESION = 'mt-manual';
  const CLAVE_GRABADAS = 'mt-cintas-grabadas';
  const MAX_GRABADAS = 30;
  const DESPLAZAMIENTO = { D: 1, I: -1, S: 0 };
  const A_MODO1 = { D: 'R', I: 'L', S: 'S' };
  const NOMBRE_MOVIMIENTO = { D: 'derecha', I: 'izquierda', S: 'no se mueve (paro)' };

  // ---------- Utilidades ----------
  const unicos = (lista) => [...new Set(lista)];
  const repetidos = (lista) => unicos(lista.filter((x, i) => lista.indexOf(x) !== i));
  const caracteres = (texto) => [...String(texto)];
  const clave = (estado, simbolo) => `${estado}\u0001${simbolo}`;
  const cintaVacia = () => Array(CELDAS).fill(BLANCO);
  const aModo1 = (s) => (s === BLANCO ? BLANCO_MODO1 : s);

  const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // "q12" → q<sub>12</sub>
  function estadoHTML(estado) {
    const partes = /^(.*?\D)(\d+)$/.exec(estado);
    return partes ? `${escapar(partes[1])}<sub>${escapar(partes[2])}</sub>` : escapar(estado);
  }

  // Acepta una lista ["0","1"] o un texto "0, 1"
  function lista(valor) {
    if (Array.isArray(valor)) return valor.map((x) => String(x).trim()).filter((x) => x !== '');
    return MT.separar(valor);
  }

  // "a", "a y b", "a, b y c"
  function unirConY(elementos) {
    if (elementos.length <= 1) return elementos.join('');
    return `${elementos.slice(0, -1).join(', ')} y ${elementos[elementos.length - 1]}`;
  }

  // Γ del Modo 2: Σ, los auxiliares y el blanco
  const gamma = (s) => unicos([...s.sigma, ...s.auxiliares, BLANCO]);

  // La cinta como lista de 50 símbolos (acepta lista o texto "^0110^…")
  function normalizarCinta(valor) {
    const celdas = Array.isArray(valor) ? valor.map(String) : caracteres(valor ?? '');
    const cinta = cintaVacia();
    celdas.slice(0, CELDAS).forEach((s, i) => { cinta[i] = s === '' ? BLANCO : s; });
    return cinta;
  }

  // ---------- Revisión de la configuración ----------
  //
  // Recibe los datos (del formulario o de la pestaña) y devuelve
  //   { sesion, errores }
  // errores: lista de { campo, mensaje }; sesion es null si hay errores.
  function validar(datos) {
    const errores = [];
    const error = (campo, mensaje) => errores.push({ campo, mensaje });
    datos = datos && typeof datos === 'object' ? datos : {};

    // Símbolos de un solo carácter, sin el blanco ni la B del Modo 1
    const simbolos = (campo, nombre) => {
      const arr = lista(datos[campo]);
      arr.forEach((s) => {
        if (s === BLANCO) {
          error(campo, `${BLANCO} es el blanco y ya está en la cinta: no va en ${nombre}.`);
        } else if (s === BLANCO_MODO1) {
          error(campo, `${BLANCO_MODO1} está reservado: en el Modo 1 representa al blanco.`);
        } else if (caracteres(s).length > 1 && /\s/.test(s)) {
          error(campo, `«${s}» tiene espacios: los símbolos van separados por comas.`);
        } else if (caracteres(s).length > 1) {
          error(campo, `«${s}» tiene ${caracteres(s).length} caracteres: cada símbolo es un solo carácter.`);
        } else if (!MT.esSimbolo(s)) {
          error(campo, `«${s}» no se puede usar como símbolo.`);
        }
      });
      repetidos(arr).forEach((s) => error(campo, `El símbolo ${s} está repetido en ${nombre}.`));
      return unicos(arr);
    };

    const nombre = String(datos.nombre ?? '').trim().slice(0, 60);

    // ----- Alfabeto -----
    const sigma = simbolos('sigma', 'Σ');
    if (sigma.length === 0) error('sigma', 'El alfabeto Σ necesita al menos un símbolo.');

    const auxiliares = simbolos('auxiliares', 'los símbolos auxiliares');
    const enAmbos = auxiliares.filter((s) => sigma.includes(s));
    if (enAmbos.length) {
      error('auxiliares', `${unirConY(enAmbos)} ya ${enAmbos.length === 1 ? 'está' : 'están'} en Σ: no hace falta repetir${enAmbos.length === 1 ? 'lo' : 'los'}.`);
    }

    // ----- Estados -----
    const estados = lista(datos.estados);
    estados.forEach((q) => {
      if (/\s/.test(q)) error('estados', `«${q}» tiene espacios: los estados van separados por comas.`);
      else if (!MT.esEstado(q)) error('estados', `«${q}» no es un nombre válido: solo letras, números o _.`);
    });
    repetidos(estados).forEach((q) => error('estados', `El estado ${q} está repetido.`));
    if (unicos(estados).length < 2) {
      error('estados', 'Q necesita al menos dos estados: el inicial y el final.');
    }

    const inicial = String(datos.inicial ?? '').trim();
    const final = String(datos.final ?? '').trim();
    if (!inicial) error('inicial', 'Falta el estado inicial.');
    else if (!estados.includes(inicial)) error('inicial', `El estado inicial ${inicial} no está en Q.`);
    if (!final) error('final', 'Falta el estado final (la meta de la máquina).');
    else if (!estados.includes(final)) error('final', `El estado final ${final} no está en Q.`);
    else if (final === inicial) error('final', 'El estado final debe ser distinto del inicial.');

    // ----- Cinta inicial: solo símbolos de Σ y blancos -----
    const cinta = normalizarCinta(datos.cinta);
    if (cinta[0] !== BLANCO) {
      error('cinta', `La celda 0 debe empezar en blanco (${BLANCO}), igual que en el Modo 1.`);
    }
    if (sigma.length) {
      const fuera = unicos(cinta.filter((s) => s !== BLANCO && !sigma.includes(s)));
      if (fuera.length === 1) error('cinta', `La cinta usa ${fuera[0]}, que no está en Σ.`);
      if (fuera.length > 1) error('cinta', `La cinta usa ${unirConY(fuera)}, que no están en Σ.`);
    }

    // ----- Celda donde arranca la máquina (en su estado inicial) -----
    const cabezal = Number(datos.cabezal ?? INICIO);
    if (!Number.isInteger(cabezal) || cabezal < 0 || cabezal > CELDAS - 1) {
      error('cabezal', `El cabezal debe empezar en una celda de 0 a ${CELDAS - 1}.`);
    }

    if (errores.length) return { sesion: null, errores };

    const sesion = {
      nombre,
      sigma,
      auxiliares,
      estados: unicos(estados),
      inicial,
      final,
      cinta,
      cabezal,
      pasos: [],
    };

    // Pasos (al leer una sesión guardada): se conservan mientras sean válidos
    if (Array.isArray(datos.pasos)) sesion.pasos = pasosValidos(sesion, datos.pasos);

    return { sesion, errores };
  }

  // Revisa los pasos repitiéndolos; se detiene en el primero que no se
  // pueda aplicar o cuando la ejecución ya había terminado.
  function pasosValidos(sesion, pasos) {
    const simbolosCinta = gamma(sesion);
    const validos = [];
    let estado = sesion.inicial;
    let cabezal = sesion.cabezal;
    for (const p of pasos) {
      if (!p || typeof p !== 'object') break;
      const paso = {
        escribe: String(p.escribe ?? ''),
        mueve: String(p.mueve ?? '').toUpperCase(),
        nuevoEstado: String(p.nuevoEstado ?? ''),
      };
      if (!simbolosCinta.includes(paso.escribe)) break;
      if (!(paso.mueve in DESPLAZAMIENTO)) break;
      if (!sesion.estados.includes(paso.nuevoEstado)) break;
      const destino = cabezal + DESPLAZAMIENTO[paso.mueve];
      if (destino < 0 || destino > CELDAS - 1) break;
      validos.push(paso);
      estado = paso.nuevoEstado;
      cabezal = destino;
      if (estado === sesion.final || paso.mueve === 'S') break; // ya terminó
    }
    return validos;
  }

  // ---------- Repetir los pasos ----------
  //
  // Devuelve la lista de configuraciones: la inicial y una por paso.
  //   { estado, cabezal, cinta, paso }
  // paso (desde la segunda) dice cómo se llegó:
  //   { numero, estado, celda, lee, escribe, mueve, nuevoEstado }
  function recorrer(sesion) {
    const cinta = sesion.cinta.slice();
    let estado = sesion.inicial;
    let cabezal = sesion.cabezal;
    const confs = [{ estado, cabezal, cinta: cinta.slice(), paso: null }];

    sesion.pasos.forEach((p, i) => {
      const lee = cinta[cabezal];
      const celda = cabezal;
      const desde = estado;
      cinta[cabezal] = p.escribe;
      estado = p.nuevoEstado;
      cabezal = Math.min(CELDAS - 1, Math.max(0, cabezal + DESPLAZAMIENTO[p.mueve]));
      confs.push({
        estado,
        cabezal,
        cinta: cinta.slice(),
        paso: { numero: i + 1, estado: desde, celda, lee, escribe: p.escribe, mueve: p.mueve, nuevoEstado: p.nuevoEstado },
      });
    });
    return confs;
  }

  // 'lista' (sin pasos), 'activa', 'final' (llegó al estado final) o 'paro' (eligió S)
  function situacion(sesion, confs) {
    const ultima = confs[confs.length - 1];
    if (!ultima.paso) return 'lista';
    if (ultima.estado === sesion.final) return 'final';
    if (ultima.paso.mueve === 'S') return 'paro';
    return 'activa';
  }

  // ---------- Reglas δ que van quedando ----------
  //
  // Map: 'estado + símbolo leído' → { estado, lee, acciones }
  // acciones: las respuestas distintas que dio el usuario a ese par,
  //   { nuevoEstado, escribe, mueve, pasos: [números de paso] }
  // Si un par tiene más de una acción, la máquina no es determinista.
  function reglas(confs) {
    const mapa = new Map();
    confs.forEach(({ paso: p }) => {
      if (!p) return;
      const k = clave(p.estado, p.lee);
      if (!mapa.has(k)) mapa.set(k, { estado: p.estado, lee: p.lee, acciones: [] });
      const regla = mapa.get(k);
      let accion = regla.acciones.find((a) => mismaAccion(a, p));
      if (!accion) {
        accion = { nuevoEstado: p.nuevoEstado, escribe: p.escribe, mueve: p.mueve, pasos: [] };
        regla.acciones.push(accion);
      }
      accion.pasos.push(p.numero);
    });
    return mapa;
  }

  const mismaAccion = (a, b) => a.nuevoEstado === b.nuevoEstado && a.escribe === b.escribe && a.mueve === b.mueve;

  function conflictos(mapa) {
    return [...mapa.values()].filter((r) => r.acciones.length > 1);
  }

  // δ(q1, a) = (q2, X, D) en texto
  const deltaTexto = (estado, lee, a) => `δ(${estado}, ${lee}) = (${a.nuevoEstado}, ${a.escribe}, ${a.mueve})`;

  // ---------- Configuración para el Modo 1 ----------
  //
  // Arma la máquina M = (Q, Σ, Γ, δ, q0, B, F) con lo registrado.
  // Devuelve { maquina, errores, conflictos, palabra }.
  function configuracionModo1(sesion, confs) {
    const mapa = reglas(confs);
    const enConflicto = conflictos(mapa);
    const errores = [];

    if (!sesion.pasos.length) {
      errores.push({ mensaje: 'Aún no hay pasos: cada paso se convierte en una transición δ.' });
    }
    enConflicto.forEach((r) => {
      const detalle = r.acciones.map((a) => `${deltaTexto(r.estado, r.lee, a)} (paso ${a.pasos.join(', ')})`);
      errores.push({
        mensaje: `No es determinista: para δ(${r.estado}, ${r.lee}) la máquina hizo cosas distintas: ${unirConY(detalle)}. ` +
          'Hay que deshacer pasos hasta que cada par tenga una sola respuesta.',
      });
    });

    // La palabra es lo que había en la cinta desde la celda donde arrancó el
    // cabezal hasta la última no blanca: en el Modo 1 la máquina empieza sobre
    // la primera celda de la palabra. Para «Ejecutar en Modo 1» la cinta se
    // corre para que esa palabra quede desde la celda 1, donde el Modo 1 la toma.
    const k = sesion.cabezal;
    let ultima = -1;
    for (let i = CELDAS - 1; i >= k; i--) {
      if (sesion.cinta[i] !== BLANCO) {
        ultima = i;
        break;
      }
    }
    const palabra = ultima >= k ? sesion.cinta.slice(k, ultima + 1).map(aModo1) : [];
    const cintaModo1 = Array(CELDAS).fill(BLANCO_MODO1);
    palabra.forEach((s, i) => { if (INICIO + i < CELDAS) cintaModo1[INICIO + i] = s; });

    const transiciones = [];
    mapa.forEach((r) => {
      const a = r.acciones[0];
      transiciones.push({
        estado: r.estado,
        lee: aModo1(r.lee),
        nuevoEstado: a.nuevoEstado,
        escribe: aModo1(a.escribe),
        mueve: A_MODO1[a.mueve],
      });
    });

    const datos = {
      nombre: sesion.nombre || 'Sesión manual',
      estados: sesion.estados.slice(),
      alfabetoEntrada: sesion.sigma.slice(),
      alfabetoCinta: unicos([...sesion.sigma, ...sesion.auxiliares, BLANCO_MODO1]),
      estadoInicial: sesion.inicial,
      blanco: BLANCO_MODO1,
      estadosFinales: [sesion.final],
      transiciones,
      palabra,
    };

    const extra = { conflictos: enConflicto, palabra, cintaModo1 };
    if (errores.length) return { maquina: null, errores, ...extra };

    // Misma revisión que hace el Modo 1 al cargar un archivo
    const revision = MT.validar(datos);
    if (revision.errores.length) {
      return { maquina: null, errores: revision.errores, ...extra };
    }
    return { maquina: revision.maquina, errores: [], ...extra };
  }

  // ---------- Comprobar contra el Modo 1 ----------
  //
  // Ejecuta la máquina exportada con las reglas del Modo 1 (empieza en la
  // celda 1, acepta al entrar a un estado final, se detiene si no hay δ)
  // y la compara con la sesión, paso por paso.
  // Devuelve { tipo: 'ok' | 'aviso', corto, texto } (corto: una línea para el panel).
  function comprobar(maquina, sesion, confs) {
    const delta = new Map(maquina.transiciones.map((t) => [clave(t.estado, t.lee), t]));
    // En el Modo 1 la palabra queda desde la celda 1 y lo que está fuera de ella
    // se lee como blanco: la celda j del Modo 1 es la celda j + d de la sesión.
    const d = sesion.cabezal - INICIO;
    const cinta = Array(CELDAS).fill(maquina.blanco);
    maquina.palabra.forEach((s, i) => { cinta[INICIO + i] = s; });
    let estado = maquina.estadoInicial;
    let cabezal = INICIO;
    const n = sesion.pasos.length;
    const mover = { R: 1, L: -1, S: 0 };

    for (let k = 0; k <= n; k++) {
      // Mismo estado, misma celda (con el corrimiento) y mismo símbolo leído
      const conf = confs[k];
      const leeSesion = aModo1(conf.cinta[conf.cabezal]);
      if (conf.estado !== estado || conf.cabezal !== cabezal + d || leeSesion !== cinta[cabezal]) {
        const motivo = conf.estado === estado && conf.cabezal === cabezal + d
          ? ` En la celda ${conf.cabezal} la ejecución manual lee ${conf.cinta[conf.cabezal]} y el Modo 1 lee ${cinta[cabezal]}` +
            (d > 0 ? `: el Modo 1 solo toma la cinta desde la celda ${sesion.cabezal} y lo de antes lo lee como blanco.` : '.')
          : '';
        return {
          tipo: 'aviso',
          corto: `Exportable · cambia en el paso ${k}`,
          texto: `El Modo 1 se separa de la ejecución manual en el paso ${k}.${motivo}`,
        };
      }
      if (k === n) break;
      if (maquina.estadosFinales.includes(estado)) {
        return { tipo: 'aviso', corto: `Exportable · se detiene en el paso ${k}`, texto: `En el Modo 1 la máquina se detendría antes, en el paso ${k}, al entrar al estado final.` };
      }
      const t = delta.get(clave(estado, cinta[cabezal]));
      if (!t) return { tipo: 'aviso', corto: `Exportable · se detiene en el paso ${k}`, texto: `En el Modo 1 la máquina se detendría en el paso ${k}.` };
      const destino = cabezal + mover[t.mueve];
      if (destino < 0 || destino > CELDAS - 1) {
        return {
          tipo: 'aviso',
          corto: `Exportable · sale de la cinta en el paso ${k + 1}`,
          texto: `En el Modo 1 la palabra queda desde la celda 1, y en el paso ${k + 1} el cabezal saldría de la cinta.`,
        };
      }
      cinta[cabezal] = t.escribe;
      estado = t.nuevoEstado;
      cabezal = destino;
    }

    const pasos = `${n} ${n === 1 ? 'paso' : 'pasos'}`;
    const losPasos = n === 1 ? 'el paso' : `los ${pasos}`;
    if (maquina.estadosFinales.includes(estado)) {
      return {
        tipo: 'ok',
        corto: `Lista · el Modo 1 la acepta en ${pasos}`,
        texto: `El Modo 1 reproduce ${losPasos} y termina en ${estado}: palabra aceptada.`,
      };
    }
    const siguiente = delta.get(clave(estado, cinta[cabezal]));
    const sit = situacion(sesion, confs);
    if (!siguiente) {
      const motivo = sit === 'paro'
        ? `se detiene en ${estado} igual que la ejecución manual (en el Modo 1 aparece como «Rechazada» porque ${estado} no es final).`
        : `se detiene en ${estado}: no hay δ(${estado}, ${cinta[cabezal]}) porque aún no está definida.`;
      return {
        tipo: sit === 'paro' ? 'ok' : 'aviso',
        corto: sit === 'paro' ? `Lista · el Modo 1 se detiene igual (${pasos})` : `Exportable · reproduce ${pasos}, falta terminar`,
        texto: `El Modo 1 reproduce ${losPasos} y ${motivo}`,
      };
    }
    const t = `δ(${estado}, ${cinta[cabezal]}) = (${siguiente.nuevoEstado}, ${siguiente.escribe}, ${siguiente.mueve})`;
    return {
      tipo: 'aviso',
      corto: sit === 'paro' ? 'Exportable · el Modo 1 no pararía con la S' : `Exportable · el Modo 1 sigue solo tras ${pasos}`,
      texto: sit === 'paro'
        ? `El Modo 1 reproduce ${losPasos}, pero no se detendría en la S del último paso: seguiría con ${t}.`
        : `El Modo 1 reproduce ${losPasos} y después continúa solo con ${t}.`,
    };
  }

  // ---------- Registro en texto (.txt) ----------
  function contenido(conf) {
    const usadas = conf.cinta.map((s, i) => (s !== BLANCO ? i : -1)).filter((i) => i >= 0);
    const desde = Math.min(conf.cabezal, ...usadas);
    const hasta = Math.max(conf.cabezal, ...usadas);
    return { desde, hasta, texto: conf.cinta.slice(desde, hasta + 1).join('') };
  }

  function registroTexto(sesion, confs) {
    const fecha = new Date().toLocaleString('es-GT');
    const conjunto = (arr) => `{${arr.join(', ')}}`;
    const terna = (c) => `(${c.estado}, ${contenido(c).texto}, ${c.cabezal})`;
    const columna = (texto, ancho) => String(texto).padEnd(ancho);
    const sit = situacion(sesion, confs);
    const ultima = confs[confs.length - 1];
    const lineas = [
      'SIMULADOR · MÁQUINA DE TURING',
      'Modo 2 · Ejecución manual (depuración)',
      '='.repeat(60),
      `Sesión:  ${sesion.nombre || 'Sesión manual'}`,
      `Fecha:   ${fecha}`,
      '',
      `Σ = ${conjunto(sesion.sigma)}`,
      `Γ = ${conjunto(gamma(sesion))}   (${BLANCO} = blanco □)`,
      `Q = ${conjunto(sesion.estados)}`,
      `Estado inicial: ${sesion.inicial}   Estado final: ${sesion.final}`,
      `Cinta inicial (celdas 0 a ${CELDAS - 1}): ${sesion.cinta.join('')}`,
      `Cabezal inicial: celda ${sesion.cabezal} (ahí arranca en ${sesion.inicial})`,
      '',
      'REGISTRO DE MOVIMIENTOS Y CAMBIOS',
      '-'.repeat(60),
      `${columna('Paso', 6)}${columna('Estado', 8)}${columna('Celda', 7)}${columna('Lee', 5)}${columna('Escribe', 9)}${columna('Mov', 5)}${columna('Nuevo', 8)}Terna (estado, contenido, posición)`,
      `${columna('0', 6)}${columna('—', 8)}${columna('—', 7)}${columna('—', 5)}${columna('—', 9)}${columna('—', 5)}${columna(confs[0].estado, 8)}${terna(confs[0])}`,
    ];
    confs.slice(1).forEach((c) => {
      const p = c.paso;
      const cambio = p.escribe === p.lee ? p.escribe : `${p.escribe} *`;
      lineas.push(
        `${columna(p.numero, 6)}${columna(p.estado, 8)}${columna(p.celda, 7)}${columna(p.lee, 5)}${columna(cambio, 9)}` +
        `${columna(p.mueve, 5)}${columna(p.nuevoEstado, 8)}${terna(c)}`
      );
    });
    lineas.push('(* = la celda cambió de símbolo)', '');

    const resultado = {
      lista: 'Aún no se realizan pasos.',
      activa: `Ejecución sin terminar: va en ${ultima.estado}, celda ${ultima.cabezal}.`,
      final: `Llegó al estado final ${sesion.final} en ${sesion.pasos.length} pasos.`,
      paro: `Se detuvo con S (estado de paro) en ${ultima.estado}, celda ${ultima.cabezal}.`,
    }[sit];
    lineas.push(`Resultado: ${resultado}`);
    lineas.push(`Cinta final: ${ultima.cinta.join('')}`, '');

    const modificadas = ultima.cinta.map((s, i) => (s !== sesion.cinta[i] ? i : -1)).filter((i) => i >= 0);
    if (modificadas.length) {
      const desde = Math.min(...modificadas);
      const hasta = Math.max(...modificadas);
      lineas.push(
        `SEGMENTO MODIFICADO (celdas ${desde} a ${hasta}, ${modificadas.length} ${modificadas.length === 1 ? 'cambio' : 'cambios'})`,
        `  antes: ${sesion.cinta.slice(desde, hasta + 1).join(' ')}`,
        `  ahora: ${ultima.cinta.slice(desde, hasta + 1).join(' ')}`,
        ''
      );
    }

    lineas.push('TRANSICIONES REGISTRADAS (δ)', '-'.repeat(60));
    const mapa = reglas(confs);
    if (!mapa.size) lineas.push('(ninguna)');
    mapa.forEach((r) => {
      r.acciones.forEach((a) => {
        const marca = r.acciones.length > 1 ? '   ← no determinista' : '';
        lineas.push(`${deltaTexto(r.estado, r.lee, a)}   pasos: ${a.pasos.join(', ')}${marca}`);
      });
    });
    lineas.push('', `En el Modo 1: D se escribe R, I se escribe L y el blanco ${BLANCO} se escribe ${BLANCO_MODO1}.`, '');
    return lineas.join('\r\n');
  }

  // ---------- Guardar en la pestaña ----------
  function guardarSesion(sesion) {
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Devuelve la sesión guardada ya revisada, o null
  function leerSesion() {
    try {
      const texto = sessionStorage.getItem(CLAVE_SESION);
      if (!texto) return null;
      const { sesion } = validar(JSON.parse(texto));
      return sesion;
    } catch (e) {
      return null;
    }
  }

  // ---------- Cintas grabadas (localStorage: quedan entre visitas) ----------
  //
  // Cada grabación:
  //   { id, fecha, nombre, paso, estado, cabezal, celdas: [50 símbolos] }
  let grabadasEnMemoria = []; // por si el navegador no deja usar localStorage

  function leerGrabadas() {
    try {
      const texto = localStorage.getItem(CLAVE_GRABADAS);
      const datos = texto ? JSON.parse(texto) : [];
      return Array.isArray(datos) ? datos.filter((g) => g && Array.isArray(g.celdas)) : [];
    } catch (e) {
      return grabadasEnMemoria.slice();
    }
  }

  function escribirGrabadas(lista) {
    grabadasEnMemoria = lista.slice();
    try {
      localStorage.setItem(CLAVE_GRABADAS, JSON.stringify(lista));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Agrega una grabación al principio; devuelve { grabacion, guardada }
  function grabarCinta(datos) {
    const grabacion = {
      id: Date.now(),
      fecha: new Date().toISOString(),
      nombre: datos.nombre || 'Sesión manual',
      paso: datos.paso ?? 0,
      estado: datos.estado || '',
      cabezal: datos.cabezal ?? INICIO,
      celdas: normalizarCinta(datos.celdas),
    };
    const lista = [grabacion, ...leerGrabadas()].slice(0, MAX_GRABADAS);
    const guardada = escribirGrabadas(lista);
    return { grabacion, guardada };
  }

  function eliminarGrabada(id) {
    escribirGrabadas(leerGrabadas().filter((g) => g.id !== id));
  }

  // Archivo .json de una cinta grabada
  function grabacionJSON(g) {
    return `${JSON.stringify({
      tipo: 'cinta-maquina-turing',
      nombre: g.nombre,
      fecha: g.fecha,
      paso: g.paso,
      estado: g.estado,
      cabezal: g.cabezal,
      blanco: BLANCO,
      texto: g.celdas.join(''),
      celdas: g.celdas,
    }, null, 2)}\n`;
  }

  // Lee un archivo de cinta (.json grabado aquí); devuelve las 50 celdas o lanza un Error
  function leerArchivoCinta(texto) {
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch (e) {
      throw new Error('El archivo no tiene un formato JSON válido.');
    }
    const valor = datos && (Array.isArray(datos.celdas) ? datos.celdas : datos.texto);
    if (!valor || (!Array.isArray(valor) && typeof valor !== 'string')) {
      throw new Error('El archivo no contiene una cinta grabada.');
    }
    return normalizarCinta(valor);
  }

  // La cinta inicial solo puede tener símbolos de Σ y el blanco ^: los
  // auxiliares (como X o Y) son centinelas que escribe la máquina durante la
  // ejecución, nunca están al empezar. Devuelve la cinta con esos símbolos
  // cambiados por ^ (y la celda 0 en blanco) y la lista de los que se quitaron.
  function cintaSoloSigma(celdas, sigma) {
    const fuera = (s) => s !== BLANCO && !sigma.includes(s);
    const quitados = unicos(celdas.filter((s, i) => i > 0 && fuera(s)));
    const cinta = celdas.map((s, i) => (i === 0 || fuera(s) ? BLANCO : s));
    return { cinta, quitados };
  }

  // ---------- Descargas ----------
  function descargar(nombreArchivo, texto, tipo) {
    const blob = new Blob([texto], { type: tipo });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return nombreArchivo;
  }

  // "Mi sesión" → "mi-sesion" (sin extensión)
  const baseArchivo = (nombre) => MT.nombreArchivo(nombre).replace(/\.json$/, '');

  // ---------- Llenar la cinta ----------

  // Llena al azar `cantidad` celdas desde la celda 1 con símbolos de Σ
  // (y el blanco ^ si conBlanco). El resto de la cinta queda en blanco.
  function llenarAlAzar(sigma, cantidad, conBlanco) {
    const opciones = conBlanco ? [...sigma, BLANCO] : [...sigma];
    const cinta = cintaVacia();
    if (!opciones.length) return cinta;
    const n = Math.min(CELDAS - INICIO, Math.max(1, Math.round(Number(cantidad) || 1)));
    const azar = new Uint32Array(n);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(azar);
    else azar.forEach((_, i) => { azar[i] = Math.floor(Math.random() * 2 ** 32); });
    for (let i = 0; i < n; i++) cinta[INICIO + i] = opciones[azar[i] % opciones.length];
    return cinta;
  }

  // "0110^1" o "0 1 1 0" → las 50 celdas con esos símbolos desde la celda 1
  function separarContenido(texto) {
    const limpio = String(texto ?? '').trim();
    if (!limpio || limpio === 'ε') return [];
    if (/[\s,]/.test(limpio)) return limpio.split(/[\s,]+/).filter(Boolean);
    return caracteres(limpio);
  }

  function cintaDesde(simbolos) {
    const cinta = cintaVacia();
    simbolos.slice(0, CELDAS - INICIO).forEach((s, i) => { cinta[INICIO + i] = s; });
    return cinta;
  }

  // ---------- Estados nuevos ----------
  // q0, q1, q2 → q3 (usa el prefijo de los estados numerados)
  function nombreNuevoEstado(estados) {
    const numerados = estados.map((q) => /^(.*?)(\d+)$/.exec(q)).filter(Boolean);
    const prefijo = numerados.length ? numerados[numerados.length - 1][1] : 'q';
    let n = numerados
      .filter((p) => p[1] === prefijo)
      .reduce((mayor, p) => Math.max(mayor, Number(p[2]) + 1), 0);
    while (estados.includes(`${prefijo}${n}`)) n += 1;
    return `${prefijo}${n}`;
  }

  return {
    BLANCO,
    BLANCO_MODO1,
    CELDAS,
    INICIO,
    DESPLAZAMIENTO,
    NOMBRE_MOVIMIENTO,
    clave,
    escapar,
    estadoHTML,
    unirConY,
    gamma,
    cintaVacia,
    normalizarCinta,
    validar,
    recorrer,
    situacion,
    reglas,
    mismaAccion,
    conflictos,
    configuracionModo1,
    comprobar,
    contenido,
    registroTexto,
    guardarSesion,
    leerSesion,
    leerGrabadas,
    grabarCinta,
    eliminarGrabada,
    grabacionJSON,
    leerArchivoCinta,
    cintaSoloSigma,
    descargar,
    baseArchivo,
    llenarAlAzar,
    separarContenido,
    cintaDesde,
    nombreNuevoEstado,
  };
})();
