@echo off
REM One-shot: reconfigure with the VS18 BuildTools toolset (the one vcpkg used to
REM build CommonLibSSE.lib) and build. _build_run.bat uses VS2022 Community 14.44,
REM which mismatches and fails to link (__std_replace_copy_2).
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" amd64
set PATH=C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
set VCPKG_ROOT=C:\vcpkg
cd /d %~dp0

echo === CONFIGURING ===
cmake --preset release
if errorlevel 1 (
    echo === CONFIGURE FAILED ===
    exit /b 1
)

echo === BUILDING ===
cmake --build build/release
if errorlevel 1 (
    echo === BUILD FAILED ===
    exit /b 1
)

echo === BUILD SUCCEEDED ===
