' ==== Redemarrage silencieux : kill + rebuild + start, sans fenetre ====
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\claude 2026\school"
' 0 = fenetre cachee, False = ne pas attendre la fin
WshShell.Run "cmd /c ""restart-school.bat""", 0, False
Set WshShell = Nothing
