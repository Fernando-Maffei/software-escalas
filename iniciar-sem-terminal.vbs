' =====================================================================
'  Central de Escalas - iniciador silencioso (sem janela de terminal)
'
'  Da um duplo clique neste arquivo para:
'    1) Subir o servidor em segundo plano, TOTALMENTE OCULTO
'       (nenhuma janela de terminal fica aberta)
'    2) Abrir a aplicacao no navegador padrao
'
'  Para ENCERRAR o servidor depois, use "parar-servidor.bat".
'  (o servidor fica invisivel, entao nao da pra "fechar a janela")
' =====================================================================
Option Explicit

Dim shell, fso, projeto, porta, urlApp, urlHealth
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Pasta onde este arquivo esta (raiz do projeto)
projeto = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = projeto

' Porta padrao do servidor (mude aqui se tiver alterado a porta)
porta = "4450"
urlApp = "http://localhost:" & porta & "/"
urlHealth = "http://localhost:" & porta & "/api/health"

' 1) Ja esta no ar? Entao so abre o navegador (nao sobe um segundo servidor).
If ServidorNoAr(urlHealth) Then
    shell.Run urlApp, 1, False
    WScript.Quit
End If

' 2) Primeira execucao (sem dependencias instaladas): usa o .bat visivel,
'    porque o "npm install" demora e precisa mostrar o andamento.
If Not fso.FolderExists(fso.BuildPath(projeto, "node_modules")) Then
    shell.Run """" & fso.BuildPath(projeto, "iniciar-servidor.bat") & """", 1, False
    WScript.Quit
End If

' 3) Sobe o Node completamente escondido (estilo de janela 0 = oculto).
shell.Run "cmd /c node backend\server.js", 0, False

' 4) Espera o servidor responder (ate ~20s) e abre a aplicacao.
Dim i, subiu
subiu = False
For i = 1 To 40
    WScript.Sleep 500
    If ServidorNoAr(urlHealth) Then
        subiu = True
        Exit For
    End If
Next

If subiu Then
    shell.Run urlApp, 1, False
Else
    MsgBox "Nao foi possivel iniciar o servidor automaticamente." & vbCrLf & vbCrLf & _
           "Rode 'iniciar-servidor.bat' (com janela) para ver a mensagem de erro.", _
           vbExclamation, "Central de Escalas"
End If

' ---------------------------------------------------------------------
' Retorna Verdadeiro se o servidor responder na porta (mesmo com erro
' de banco: qualquer resposta HTTP significa que o processo ja subiu).
Function ServidorNoAr(url)
    On Error Resume Next
    Dim http
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", url, False
    http.Send
    ServidorNoAr = (Err.Number = 0)
    On Error GoTo 0
End Function
