# =========================================================
# Simulador · Máquina de Turing — servidor local
# =========================================================
#
# Sirve la carpeta del proyecto en http://localhost:5577 y abre el
# navegador en el menú. No necesita instalar nada: usa PowerShell,
# que ya viene con Windows. Lo abre INICIAR.bat; para detenerlo,
# cierra la ventana o presiona Ctrl+C.
#
# No usa el 5500 (el de Live Server) porque en esta computadora
# Oracle (tnslsnr) ya lo ocupa. Si el 5577 está ocupado prueba el
# 5578, 5579, ...
# -SinNavegador: solo inicia el servidor (no abre el navegador).

param(
  [int]$Puerto = 5577,
  [switch]$SinNavegador
)

$ErrorActionPreference = 'Stop'
$raiz = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $raiz.EndsWith('\')) { $raiz += '\' }

$tipos = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.pdf'  = 'application/pdf'
  '.woff2' = 'font/woff2'
}

# ---------- Abrir el puerto ----------
$servidor = $null
for ($p = $Puerto; $p -lt $Puerto + 20; $p++) {
  $intento = New-Object System.Net.HttpListener
  $intento.Prefixes.Add("http://localhost:$p/")
  try {
    $intento.Start()
    $servidor = $intento
    $Puerto = $p
    break
  } catch {
    $intento.Close()
  }
}

if (-not $servidor) {
  Write-Host ''
  Write-Host '  No se pudo abrir ningún puerto entre' $Puerto 'y' ($Puerto + 19) -ForegroundColor Red
  exit 1
}

$url = "http://localhost:$Puerto/"
Write-Host ''
Write-Host '  ==================================================' -ForegroundColor DarkCyan
Write-Host '   Simulador · Máquina de Turing' -ForegroundColor Cyan
Write-Host '  ==================================================' -ForegroundColor DarkCyan
Write-Host ''
Write-Host '   Abierto en:  ' -NoNewline
Write-Host $url -ForegroundColor Yellow
Write-Host '   Carpeta:     ' $raiz
Write-Host ''
Write-Host '   Deja esta ventana abierta mientras usas el simulador.'
Write-Host '   Para detenerlo, cierra la ventana o presiona Ctrl+C.'
Write-Host ''

if (-not $SinNavegador) { Start-Process $url }

# ---------- Atender las peticiones ----------
try {
  while ($servidor.IsListening) {
    # Espera de a poco para que Ctrl+C pueda detenerlo
    $tarea = $servidor.GetContextAsync()
    while (-not $tarea.AsyncWaitHandle.WaitOne(250)) { }
    $contexto = $tarea.GetAwaiter().GetResult()
    $respuesta = $contexto.Response

    try {
      $ruta = [Uri]::UnescapeDataString($contexto.Request.Url.AbsolutePath)
      $relativa = $ruta.TrimStart('/').Replace('/', '\')
      $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $relativa))

      # Una carpeta sin "/" al final: se redirige para que los enlaces relativos funcionen
      if ((Test-Path -LiteralPath $archivo -PathType Container) -and -not $ruta.EndsWith('/')) {
        $respuesta.StatusCode = 301
        $respuesta.RedirectLocation = $ruta + '/'
        continue
      }
      if (Test-Path -LiteralPath $archivo -PathType Container) {
        $archivo = Join-Path $archivo 'index.html'
      }

      $dentro = $archivo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase)
      if (-not $dentro -or -not (Test-Path -LiteralPath $archivo -PathType Leaf)) {
        $respuesta.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes("No se encontró $ruta")
        $respuesta.ContentType = 'text/plain; charset=utf-8'
      } else {
        $bytes = [IO.File]::ReadAllBytes($archivo)
        $extension = [IO.Path]::GetExtension($archivo).ToLowerInvariant()
        $respuesta.ContentType = if ($tipos.ContainsKey($extension)) { $tipos[$extension] } else { 'application/octet-stream' }
        # Sin caché: al editar un archivo basta con recargar la página
        $respuesta.AddHeader('Cache-Control', 'no-store')
      }
      $respuesta.ContentLength64 = $bytes.Length
      $respuesta.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      # el navegador cerró la conexión antes de tiempo: se ignora
    } finally {
      try { $respuesta.Close() } catch { }
    }
  }
} finally {
  $servidor.Stop()
  $servidor.Close()
}
