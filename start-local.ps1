param([switch]$Production)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Chưa có .venv. Xem README.md để cài dependencies.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'web\node_modules'))) { throw 'Chạy npm ci --prefix web trước.' }
$apiProcess = $null
$webProcess = $null
try {
    $apiProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory (Join-Path $projectRoot 'api') -WindowStyle Hidden -PassThru
    $taskName = if ($Production) { 'start' } else { 'dev' }
    $npmPath = (Get-Command npm.cmd).Source
    $webProcess = Start-Process -FilePath $npmPath -ArgumentList @('run',$taskName) -WorkingDirectory (Join-Path $projectRoot 'web') -WindowStyle Hidden -PassThru
    Write-Host 'FinScope: http://localhost:3000 | API: http://localhost:8000/docs'
    Write-Host 'Nhan Ctrl+C de dung hai service.'
    while (-not $apiProcess.HasExited -and -not $webProcess.HasExited) { Start-Sleep -Seconds 1 }
} finally {
    foreach ($ownedProcess in @($apiProcess,$webProcess)) {
        if ($ownedProcess -and -not $ownedProcess.HasExited) {
            & taskkill.exe /PID $ownedProcess.Id /T /F | Out-Null
        }
    }
}
