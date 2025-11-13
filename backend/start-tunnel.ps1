# Script para iniciar localtunnel para el backend
# Esto expone el puerto 3000 a través de un tunnel HTTPS
# La URL generada debe copiarse en services/api.js

Write-Host "🚀 Iniciando localtunnel en puerto 3000..." -ForegroundColor Green
Write-Host ""
Write-Host "📋 INSTRUCCIONES:" -ForegroundColor Yellow
Write-Host "1. Copia la URL HTTPS que aparece abajo (ej: https://abc123.loca.lt)" -ForegroundColor White
Write-Host "2. Abre services/api.js" -ForegroundColor White
Write-Host "3. Pega la URL en: const LOCALTUNNEL_URL = 'TU_URL_AQUI';" -ForegroundColor White
Write-Host "4. Guarda el archivo y recarga la app" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  MANTÉN ESTA TERMINAL ABIERTA mientras uses la app" -ForegroundColor Red
Write-Host ""

lt --port 3000

