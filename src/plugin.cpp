#include "PrismaUIBridge.h"
#include "InputHandler.h"

#include <spdlog/sinks/basic_file_sink.h>

namespace {
    void InitializeLogging() {
        auto path = SKSE::log::log_directory();
        if (!path) return;
        *path /= "HotkeyPanelPrisma.log";
        auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(path->string(), true);
        auto log = std::make_shared<spdlog::logger>("global log", std::move(sink));
        log->set_level(spdlog::level::info);
        log->flush_on(spdlog::level::info);
        spdlog::set_default_logger(std::move(log));
        spdlog::set_pattern("[%H:%M:%S.%e] [%l] %v");
        SKSE::log::info("HotkeyPanelPrisma v1.0.0 - logging initialized");
    }

    void MessageCallback(SKSE::MessagingInterface::Message* msg) {
        switch (msg->type) {
        case SKSE::MessagingInterface::kPostLoad:
            SKSE::log::info("PostLoad - initializing Prisma UI bridge...");
            if (PrismaUIBridge::GetSingleton()->Initialize()) {
                SKSE::log::info("Prisma UI bridge initialized!");
            } else {
                SKSE::log::warn("Prisma UI bridge init failed - PrismaUI.dll may not be installed");
            }
            break;
        case SKSE::MessagingInterface::kDataLoaded:
            SKSE::log::info("Data loaded - Hotkey Panel Prisma ready");
            InputHandler::GetSingleton()->Register();
            break;
        }
    }
}

SKSEPluginLoad(const SKSE::LoadInterface* skse) {
    InitializeLogging();
    SKSE::log::info("HotkeyPanelPrisma loading...");
    SKSE::Init(skse);

    auto messaging = SKSE::GetMessagingInterface();
    if (!messaging->RegisterListener(MessageCallback)) {
        SKSE::log::error("Failed to register messaging listener!");
        return false;
    }

    SKSE::log::info("HotkeyPanelPrisma loaded successfully! (no ESP, pure SKSE)");
    return true;
}
