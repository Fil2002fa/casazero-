$ErrorActionPreference = 'Continue'
$exitCode = 0

Write-Host "==> tsc --noEmit" -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { $exitCode = 1 }

Write-Host "==> next lint" -ForegroundColor Cyan
npm run lint --silent
if ($LASTEXITCODE -ne 0) { $exitCode = 1 }

Write-Host "==> git status --short" -ForegroundColor Cyan
git status --short

Write-Host "==> git diff --staged --stat" -ForegroundColor Cyan
git diff --staged --stat

exit $exitCode
