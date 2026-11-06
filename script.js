// =========================================================
// Simulador · Máquina de Turing — menú principal
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
  const tarjetasModo = document.querySelectorAll('.modo');
  const botonSalir = document.getElementById('btn-salir');
  const aviso = document.getElementById('aviso');
  const cinta = document.getElementById('cinta');

  // Páginas de cada modo. Cuando crees las pantallas, escribe aquí
  // su nombre de archivo, por ejemplo 'automatico.html'.
  const PANTALLAS = {
    automatico: 'modo1/automatico.html',
    manual: 'modo2/manual.html',
  };

  const NOMBRES = {
    automatico: 'Ejecución automática',
    manual: 'Ejecución manual',
  };

  // ---------- Mensaje flotante ----------
  let temporizadorAviso;

  function mostrarAviso(texto) {
    aviso.textContent = texto;
    aviso.classList.add('visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => aviso.classList.remove('visible'), 2800);
  }

  // ---------- Selección de modo ----------
  tarjetasModo.forEach((tarjeta) => {
    tarjeta.addEventListener('click', () => {
      const modo = tarjeta.dataset.modo;
      const destino = PANTALLAS[modo];

      if (destino) {
        window.location.href = destino;
      } else {
        mostrarAviso(`${NOMBRES[modo]}: esta pantalla aún está en construcción.`);
      }
    });
  });

  // ---------- Salir ----------
  botonSalir.addEventListener('click', () => {
    if (!confirm('¿Deseas salir del simulador?')) return;

    window.close();
    // Los navegadores solo permiten cerrar pestañas abiertas por un script,
    // así que si la pestaña sigue abierta se muestra este mensaje.
    setTimeout(() => mostrarAviso('Ya puedes cerrar esta pestaña.'), 200);
  });

  // ---------- Animación del cabezal en la cinta ----------
  // El cabezal recorre la cinta de izquierda a derecha y regresa.
  // Cambia ANIMAR_CABEZAL a false si lo quieres quieto.
  const ANIMAR_CABEZAL = true;
  const celdas = cinta.querySelectorAll('.cinta__celdas span');
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (ANIMAR_CABEZAL && !sinMovimiento) {
    let posicion = 2;
    let direccion = 1;

    setInterval(() => {
      if (posicion + direccion > celdas.length - 1 || posicion + direccion < 0) {
        direccion *= -1;
      }
      posicion += direccion;

      cinta.style.setProperty('--pos', posicion);
      celdas.forEach((celda, i) => celda.classList.toggle('activa', i === posicion));
    }, 1400);
  }
});
