# ⬡ Nexus Launcher

Launcher moderno para **Minecraft: Java Edition** — Electron + React + TypeScript.

## 📥 Descargar

Desde [GitHub Actions](../../actions) o [Releases](../../releases):

| Archivo | Descripción |
|---------|-------------|
| `Nexus-Launcher-x.x.x-Setup.exe` | **Instalador recomendado** — crea acceso directo en escritorio y menú inicio |
| `Nexus-Launcher-x.x.x-portable.exe` | Portable — no requiere instalación |

## ✨ Características

- 🔑 **Cuenta Microsoft** (Xbox Live / cuenta premium real)
- 👤 **Perfil Offline** (singleplayer y servidores con `online-mode=false`)
- ☕ **Java automático** — detecta e instala la versión correcta según la versión de Minecraft:
  - Minecraft ≥ 1.21 → Java 21
  - Minecraft 1.17–1.20 → Java 17
  - Minecraft < 1.17 → Java 8
- ✅ Verificación SHA-1 de todos los archivos descargados
- 🔒 Tokens almacenados cifrados con `safeStorage` de Electron

## 🛡️ Seguridad

Este launcher **no** incluye ningún tipo de crack, bypass de autenticación, ni método para jugar sin licencia.
El modo offline solo permite singleplayer, LAN y servidores con `online-mode=false`.

## 🔧 Configuración de Microsoft Entra (para desarrolladores)

Para que el login con Microsoft funcione en tu build local:

1. Ir a [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **Registros de aplicaciones**
2. Crear nueva aplicación → tipo "Cuentas personales de Microsoft"
3. En **Autenticación** → agregar plataforma **Móvil y escritorio** → URI de redirección: `msal://redirect`
4. Habilitar **Flujos de cliente públicos**
5. Copiar el **Application (client) ID**
6. En GitHub → Settings → Secrets → `MS_CLIENT_ID` = tu Client ID

## 🏗️ Compilar localmente

```bash
npm install
npm run build
npx electron-builder --win --x64
# Los .exe quedan en /release/
```

## 📋 Requisitos

- Node.js 20+
- Windows 10/11 x64 (para el .exe)
