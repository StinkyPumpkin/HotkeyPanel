@echo off
REM Hotkey Panel 2.0+: CommonLibSSE-NG built from the pinned submodule extern\CommonLibSSE-NG (as Minimal Vitals).
REM VS2022 Community (14.44) environment; the overlay triplet in cmake\ pins vcpkg deps to the same toolset.
REM   build.bat          builds build\ng\release\HotkeyPanelPrisma.dll and GKeysInputBridge.dll (G-keys option) only
REM   build.bat deploy   also copies it into %SKYRIM_MODS_FOLDER%\Hotkey Panel--Claude\SKSE\Plugins (never while the game runs)
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" amd64
set VCPKG_ROOT=C:\vcpkg
cd /d %~dp0
if not exist extern\CommonLibSSE-NG\cmake\CommonLibSSE.cmake (
    echo === extern\CommonLibSSE-NG missing: git submodule update --init --recursive --depth 1 ===
    exit /b 1
)
if not exist build\ng\release\build.ninja (
    echo === CONFIGURING ===
    cmake --preset release
    if errorlevel 1 ( echo === CONFIGURE FAILED === & exit /b 1 )
)
echo === BUILDING ===
cmake --build build\ng\release
if errorlevel 1 ( echo === BUILD FAILED === & exit /b 1 )
echo === BUILD SUCCEEDED ===
if not exist build\ng\release\HotkeyPanelPrisma.dll ( echo === DLL NOT FOUND === & exit /b 1 )
echo DLL: build\ng\release\HotkeyPanelPrisma.dll
if /i "%1"=="deploy" (
    tasklist /fi "imagename eq SkyrimSE.exe" | find /i "SkyrimSE.exe" >nul && ( echo === SKYRIM IS RUNNING - NOT DEPLOYED === & exit /b 1 )
    if not defined SKYRIM_MODS_FOLDER ( echo === SKYRIM_MODS_FOLDER not set - NOT DEPLOYED === & exit /b 1 )
    copy /y build\ng\release\HotkeyPanelPrisma.dll "%SKYRIM_MODS_FOLDER%\Hotkey Panel--Claude\SKSE\Plugins\HotkeyPanelPrisma.dll"
    if exist "%SKYRIM_MODS_FOLDER%\HKP GKeys Addon--Claude\SKSE\Plugins" copy /y build\ng\release\GKeysInputBridge.dll "%SKYRIM_MODS_FOLDER%\HKP GKeys Addon--Claude\SKSE\Plugins\GKeysInputBridge.dll"
    echo === DEPLOYED ===
)
