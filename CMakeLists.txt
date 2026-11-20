cmake_minimum_required(VERSION 3.21)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>" CACHE STRING "")
# The DLL keeps its old name (HotkeyPanelPrisma.dll): another mod finds its exports by that name, and a renamed DLL
# would load beside the old one left in a mod folder.
project(HotkeyPanelPrisma VERSION 2.0.0 LANGUAGES CXX)

# 2.0.0: CommonLibSSE-NG from alandtse (github.com/alandtse/CommonLibSSE-NG, branch `ng`), built from source out of the
# pinned submodule extern/CommonLibSSE-NG (tag v9.1.0), as in Minimal Vitals. It reads the Address Library v5 database
# and sets the AddressLibraryV5 flag, so 1.7.x SKSE loads the DLL. Up to 1.x the vcpkg commonlibsse-ng 3.7.0 port was used.
set(CLIB_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/extern/CommonLibSSE-NG")
if(NOT EXISTS "${CLIB_SOURCE_DIR}/cmake/CommonLibSSE.cmake")
    message(FATAL_ERROR "extern/CommonLibSSE-NG is empty. Run: git submodule update --init --recursive --depth 1")
endif()
if(NOT EXISTS "${CLIB_SOURCE_DIR}/extern/openvr/lib/win64/openvr_api.lib")
    message(FATAL_ERROR "extern/CommonLibSSE-NG/extern/openvr is empty (VR is enabled). Run: git submodule update --init --recursive --depth 1")
endif()

# Every CACHE FORCE must precede add_subdirectory: option() inside NG cannot override an existing cache entry.
set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(SKSE_SUPPORT_XBYAK OFF CACHE BOOL "" FORCE)          # no trampoline hooks
set(SKSE_SUPPORT_PATCH_SAFETY OFF CACHE BOOL "" FORCE)
set(ENABLE_SKYRIM_SE ON CACHE BOOL "" FORCE)
set(ENABLE_SKYRIM_AE ON CACHE BOOL "" FORCE)             # AE = 1.6.x AND 1.7.x
set(ENABLE_SKYRIM_VR ON CACHE BOOL "" FORCE)
set(REX_OPTION_INI OFF CACHE BOOL "" FORCE)
set(REX_OPTION_JSON OFF CACHE BOOL "" FORCE)
set(REX_OPTION_TOML OFF CACHE BOOL "" FORCE)

add_subdirectory("${CLIB_SOURCE_DIR}" CommonLibSSE-NG)
file(READ "${CLIB_SOURCE_DIR}/vcpkg.json" _clib_manifest)
string(JSON HKP_CLIB_VERSION GET "${_clib_manifest}" "version-semver")
message(STATUS "CommonLibSSE-NG ${HKP_CLIB_VERSION} from ${CLIB_SOURCE_DIR}")
include("${CLIB_SOURCE_DIR}/cmake/CommonLibSSE.cmake")

add_commonlibsse_plugin(${PROJECT_NAME} MINIMUM_SKSE_VERSION 0.0.0 SOURCES
    src/plugin.cpp
    src/UIHost.cpp
    src/PrismaUIBridge.cpp
    src/JsonStore.cpp
    src/InputHandler.cpp
    src/BlockerMenu.cpp
    src/KeyPress.cpp
    src/PickMode.cpp
    src/RemoteServer.cpp
    src/HotkeyScan.cpp
    src/UserIcons.cpp
)
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_23)
target_precompile_headers(${PROJECT_NAME} PRIVATE PCH.h)
target_compile_definitions(${PROJECT_NAME} PRIVATE
    HKP_VERSION="${PROJECT_VERSION}"
    HKP_COMMONLIB_VERSION="${HKP_CLIB_VERSION}"
)

# Tablet remote: header-only cpp-httplib. Its TU skips the CommonLib PCH because httplib has to
# include winsock2.h before anything includes windows.h.
find_path(CPP_HTTPLIB_INCLUDE_DIRS "httplib.h" REQUIRED)
target_include_directories(${PROJECT_NAME} PRIVATE ${CPP_HTTPLIB_INCLUDE_DIRS})
set_source_files_properties(src/RemoteServer.cpp PROPERTIES SKIP_PRECOMPILE_HEADERS ON)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_SOURCE_DIR}/include
)

# No copy into the mod folder here: build.bat copies only when asked ("build.bat deploy"), never while the game runs.
