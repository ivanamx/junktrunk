#!/bin/bash
# Script para iniciar localtunnel para el backend
# Esto expone el puerto 3000 a través de un tunnel HTTPS
# La URL generada debe copiarse en services/api.js

echo "🚀 Iniciando localtunnel en puerto 3000..."
echo ""
echo "📋 INSTRUCCIONES:"
echo "1. Copia la URL HTTPS que aparece abajo (ej: https://abc123.loca.lt)"
echo "2. Abre services/api.js"
echo "3. Pega la URL en: const LOCALTUNNEL_URL = 'TU_URL_AQUI';"
echo "4. Guarda el archivo y recarga la app"
echo ""
echo "⚠️  MANTÉN ESTA TERMINAL ABIERTA mientras uses la app"
echo ""

lt --port 3000

