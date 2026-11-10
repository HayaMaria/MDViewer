; Установщик MD Viewer (Inno Setup 6). Собирается из build.bat:
;   ISCC /DAppVersion=1.0 installer\MDViewer.iss
; Берёт готовую сборку из dist\MDViewer и кладёт setup.exe в dist.
; Необязательно: /DCompression=none (или lzma2/max и т.п.) — степень сжатия,
; /DOutputSuffix=xxx — приписка к имени файла.

#ifndef AppVersion
  #error Передайте версию: ISCC /DAppVersion=1.0 installer\MDViewer.iss
#endif
#ifndef Compression
  ; zip, а не lzma2/max: сильно сжатый установщик эвристика антивирусов
  ; принимает за «запутанный» файл (VirusTotal 10.11.2026: lzma2/max 2/71,
  ; zip 1/71, без сжатия 2/68). Разница в размере ~3 МБ.
  #define Compression "zip"
#endif

#define AppName "MD Viewer"
#define AppExe "MDViewer.exe"
#define AppPublisher "HayaMaria"
#define WebView2Setup "MicrosoftEdgeWebview2Setup.exe"

[Setup]
; AppId не менять никогда: по нему новая версия находит и обновляет старую
AppId={{62299243-C96C-496D-9806-9F55E4A2B76C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
VersionInfoVersion={#AppVersion}
VersionInfoProductVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=Установщик {#AppName}
VersionInfoProductName={#AppName}
VersionInfoCopyright=© 2026 {#AppPublisher}

; Установка для текущего пользователя: без запроса прав администратора,
; в %LOCALAPPDATA%\Programs. Записи в реестре — тоже в разделе пользователя.
PrivilegesRequired=lowest
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

SourceDir=..
OutputDir=dist
#ifdef OutputSuffix
OutputBaseFilename=MDViewer-{#AppVersion}-setup-{#OutputSuffix}
#else
OutputBaseFilename=MDViewer-{#AppVersion}-setup
#endif
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression={#Compression}
#if Pos("lzma", Compression) == 1
SolidCompression=yes
#endif
WizardStyle=modern
; Если программа запущена, установщик предложит её закрыть
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "ru"; MessagesFile: "compiler:Languages\Russian.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Ярлыки:"

[Files]
Source: "dist\MDViewer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Официальный маленький установщик WebView2 от Microsoft (докачивает остальное сам).
; Нужен только там, где WebView2 нет; после установки удаляется.
Source: "installer\redist\{#WebView2Setup}"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: WebView2Missing

[InstallDelete]
; Старые файлы от прошлой версии убираются: в _internal могли остаться лишние
Type: filesandordirs; Name: "{app}\_internal"

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
; MD Viewer в списке «Открыть с помощью» для .md, .markdown, .txt, .html, .htm.
; Программой по умолчанию НЕ назначаем: пользователь выберет сам
; («Открыть с помощью» → MD Viewer → «Всегда»). При удалении всё убирается.
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "{#AppName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\DefaultIcon"; ValueType: string; ValueData: """{app}\{#AppExe}"",0"
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".md"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".markdown"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".txt"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".html"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".htm"; ValueData: ""

Root: HKA; Subkey: "Software\Classes\MDViewer.markdown"; ValueType: string; ValueData: "Документ Markdown"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\MDViewer.markdown\DefaultIcon"; ValueType: string; ValueData: """{app}\{#AppExe}"",0"
Root: HKA; Subkey: "Software\Classes\MDViewer.markdown\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""
Root: HKA; Subkey: "Software\Classes\MDViewer.text"; ValueType: string; ValueData: "Текстовый документ"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\MDViewer.text\DefaultIcon"; ValueType: string; ValueData: """{app}\{#AppExe}"",0"
Root: HKA; Subkey: "Software\Classes\MDViewer.text\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""
Root: HKA; Subkey: "Software\Classes\MDViewer.html"; ValueType: string; ValueData: "Документ HTML"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\MDViewer.html\DefaultIcon"; ValueType: string; ValueData: """{app}\{#AppExe}"",0"
Root: HKA; Subkey: "Software\Classes\MDViewer.html\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""

Root: HKA; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "MDViewer.markdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueType: string; ValueName: "MDViewer.markdown"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\.txt\OpenWithProgids"; ValueType: string; ValueName: "MDViewer.text"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\.html\OpenWithProgids"; ValueType: string; ValueName: "MDViewer.html"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\.htm\OpenWithProgids"; ValueType: string; ValueName: "MDViewer.html"; ValueData: ""; Flags: uninsdeletevalue

[Run]
Filename: "{tmp}\{#WebView2Setup}"; Parameters: "/silent /install"; StatusMsg: "Установка Microsoft Edge WebView2..."; Flags: waituntilterminated; Check: WebView2Missing
Filename: "{app}\{#AppExe}"; Description: "Запустить {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
// ===== WebView2 =====
// Те же записи, что проверяет программа (mdviewer\win\webview2.py).
const
  WebView2Key = 'Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function HasVersion(Root: Integer; Subkey: String): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(Root, Subkey, 'pv', Version)
    and (Version <> '') and (Version <> '0.0.0.0');
end;

function WebView2Missing(): Boolean;
begin
  Result := not (HasVersion(HKLM32, 'SOFTWARE\' + WebView2Key)
    or HasVersion(HKLM64, 'SOFTWARE\' + WebView2Key)
    or HasVersion(HKCU, 'Software\' + WebView2Key));
end;

// ===== Записи, которые оставляли версии до 1.0 =====
// Раньше программа сама при каждом запуске назначала себя для .md и добавляла
// пункт «Открыть в MD Viewer». Убираем это при установке и при удалении.
procedure RemoveLegacyAssociations();
var
  Exts: array of String;
  I: Integer;
  Value: String;
begin
  RegDeleteKeyIncludingSubkeys(HKCU, 'Software\MDViewer');
  RegDeleteValue(HKCU, 'Software\RegisteredApplications', 'MDViewer');
  Exts := ['.md', '.markdown', '.txt', '.html', '.htm'];
  for I := 0 to GetArrayLength(Exts) - 1 do
  begin
    RegDeleteKeyIncludingSubkeys(HKCU,
      'Software\Classes\SystemFileAssociations\' + Exts[I] + '\shell\MDViewer');
    // Программу по умолчанию сбрасываем, только если это всё ещё мы
    if RegQueryStringValue(HKCU, 'Software\Classes\' + Exts[I], '', Value)
       and (Pos('MDViewer.', Value) = 1) then
      RegDeleteValue(HKCU, 'Software\Classes\' + Exts[I], '');
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    RemoveLegacyAssociations();
  if (CurStep = ssPostInstall) and WebView2Missing() and not WizardSilent() then
    MsgBox('Не удалось установить Microsoft Edge WebView2 — без него MD Viewer не запустится.' + #13#10#13#10 +
      'Проверьте подключение к интернету и запустите установку MD Viewer ещё раз.',
      mbError, MB_OK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveLegacyAssociations();
end;
