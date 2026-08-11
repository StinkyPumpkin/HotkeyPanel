cmake_minimum_required(VERSION 3.21)
project(GKeysInputBridge VERSION 1.0.0 LANGUAGES CXX)

# Personal add-on: deploys into the HKP GKeys Addon mod folder
if(DEFINED ENV{SKYRIM_MODS_FOLDER} AND IS_DIRECTORY "$ENV{SKYRIM_MODS_FOLDER}")
    set(OUTPUT_FOLDER "$ENV{SKYRIM_MODS_FOLDER}/HKP GKeys Addon--Claude")
endif()
find_package(CommonLibSSE CONFIG REQUIRED)
add_commonlibsse_plugin(${PROJECT_NAME} SOURCES
    src/plugin.cpp
)
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_23)
target_precompile_headers(${PROJECT_NAME} PRIVATE PCH.h)

set(DLL_FOLDER "${OUTPUT_FOLDER}/SKSE/Plugins")
message(STATUS "SKSE plugin output: ${DLL_FOLDER}")
add_custom_command(
    TARGET "${PROJECT_NAME}" POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${DLL_FOLDER}"
    COMMAND "${CMAKE_COMMAND}" -E copy_if_different "$<TARGET_FILE:${PROJECT_NAME}>" "${DLL_FOLDER}/$<TARGET_FILE_NAME:${PROJECT_NAME}>"
    VERBATIM
)
