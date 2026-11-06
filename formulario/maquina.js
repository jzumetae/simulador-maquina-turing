// =========================================================
// =========================================================
//
// Una máquina M = (Q, Σ, Γ, δ, q0, B, F) se guarda con este formato
// (es el mismo del archivo .json):
//
// {
//   "nombre": "Complemento a uno",
//   "estados": ["q0", "q1"],                    // Q
//   "alfabetoEntrada": ["0", "1"],              // Σ
//   "alfabetoCinta": ["0", "1", "B"],           // Γ
//   "estadoInicial": "q0",                      // q0
//   "blanco": "B",                              // B
//   "estadosFinales": ["q1"],                   // F
//   "transiciones": [                           // δ(estado, lee) = (nuevoEstado, escribe, mueve)
//     { "estado": "q0", "lee": "0", "nuevoEstado": "q0", "escribe": "1", "mueve": "R" }
//   ],
//   "palabra": "1011"
// }
//
// El símbolo blanco siempre es B 
// "mueve" acepta R (derecha), L (izquierda) y S (no se mueve).
// También se aceptan D e I, y se convierten a R y L.
// Para no moverse (stay) solo se acepta S.

const MT = (() => {
  const CLAVE_SESION = 'mt-maquina';
  const CLAVE_CINTA = 'mt-cinta-inicial'; // cinta exacta que manda el Modo 2
  const BLANCO = 'B'; // el símbolo blanco es fijo
  const MOVIMIENTOS = { R: 'R', D: 'R', L: 'L', I: 'L', S: 'S' };

  // La cinta se simula con 50 celdas, numeradas de 0 a 49.
  // La palabra se escribe a partir de la celda 1, así la celda 0 queda
  // en blanco y la máquina puede leer el blanco a la izquierda de la palabra.
  const CELDAS = 50;
  const INICIO_PALABRA = 1;
  const MAX_PALABRA = CELDAS - INICIO_PALABRA; // 49 símbolos

  // ---------- Utilidades ----------

  // Separa "q0, q1, q2" (o "{q0, q1}") en ["q0", "q1", "q2"]
  function separar(texto) {
    return String(texto ?? '')
      .trim()
      .replace(/^\{/, '')
      .replace(/\}$/, '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  }

  // Cuenta caracteres reales (á, Σ, ★ cuentan como uno)
  const caracteres = (texto) => [...String(texto)];

  // Un estado: letras, números o guion bajo, sin espacios (q0, q_acepta)
  const esEstado = (q) => /^[\p{L}\p{N}_]+$/u.test(q);

  // Un símbolo: exactamente un carácter que no sea espacio ni coma
  const esSimbolo = (s) => caracteres(s).length === 1 && !/[\s,]/.test(s);

  const sinRepetir = (lista) => [...new Set(lista)];
  const repetidos = (lista) => sinRepetir(lista.filter((x, i) => lista.indexOf(x) !== i));

  // "a", "a y b", "a, b y c"
  function unirConY(lista) {
    if (lista.length <= 1) return lista.join('');
    return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
  }

  // ---------- Validación ----------
  //
  // Recibe los datos (del formulario o de un archivo .json) y devuelve
  //   { maquina, errores }
  // - errores: lista de { campo, mensaje } (vacía si todo está bien).
  //   Los errores de una transición traen además { indice, partes, relacionada }.
  // - maquina: los datos limpios, o null si hubo errores.
  //
  // Las transiciones totalmente vacías se ignoran (filas en blanco del formulario).
  function validar(datos) {
    const errores = [];
    const error = (campo, mensaje, extra = {}) => errores.push({ campo, mensaje, ...extra });

    if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
      error('general', 'Los datos no describen una máquina de Turing.');
      return { maquina: null, errores };
    }

    // Acepta una lista ["q0","q1"] o un texto "q0, q1"
    const lista = (campo, simbolo) => {
      const valor = datos[campo];
      if (valor === undefined || valor === null) return [];
      if (typeof valor === 'string') return separar(valor);
      if (!Array.isArray(valor)) {
        error(campo, `${simbolo} debe ser una lista.`);
        return [];
      }
      return valor.map((x) => String(x).trim()).filter((x) => x !== '');
    };

    const nombre = String(datos.nombre ?? '').trim();

    // ----- Q: estados -----
    const estados = lista('estados', 'Q');
    if (estados.length === 0) {
      error('estados', 'Define al menos un estado en Q.');
    }
    estados.forEach((q) => {
      if (/\s/.test(q)) {
        error('estados', `«${q}» tiene espacios: separa los estados con comas.`);
      } else if (!esEstado(q)) {
        error('estados', `«${q}» no es un nombre válido: usa solo letras, números o _.`);
      }
    });
    repetidos(estados).forEach((q) => error('estados', `El estado ${q} está repetido.`));

    // ----- Σ y Γ: alfabetos -----
    const simbolos = (campo, simbolo) => {
      const arr = lista(campo, simbolo);
      arr.forEach((s) => {
        if (esSimbolo(s)) return;
        if (caracteres(s).length > 1 && /\s/.test(s)) {
          error(campo, `«${s}» tiene espacios: separa los símbolos de ${simbolo} con comas.`);
        } else if (caracteres(s).length > 1) {
          error(campo, `«${s}» tiene ${caracteres(s).length} caracteres: en ${simbolo} cada símbolo es un solo carácter.`);
        } else {
          error(campo, `«${s}» no se puede usar como símbolo.`);
        }
      });
      repetidos(arr).forEach((s) => error(campo, `El símbolo ${s} está repetido en ${simbolo}.`));
      return arr;
    };

    const sigma = simbolos('alfabetoEntrada', 'Σ');
    if (sigma.length === 0) error('alfabetoEntrada', 'Define al menos un símbolo en Σ.');

    const gamma = simbolos('alfabetoCinta', 'Γ');
    if (gamma.length === 0) error('alfabetoCinta', 'Define al menos un símbolo en Γ.');

    // ----- B: símbolo blanco (en este simulador siempre es B) -----
    const blanco = String(datos.blanco ?? BLANCO).trim() || BLANCO;
    if (blanco !== BLANCO) {
      error('blanco', `El símbolo blanco siempre es ${BLANCO}; el archivo usa «${blanco}».`);
    } else {
      if (sigma.includes(blanco)) {
        error('alfabetoEntrada', `El blanco ${blanco} no puede estar en Σ.`);
      }
      if (gamma.length > 0 && !gamma.includes(blanco)) {
        error('alfabetoCinta', `Γ debe incluir el símbolo blanco ${blanco}.`);
      }
    }

    // Σ debe estar contenido en Γ
    if (gamma.length > 0) {
      const faltan = sinRepetir(sigma.filter((s) => esSimbolo(s) && !gamma.includes(s)));
      if (faltan.length === 1) error('alfabetoCinta', `Γ debe contener a Σ: falta el símbolo ${faltan[0]}.`);
      if (faltan.length > 1) error('alfabetoCinta', `Γ debe contener a Σ: faltan los símbolos ${unirConY(faltan)}.`);
    }

    // ----- q0: estado inicial -----
    const estadoInicial = String(datos.estadoInicial ?? '').trim();
    if (!estadoInicial) {
      error('estadoInicial', 'Selecciona el estado inicial q₀.');
    } else if (!estados.includes(estadoInicial)) {
      error('estadoInicial', `El estado inicial ${estadoInicial} no está en Q.`);
    }

    // ----- F: estados finales -----
    const estadosFinales = sinRepetir(lista('estadosFinales', 'F'));
    if (estadosFinales.length === 0) {
      error('estadosFinales', 'Selecciona al menos un estado final (F).');
    }
    estadosFinales.forEach((q) => {
      if (!estados.includes(q)) error('estadosFinales', `El estado final ${q} no está en Q.`);
    });

    // ----- δ: función de transición -----
    let valorTrans = datos.transiciones ?? [];
    if (!Array.isArray(valorTrans)) {
      error('transiciones', 'δ debe ser una lista de transiciones.');
      valorTrans = [];
    }

    const transiciones = [];
    const definidas = new Map(); // "estado|lee" -> índice de la transición

    valorTrans.forEach((t, i) => {
      const n = i + 1;
      const errorFila = (mensaje, partes, extra = {}) =>
        error('transiciones', `Transición ${n}: ${mensaje}`, { indice: i, partes, ...extra });

      if (typeof t !== 'object' || t === null || Array.isArray(t)) {
        errorFila('no tiene el formato correcto.', []);
        return;
      }

      const v = (clave) => String(t[clave] ?? '').trim();
      const fila = {
        estado: v('estado'),
        lee: v('lee'),
        nuevoEstado: v('nuevoEstado'),
        escribe: v('escribe'),
        mueve: v('mueve').toUpperCase(),
      };

      // fila en blanco: se ignora
      if (Object.values(fila).every((x) => x === '')) return;

      // VERIFICA
      const nombres = {
        estado: 'el estado qᵢ',
        lee: 'el símbolo que lee (X)',
        nuevoEstado: 'el nuevo estado qⱼ',
        escribe: 'el símbolo que escribe (Y)',
        mueve: 'el movimiento (D)',
      };
      const vacias = Object.keys(fila).filter((k) => fila[k] === '');
      if (vacias.length) {
        errorFila(`falta elegir ${unirConY(vacias.map((k) => nombres[k]))}.`, vacias);
      }

      // ¿usa estados y símbolos que existen? (un solo mensaje por valor)
      const fuera = new Map();
      [['estado', estados, 'Q'], ['nuevoEstado', estados, 'Q'], ['lee', gamma, 'Γ'], ['escribe', gamma, 'Γ']]
        .forEach(([parte, conjunto, nombreConjunto]) => {
          const valor = fila[parte];
          if (valor && conjunto.length > 0 && !conjunto.includes(valor)) {
            const clave = `${valor}\u0000${nombreConjunto}`;
            if (!fuera.has(clave)) fuera.set(clave, { valor, nombreConjunto, partes: [] });
            fuera.get(clave).partes.push(parte);
          }
        });
      fuera.forEach(({ valor, nombreConjunto, partes }) => {
        errorFila(`${valor} no está en ${nombreConjunto}.`, partes);
      });

      if (fila.mueve && !MOVIMIENTOS[fila.mueve]) {
        const pista = fila.mueve === 'N' ? 'para no moverse usa S' : 'usa R, L o S';
        errorFila(`el movimiento «${fila.mueve}» no es válido; ${pista}.`, ['mueve']);
      }
      fila.mueve = MOVIMIENTOS[fila.mueve] || fila.mueve;

      // ¿es determinista? (una sola transición por cada par estado-símbolo)
      if (fila.estado && fila.lee) {
        const clave = `${fila.estado}\u0000${fila.lee}`;
        if (definidas.has(clave)) {
          const j = definidas.get(clave);
          errorFila(
            `δ(${fila.estado}, ${fila.lee}) ya está definida en la transición ${j + 1}; ` +
            'la máquina debe ser determinista.',
            ['estado', 'lee'],
            { relacionada: j }
          );
        } else {
          definidas.set(clave, i);
        }
      }

      transiciones.push(fila);
    });

    if (transiciones.length === 0 && !errores.some((e) => e.campo === 'transiciones')) {
      error('transiciones', 'Agrega al menos una transición.');
    }

    // ----- Palabra de entrada -----
    // Puede llevar el blanco B para dejar celdas vacías en medio
    // (así llegan las cintas llenadas al azar en el Modo 2).
    const valorPalabra = datos.palabra ?? '';
    const palabra = Array.isArray(valorPalabra)
      ? valorPalabra.map(String)
      : caracteres(String(valorPalabra).trim());

    if (sigma.length > 0) {
      sinRepetir(palabra.filter((s) => !sigma.includes(s) && s !== blanco)).forEach((s) => {
        if (/\s/.test(s)) error('palabra', 'La palabra no debe tener espacios.');
        else error('palabra', `La palabra usa ${s}, que no está en Σ.`);
      });
    }

    if (palabra.length > MAX_PALABRA) {
      error(
        'palabra',
        `La palabra tiene ${palabra.length} símbolos y en la cinta de ${CELDAS} celdas caben ` +
        `máximo ${MAX_PALABRA} (empieza en la celda ${INICIO_PALABRA}).`
      );
    }

    if (errores.length) return { maquina: null, errores };

    return {
      maquina: {
        nombre,
        estados,
        alfabetoEntrada: sigma,
        alfabetoCinta: gamma,
        estadoInicial,
        blanco,
        estadosFinales,
        transiciones,
        palabra,
      },
      errores,
    };
  }

  // ---------- Notación formal ----------
  // "M = ({q0, q1}, {0, 1}, {0, 1, B}, δ, q0, B, {q1})"
  function tupla(m) {
    const conjunto = (arr) => `{${(arr || []).join(', ')}}`;
    return `M = (${conjunto(m.estados)}, ${conjunto(m.alfabetoEntrada)}, ${conjunto(m.alfabetoCinta)}, ` +
      `δ, ${m.estadoInicial || '?'}, ${m.blanco || '?'}, ${conjunto(m.estadosFinales)})`;
  }

  // ---------- Guardar en la pestaña (sessionStorage) ----------
  // Así la siguiente pantalla (la simulación) puede leer la máquina.
  function guardarEnSesion(maquina) {
    try {
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify(maquina));
      return true;
    } catch (e) {
      return false;
    }
  }

  function leerDeSesion() {
    try {
      const texto = sessionStorage.getItem(CLAVE_SESION);
      return texto ? JSON.parse(texto) : null;
    } catch (e) {
      return null;
    }
  }

  function borrarDeSesion() {
    try {
      sessionStorage.removeItem(CLAVE_SESION);
    } catch (e) { /* el navegador no permite sessionStorage */ }
  }

  // ---------- Cinta exacta para la siguiente simulación ----------
  // El Modo 2 deja aquí las 50 celdas de la cinta inicial de la sesión manual
  // (ya con B en lugar de ^) para que el Modo 1 la reproduzca tal cual la
  // primera vez, en lugar de llenar la cinta al azar. Se lee una sola vez.
  function guardarCintaInicial(celdas) {
    try {
      sessionStorage.setItem(CLAVE_CINTA, JSON.stringify(celdas));
      return true;
    } catch (e) {
      return false;
    }
  }

  function tomarCintaInicial() {
    try {
      const texto = sessionStorage.getItem(CLAVE_CINTA);
      sessionStorage.removeItem(CLAVE_CINTA);
      const celdas = texto ? JSON.parse(texto) : null;
      return Array.isArray(celdas) && celdas.length === CELDAS ? celdas.map(String) : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- Archivo .json ----------

  // Texto del archivo: listas en una línea y una transición por línea
  function aJSON(m) {
    const lista = (arr) => `[${arr.map((x) => JSON.stringify(x)).join(', ')}]`;
    const trans = m.transiciones.map((t) =>
      '    { ' + Object.entries(t).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + ' }'
    );
    return [
      '{',
      `  "nombre": ${JSON.stringify(m.nombre || '')},`,
      `  "estados": ${lista(m.estados)},`,
      `  "alfabetoEntrada": ${lista(m.alfabetoEntrada)},`,
      `  "alfabetoCinta": ${lista(m.alfabetoCinta)},`,
      `  "estadoInicial": ${JSON.stringify(m.estadoInicial)},`,
      `  "blanco": ${JSON.stringify(m.blanco)},`,
      `  "estadosFinales": ${lista(m.estadosFinales)},`,
      '  "transiciones": [',
      trans.join(',\n'),
      '  ],',
      `  "palabra": ${JSON.stringify(m.palabra.join(''))}`,
      '}',
      '',
    ].join('\n');
  }

  // "Máquina 0ⁿ1ⁿ" -> "maquina-0n1n.json"
  function nombreArchivo(nombre) {
    const base = String(nombre || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${base || 'maquina-turing'}.json`;
  }

  // Descarga la máquina como archivo .json y devuelve el nombre del archivo
  function descargar(maquina) {
    const archivo = nombreArchivo(maquina.nombre);
    const blob = new Blob([aJSON(maquina)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return archivo;
  }

  return {
    CLAVE_SESION,
    BLANCO,
    CELDAS,
    INICIO_PALABRA,
    MAX_PALABRA,
    separar,
    esEstado,
    esSimbolo,
    validar,
    tupla,
    guardarEnSesion,
    leerDeSesion,
    borrarDeSesion,
    guardarCintaInicial,
    tomarCintaInicial,
    aJSON,
    nombreArchivo,
    descargar,
  };
})();
