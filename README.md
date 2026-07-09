# Motomania Frontend Skill

Skill de Codex para auditar, medir y corregir pantallas frontend de Motomania Web con validacion visual y contratos de UI.

## Recuperacion

1. Clonar este repositorio.
2. Copiar la carpeta en `C:\Users\luis1\.agents\skills\motomaniafrontend`.
3. Instalar dependencias desde la carpeta de la skill:

```powershell
npm install
npx playwright install chromium
```

4. Verificar que exista `SKILL.md`, `agents/openai.yaml`, `references/`, `scripts/` y `assets/`.

Si se necesita recuperar exactamente la instalacion que existia antes del respaldo, usar `_backups/motomaniafrontend-full-backup-2026-07-08.zip`.

Nota: los navegadores descargados por Playwright viven fuera de esta skill, normalmente en `C:\Users\luis1\AppData\Local\ms-playwright`. No se versionan como archivos normales del repo porque son binarios grandes y regenerables. Despues de restaurar la skill, `npx playwright install chromium` los vuelve a descargar.

## Contenido principal

- `SKILL.md`: instrucciones principales de la skill.
- `agents/openai.yaml`: nombre visible y prompt base.
- `references/`: contratos, flujo de trabajo y reglas de validacion.
- `scripts/`: herramientas de medicion y auditoria.
- `assets/`: recursos auxiliares de UI.
- `examples/`: plantilla de reporte.
- `_backups/`: copia comprimida de emergencia de la instalacion local.
