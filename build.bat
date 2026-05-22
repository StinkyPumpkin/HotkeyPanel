@echo off
REM Build HotkeyPanelPrisma SKSE DLL
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" amd64
set PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
cd /d C:\dev\HotkeyPanel-PrismaUI

if not exist build\release (
    echo === CONFIGURING ===
    cmake --preset release
    if errorlevel 1 (
        echo === CONFIGURE FAILED ===
        exit /b 1
    )
)

echo === BUILDING ===
cmake --build build/release
if errorlevel 1 (
    echo === BUILD FAILED ===
    exit /b 1
)

echo === BUILD SUCCEEDED ===
if exist build\release\HotkeyPanelPrisma.dll (
    copy /y build\release\HotkeyPanelPrisma.dll "X:\MODDINGSSE\modorganizer2\mods\Hotkey Panel--Claude\SKSE\Plugins\HotkeyPanelPrisma.dll"
    echo === DEPLOYED TO MO2 ===
) else (
    echo === DLL NOT FOUND ===
    exit /b 1
)
