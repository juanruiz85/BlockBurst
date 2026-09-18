# Cierra los navegadores headless que dejan las pruebas de BLOCKBURST.
# Solo toca procesos con el perfil de prueba o en modo headless, nunca el navegador normal.
$targets = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*blockburst-*' -or $_.CommandLine -like '*--headless*' }

$n = ($targets | Measure-Object).Count
$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 3
$left = (Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*blockburst-*' -or $_.CommandLine -like '*--headless*' } | Measure-Object).Count

# Perfiles temporales usados por las pruebas
Get-ChildItem $env:TEMP -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'blockburst-*' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Output ("navegadores de prueba cerrados: " + $n + " (restantes: " + $left + ")")
