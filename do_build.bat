@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" amd64
set PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
cd /d C:\dev\PEM-PrismaUI
echo === BUILDING ===
cmake --build build/release 2>&1
if errorlevel 1 (
    echo === BUILD FAILED ===
    exit /b 1
)
echo === BUILD SUCCEEDED ===
copy /y build\release\PEMPrismaUI.dll "X:\MODDINGSSE\modorganizer2\mods\PEM Prisma UI--Claude\SKSE\Plugins\PEMPrismaUI.dll"
echo === DEPLOYED TO MO2 ===
