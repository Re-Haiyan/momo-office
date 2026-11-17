# Install/uninstall integration check for disposable Windows CI runners only.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:OS -ne 'Windows_NT') { throw 'Run this integration test only in disposable Windows CI.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$setup = (Get-Item "output/Momo-Office-$version-Setup.exe").FullName
$installDirectory = Join-Path $env:RUNNER_TEMP ("Momo Office Install Test-" + [guid]::NewGuid().ToString())
$appExe = Join-Path $installDirectory 'Momo Office.exe'
$uninstaller = Join-Path $installDirectory 'Uninstall Momo Office.exe'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Momo Office.lnk'
$startShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Momo Office.lnk'
$dataFolder = Join-Path $env:APPDATA 'momo-office\office'
$probe = Join-Path $dataFolder ("uninstall-preserve-" + [guid]::NewGuid().ToString() + '.txt')
New-Item -ItemType Directory -Path $dataFolder -Force | Out-Null
Set-Content -LiteralPath $probe -Value 'Preserve user data when uninstalling the application.'
try {
    # NSIS requires /D to be the final argument and does not quote its path.
    $install = Start-Process -FilePath $setup -ArgumentList @('/S', "/D=$installDirectory") -Wait -PassThru
    if ($install.ExitCode -ne 0) { throw "Installer failed with code $($install.ExitCode)." }
    if (!(Test-Path -LiteralPath $appExe)) { throw 'The chosen application folder did not contain the app executable.' }
    if (!(Test-Path -LiteralPath $uninstaller)) { throw 'An uninstaller was not created inside the application folder.' }
    if (!(Test-Path -LiteralPath $desktopShortcut) -or !(Test-Path -LiteralPath $startShortcut)) { throw 'Desktop and Start menu shortcuts were not created.' }
    $registration = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'Momo Office' -and $_.UninstallString -and $_.UninstallString.Contains($uninstaller) }
    if (!$registration) { throw 'The application was not registered in Windows Installed apps.' }
    $env:ELECTRON_EXECUTABLE = $appExe
    $env:MOMO_PACKAGED = '1'
    node tests/desktop.cjs
    if ($LASTEXITCODE -ne 0) { throw 'The installed desktop app failed its startup/shutdown test.' }
    $remove = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
    if ($remove.ExitCode -ne 0) { throw "Uninstaller failed with code $($remove.ExitCode)." }
    for ($i = 0; $i -lt 60 -and (Test-Path -LiteralPath $appExe); $i++) { Start-Sleep -Milliseconds 500 }
    if (Test-Path -LiteralPath $appExe) { throw 'The uninstaller did not remove the installed application.' }
    if ((Test-Path -LiteralPath $desktopShortcut) -or (Test-Path -LiteralPath $startShortcut)) { throw 'The uninstaller did not remove app shortcuts.' }
    if (!(Test-Path -LiteralPath $probe)) { throw 'The uninstaller deleted saved user data.' }
    Write-Host 'PASS: installer uses the chosen folder, creates its uninstaller and Windows registration, installed app loads correctly, uninstall removes the app and preserves user data.'
} finally {
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
    Remove-Item Env:ELECTRON_EXECUTABLE -ErrorAction SilentlyContinue
    Remove-Item Env:MOMO_PACKAGED -ErrorAction SilentlyContinue
}
