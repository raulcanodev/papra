# Puesta en marcha de VERI*FACTU

Estado de esta implementación: **base funcional preparada, transmisión AEAT pendiente de homologación operativa**.

## Qué está implementado

- Configuración por empresa con modos desactivado, pruebas, producción y no aplicable.
- Activación de producción protegida por NIF, certificado marcado como validado y aceptación de la declaración responsable.
- Bloqueo del modo VERI*FACTU hasta final del año natural tras activarlo en producción.
- Registro fiscal inmutable al emitir una factura, con huella SHA-256, encadenamiento, fecha con huso de Madrid e idempotencia ante reintentos.
- QR tributario de 31 mm, nivel de corrección M, texto `QR tributario:` y distintivo `VERI*FACTU` en el PDF.
- Cola persistente, reclamación segura del trabajo, historial de intentos, respuesta/CSV/error AEAT y reintento exponencial ante incidencias de transporte.
- Pausa por empresa y pausa global desde administración sin detener la emisión local de facturas.
- Panel de administración y trazabilidad visible para la empresa.

## Puertas obligatorias antes de producción

1. Completar el modelo fiscal de factura: tipos F1/F2/F3 y rectificativas R1–R5, exenciones, inversión de sujeto pasivo, recargo de equivalencia, IGIC/IPSI, clientes extranjeros y desglose por tipo impositivo.
2. Generar el sobre SOAP exactamente desde los XSD oficiales y validarlo localmente contra la versión fijada de dichos esquemas.
3. Configurar la identidad real del productor del software, versión, identificador del sistema y número de instalación. No deben inventarse ni confundirse con los datos de Jocrimar.
4. Custodiar el certificado cualificado fuera de la base de datos (gestor de secretos/HSM), probar mTLS y rotación, y decidir si se usa certificado normal, de representante o de sello.
5. Validar respuestas completas de AEAT, duplicados, aceptación con errores, subsanación, rechazo previo e incidencia.
6. Implementar facturas rectificativas y registros de anulación como nuevos registros; nunca editar ni borrar un registro fiscal emitido.
7. Superar el portal externo de pruebas de AEAT con casos reales de Jocrimar y conservar evidencias.
8. Preparar, firmar y publicar la declaración responsable de cada versión del sistema.
9. Realizar revisión fiscal con asesoría de Jocrimar y revisión técnica de seguridad/continuidad antes de habilitar producción.

## Regla operativa

La facturación no se detiene por una caída de AEAT. Se conserva el registro local y se reintenta periódicamente indicando incidencia cuando corresponda. Una respuesta rechazada requiere revisión; no se reescribe el registro original.

## Fuentes oficiales fijadas para la implementación

- WSDL: `https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl`
- Esquemas: `SuministroLR.xsd`, `SuministroInformacion.xsd` y `RespuestaSuministro.xsd` publicados junto al WSDL.
- Producción: `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`
- Pruebas: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`

No se debe habilitar producción únicamente porque el control visual permita seleccionarla. La decisión exige completar todas las puertas anteriores y una prueba final con certificado real.
