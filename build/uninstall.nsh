!macro customUnInstall
  ; Datos del launcher (ajustes, skins, Java descargado)
  RMDir /r "$APPDATA\Nexus Launcher"
  RMDir /r "$APPDATA\nexus-launcher"
  ; Juego, versiones y assets que instalo el launcher
  RMDir /r "$APPDATA\.nexus-launcher"
!macroend
