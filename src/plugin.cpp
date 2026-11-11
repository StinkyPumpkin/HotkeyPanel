#include "PrismaUIBridge.h"
#include "InputHandler.h"
#include "BlockerMenu.h"
#include "PickMode.h"

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
            BlockerMenu::Register();
            PrismaUIBridge::RegisterConsoleGuard();
            PickMode::Register();
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

// --Claude 11-11: Bye Sky UI's radial Tween opens the panel from its Mods fan and frees the panel's toggle key
extern "C" __declspec(dllexport) void HotkeyPanel_Toggle()
{
    SKSE::GetTaskInterface()->AddTask([] {
        auto* b = PrismaUIBridge::GetSingleton();
        if (!b || !b->IsReady()) return;
        if (b->IsVisible()) b->HideUI();
        else b->ShowUI();
    });
}
extern "C" __declspec(dllexport) void HotkeyPanel_SetHotkeyEnabled(bool a_on)
{
    if (auto* h = InputHandler::GetSingleton()) h->SetExternalOff(!a_on);
    SKSE::log::info("HotkeyPanel_SetHotkeyEnabled({}) - another mod {}", a_on, a_on ? "gave the toggle key back" : "opens the panel now");
}
