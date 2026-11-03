# Возвращает текущего пользователя Windows к состоянию «MD Viewer ни разу не запускали»:
# прячет папку %APPDATA%\MDViewer и убирает из реестра (HKCU) всё, что пишет
# mdviewer/win/associate.py. Чужие записи (браузер для .html и т. п.) не трогает.
#
# Сначала посмотреть, что будет сделано, ничего не меняя:
#   powershell -ExecutionPolicy Bypass -File tools\reset-mdviewer.ps1 -DryRun
# Выполнить:
#   powershell -ExecutionPolicy Bypass -File tools\reset-mdviewer.ps1

param([switch]$DryRun)

$ErrorActionPreference = 'Stop'

$AppTitle = 'MD Viewer'
$ProgIds = @('MDViewer.markdown', 'MDViewer.html')
$Exts = @('.md', '.markdown', '.html', '.htm')
$FileExtsBase = 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts'

$HKCU = [Microsoft.Win32.Registry]::CurrentUser
$changes = 0
$problems = @()

function Say($text) {
    if ($DryRun) { Write-Host "  [будет] $text" } else { Write-Host "  $text" }
}

function Remove-KeyTree($path) {
    $key = $HKCU.OpenSubKey($path)
    if ($null -eq $key) { return }
    $key.Close()
    Say "удалить раздел HKCU\$path"
    if (-not $DryRun) { $HKCU.DeleteSubKeyTree($path) }
    $script:changes++
}

function Remove-Value($path, $name) {
    $key = $HKCU.OpenSubKey($path, -not $DryRun)
    if ($null -eq $key) { return }
    try {
        if ($key.GetValueNames() -notcontains $name) { return }
        $shown = if ($name -eq '') { '(по умолчанию)' } else { $name }
        Say "удалить значение $shown в HKCU\$path"
        if (-not $DryRun) { $key.DeleteValue($name) }
        $script:changes++
    } finally {
        $key.Close()
    }
}

if (Get-Process -Name 'MDViewer' -ErrorAction SilentlyContinue) {
    Write-Host 'MD Viewer сейчас запущен. Закройте все его окна и запустите скрипт снова.' -ForegroundColor Yellow
    exit 1
}

if ($DryRun) { Write-Host 'Режим просмотра: ничего не меняется.' -ForegroundColor Cyan }

# --- Папка настроек, сессии, лога и личного словаря ---
Write-Host 'Папка данных:'
$dataDir = Join-Path $env:APPDATA 'MDViewer'
if (Test-Path -LiteralPath $dataDir) {
    $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $newName = "MDViewer_old_$stamp"
    Say "переименовать $dataDir -> $newName (личный словарь: $newName\user-dictionary.txt)"
    if (-not $DryRun) { Rename-Item -LiteralPath $dataDir -NewName $newName }
    $changes++
} else {
    Write-Host '  папки нет'
}

# --- Реестр ---
Write-Host 'Реестр:'

# Программы в «Открыть с помощью». При запуске из исходников раньше сюда попадал python.exe,
# поэтому ищем по FriendlyAppName, а не по имени exe.
$ourExes = @()
$apps = $HKCU.OpenSubKey('Software\Classes\Applications')
if ($null -ne $apps) {
    foreach ($name in $apps.GetSubKeyNames()) {
        $sub = $apps.OpenSubKey($name)
        if ($null -eq $sub) { continue }
        $friendly = $sub.GetValue('FriendlyAppName')
        $sub.Close()
        if ($friendly -eq $AppTitle) { $ourExes += $name }
    }
    $apps.Close()
}
foreach ($exe in $ourExes) { Remove-KeyTree "Software\Classes\Applications\$exe" }
if ($ourExes -notcontains 'MDViewer.exe') { $ourExes += 'MDViewer.exe' }

foreach ($prog in $ProgIds) { Remove-KeyTree "Software\Classes\$prog" }

foreach ($ext in $Exts) {
    $classes = "Software\Classes\$ext"
    $key = $HKCU.OpenSubKey($classes)
    if ($null -ne $key) {
        $default = $key.GetValue('')
        $key.Close()
        if ($ProgIds -contains $default) { Remove-Value $classes '' }
    }
    foreach ($prog in $ProgIds) { Remove-Value "$classes\OpenWithProgids" $prog }
    Remove-KeyTree "Software\Classes\SystemFileAssociations\$ext\shell\MDViewer"

    foreach ($prog in $ProgIds) { Remove-Value "$FileExtsBase\$ext\OpenWithProgids" $prog }

    # OpenWithList: буквы a, b, c… с именами exe и MRUList с их порядком
    $listPath = "$FileExtsBase\$ext\OpenWithList"
    $list = $HKCU.OpenSubKey($listPath, -not $DryRun)
    if ($null -ne $list) {
        try {
            $mru = [string]$list.GetValue('MRUList')
            foreach ($letter in $list.GetValueNames()) {
                if ($letter -eq 'MRUList') { continue }
                if ($ourExes -contains [string]$list.GetValue($letter)) {
                    Say "удалить $letter=$($list.GetValue($letter)) в HKCU\$listPath"
                    if (-not $DryRun) { $list.DeleteValue($letter) }
                    $mru = $mru.Replace($letter, '')
                    $changes++
                }
            }
            if (-not $DryRun -and $list.GetValueNames() -contains 'MRUList') {
                $list.SetValue('MRUList', $mru)
            }
        } finally {
            $list.Close()
        }
    }

    # Выбор «Всегда открывать в…». Windows защищает этот раздел, удалить его выходит не всегда.
    $choicePath = "$FileExtsBase\$ext\UserChoice"
    $choice = $HKCU.OpenSubKey($choicePath)
    if ($null -ne $choice) {
        $progId = [string]$choice.GetValue('ProgId')
        $choice.Close()
        $ours = ($ProgIds -contains $progId) -or ($ourExes | Where-Object { $progId -eq "Applications\$_" })
        if ($ours) {
            try {
                Remove-KeyTree $choicePath
            } catch {
                $problems += "${ext}: Windows не дала удалить выбор «всегда открывать в MD Viewer» ($progId)"
            }
        }
    }
}

Remove-KeyTree 'Software\MDViewer'
Remove-Value 'Software\RegisteredApplications' 'MDViewer'

# Сказать Проводнику, что ассоциации изменились, иначе он покажет старые иконки и меню
if (-not $DryRun -and $changes -gt 0) {
    Add-Type -Namespace MDViewerReset -Name Shell -MemberDefinition @'
[DllImport("shell32.dll")]
public static extern void SHChangeNotify(int eventId, uint flags, System.IntPtr item1, System.IntPtr item2);
'@
    [MDViewerReset.Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
}

Write-Host ''
if ($changes -eq 0) {
    Write-Host 'Следов MD Viewer не найдено: всё уже чисто.' -ForegroundColor Green
} elseif ($DryRun) {
    Write-Host "Будет изменено: $changes. Чтобы выполнить, запустите без -DryRun." -ForegroundColor Cyan
} else {
    Write-Host "Готово, изменено: $changes." -ForegroundColor Green
}
foreach ($p in $problems) { Write-Host "Внимание: $p" -ForegroundColor Yellow }
if ($problems.Count -gt 0) {
    Write-Host 'Это можно исправить вручную: Параметры -> Приложения -> Приложения по умолчанию -> выбрать другую программу для этого типа файлов.' -ForegroundColor Yellow
}
