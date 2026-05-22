$logFile = "C:\dev\PEM-PrismaUI\build_log.txt"
"Starting build..." | Out-File $logFile
$result = & cmd /c "`"C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat`" amd64 >nul 2>&1 & set `"PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%`" & cd /d C:\dev\PEM-PrismaUI & cmake --build build/release 2>&1"
$result | Out-File $logFile -Append
if ($LASTEXITCODE -eq 0) {
    "BUILD SUCCEEDED" | Out-File $logFile -Append
    Copy-Item "C:\dev\PEM-PrismaUI\build\release\PEMPrismaUI.dll" "X:\MODDINGSSE\modorganizer2\mods\PEM Prisma UI--Claude\SKSE\Plugins\PEMPrismaUI.dll" -Force
    "DEPLOYED" | Out-File $logFile -Append
} else {
    "BUILD FAILED (exit code $LASTEXITCODE)" | Out-File $logFile -Append
}
Write-Host "Done - see $logFile"
