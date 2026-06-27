#pragma once

#include <RE/Skyrim.h>
#include <SKSE/SKSE.h>

// Headless Scaleform blocker menu — same pattern as FollowerUI/WhoreHorde
// and SLUI. Provides cursor + input-context separation so the PrismaUI
// overlay is clickable, WITHOUT hiding HUD or blocking Tab/Tween after close.
class BlockerMenu : public RE::IMenu {
public:
    static constexpr const char* MENU_NAME = "HKP_Blocker";

    BlockerMenu();
    ~BlockerMenu() override = default;

    static RE::IMenu* Creator() { return new BlockerMenu(); }
    static void Register();
    static void Open();
    static void Close();
    static bool IsOpen();
};
