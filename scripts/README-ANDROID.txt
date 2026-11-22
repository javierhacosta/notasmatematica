Preparación Android del Panel Docente

- La rama android-apk-prueba contiene los archivos de configuración de Capacitor y la compilación Android.
- GitHub Actions genera un APK de depuración cuando se suben cambios a esta rama o al ejecutar manualmente el flujo Android APK.
- El APK empaqueta docente.html, login-docente.html y service-worker.js.
- offline-transfer.js añade los botones Exportar ZIP e Importar ZIP al panel de modo de conexión.
- El ZIP incluye las tablas guardadas en IndexedDB, archivos/fotografías, metadatos y cambios pendientes de sincronización.
- Para usarlo en otro teléfono: instalar APK, iniciar sesión una vez con Internet, importar el ZIP y después activar/usar el modo offline.
- Esta primera compilación es de prueba (APK debug), no una versión firmada para publicación.
- No borres los datos de la aplicación ni desinstales el APK mientras haya cambios pendientes de sincronización.
