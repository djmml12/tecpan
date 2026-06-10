; Fénix POS — NSIS custom hook
; Se ejecuta al final del proceso de desinstalación.
; Pregunta si el usuario desea borrar la base de datos y configuración.

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "¿Deseas eliminar también la base de datos y configuración de Fénix POS?$\n$\nEsto borrará permanentemente todos los datos: ventas, productos, usuarios y configuración SMTP." \
    IDYES DeleteUserData IDNO SkipDelete

  DeleteUserData:
    RMDir /r "$APPDATA\pos-tablet"

  SkipDelete:
!macroend
