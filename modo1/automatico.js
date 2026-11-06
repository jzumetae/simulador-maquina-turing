// =========================================================
// Simulador · Máquina de Turing — pantalla "Ejecución automática" (Modo 1)
// Usa maquina.js (validación y guardado), que se carga antes.
//
//   Opción 1 · Configuración → Nueva (formulario) o Cargar (.json guardado)
//   Opción 2 · Ejecución     → solo se puede si ya hay una configuración
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  const botonNueva = document.getElementById('btn-nueva');
  const botonCargar = document.getElementById('btn-cargar');
  const botonEjecutar = document.getElementById('btn-ejecutar');
  const ejecutarDesc = document.getElementById('ejecutar-desc');
  const ejecutarExtra = document.getElementById('ejecutar-extra');
  const selectorArchivo = document.getElementById('archivo');
  const aviso = document.getElementById('aviso');

  const PANTALLAS = {
    nueva: '../formulario/configuracion.html',
    simulacion: 'Simulacion/simulacion.html?modo=automatico',
  };

  const MENSAJE_SIN_CONFIGURACION =
    'Primero debes configurar la máquina: crea una nueva configuración o carga una guardada.';

  // ---------- Mensaje flotante ----------
  let temporizadorAviso;

  function mostrarAviso(texto, esError = false) {
    aviso.textContent = texto;
    aviso.classList.toggle('error', esError);
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), esError ? 6000 : 4000);
  }

  // ---------- ¿Hay una configuración cargada? ----------
  // Devuelve la máquina guardada en esta pestaña si es válida, o null.
  function configuracionActual() {
    const datos = MT.leerDeSesion();
    if (!datos) return null;
    const { maquina, errores } = MT.validar(datos);
    return errores.length ? null : maquina;
  }

  // Activa o bloquea la tarjeta "Ejecutar" según haya configuración
  function pintarEjecutar(resaltar = false) {
    const maquina = configuracionActual();

    if (!maquina) {
      botonEjecutar.setAttribute('aria-disabled', 'true');
      botonEjecutar.classList.remove('lista');
      ejecutarDesc.textContent = 'Primero crea o carga una configuración.';
      ejecutarExtra.textContent = 'Sin configuración cargada';
      return;
    }

    const n = maquina.transiciones.length;
    const palabra = maquina.palabra.length ? maquina.palabra.join('') : 'ε';
    botonEjecutar.setAttribute('aria-disabled', 'false');
    ejecutarDesc.textContent = `Simula «${maquina.nombre || 'Máquina de Turing'}» y observa cómo procesa la palabra.`;
    ejecutarExtra.textContent =
      `${maquina.estados.length} estados · ${n} ${n === 1 ? 'transición' : 'transiciones'} · w = ${palabra}`;

    if (resaltar) {
      botonEjecutar.classList.remove('lista');
      void botonEjecutar.offsetWidth; // reinicia la animación
      botonEjecutar.classList.add('lista');
    }
  }

  // ---------- Opción 1: Nueva configuración ----------
  botonNueva.addEventListener('click', () => {
    MT.borrarDeSesion(); // el formulario empieza vacío
    window.location.href = PANTALLAS.nueva;
  });

  // ---------- Opción 1: Cargar configuración ----------
  botonCargar.addEventListener('click', () => selectorArchivo.click());

  selectorArchivo.addEventListener('change', () => {
    const archivo = selectorArchivo.files[0];
    selectorArchivo.value = ''; // permite volver a elegir el mismo archivo
    if (archivo) cargarArchivo(archivo);
  });

  // Arrastrar y soltar un archivo sobre la tarjeta
  botonCargar.addEventListener('dragover', (evento) => {
    evento.preventDefault();
    botonCargar.classList.add('arrastrando');
  });

  botonCargar.addEventListener('dragleave', () => botonCargar.classList.remove('arrastrando'));

  botonCargar.addEventListener('drop', (evento) => {
    evento.preventDefault();
    botonCargar.classList.remove('arrastrando');
    const archivo = evento.dataTransfer.files[0];
    if (archivo) cargarArchivo(archivo);
  });

  // Evita que el navegador abra el archivo si se suelta fuera de la tarjeta
  window.addEventListener('dragover', (evento) => evento.preventDefault());
  window.addEventListener('drop', (evento) => evento.preventDefault());

  async function cargarArchivo(archivo) {
    if (!archivo.name.toLowerCase().endsWith('.json')) {
      mostrarAviso('Selecciona un archivo .json con la configuración de la máquina.', true);
      return;
    }

    botonCargar.classList.add('cargando');
    try {
      const texto = await archivo.text();

      let datos;
      try {
        datos = JSON.parse(texto);
      } catch (e) {
        throw new Error('El archivo no tiene un formato JSON válido.');
      }

      // Misma revisión que hace el formulario de Nueva configuración
      const { maquina, errores } = MT.validar(datos);
      if (errores.length) {
        const extra = errores.length > 1 ? ` (y ${errores.length - 1} problema${errores.length > 2 ? 's' : ''} más)` : '';
        throw new Error(errores[0].mensaje + extra);
      }

      if (!maquina.nombre) maquina.nombre = archivo.name.replace(/\.json$/i, '');
      MT.guardarEnSesion(maquina);

      // La configuración queda lista: ahora se puede usar la Opción 2
      pintarEjecutar(true);
      botonEjecutar.scrollIntoView({ behavior: 'smooth', block: 'center' });
      botonEjecutar.focus({ preventScroll: true });
      mostrarAviso(`«${maquina.nombre}» cargada. Ya puedes ejecutarla.`);
    } catch (error) {
      mostrarAviso(error.message, true);
    } finally {
      botonCargar.classList.remove('cargando');
    }
  }

  // ---------- Opción 2: Ejecutar ----------
  botonEjecutar.addEventListener('click', () => {
    if (!configuracionActual()) {
      pintarEjecutar();
      mostrarAviso(MENSAJE_SIN_CONFIGURACION, true);
      botonEjecutar.classList.remove('sacudir');
      void botonEjecutar.offsetWidth;
      botonEjecutar.classList.add('sacudir');
      return;
    }
    window.location.href = PANTALLAS.simulacion;
  });

  botonEjecutar.addEventListener('animationend', () => botonEjecutar.classList.remove('sacudir'));

  // ---------- Inicio ----------
  // Si se viene de la simulación sin configuración, se avisa aquí.
  const parametros = new URLSearchParams(window.location.search);
  if (parametros.get('aviso') === 'sin-configuracion') {
    setTimeout(() => mostrarAviso(MENSAJE_SIN_CONFIGURACION, true), 400);
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch (e) { /* algunos navegadores no lo permiten al abrir el archivo directo */ }
  }

  pintarEjecutar(true);

  // Al volver con el botón "atrás" del navegador la página puede venir de caché
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) pintarEjecutar();
  });
});
