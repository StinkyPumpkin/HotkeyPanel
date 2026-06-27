#include "BlockerMenu.h"

BlockerMenu::BlockerMenu() {
    // Headless — no SWF (avoids zombie-menu failure mode).
    inputContext = Context::kGameplay;
    depthPriority = 3;

    // kAllowSaving + kUsesCursor + kUpdateUsesCursor = cursor visible and
    // tracked, save works, but NO HUD hiding, NO pause, NO menu-stuck-after-close.
    menuFlags.set(RE::UI_MENU_FLAGS::kAllowSaving);
    menuFlags.set(RE::UI_MENU_FLAGS::kUsesCursor);
    menuFlags.set(RE::UI_MENU_FLAGS::kUpdateUsesCursor);
    // kPausesGame INTENTIONALLY OMITTED.
    // kDisablePauseMenu INTENTIONALLY OMITTED — leaving it set blocks Tab/Tween
    // re-activation after close (per FollowerUI src/BlockerMenu.cpp comment).
    // kHideOther / kMenuMode INTENTIONALLY OMITTED — HUD must stay visible.
}

void BlockerMenu::Register() {
    auto* ui = RE::UI::GetSingleton();
    if (!ui) {
        SKSE::log::error("BlockerMenu: RE::UI unavailable at register time");
        return;
    }
    ui->Register(MENU_NAME, BlockerMenu::Creator);
    SKSE::log::info("BlockerMenu: registered as '{}'", MENU_NAME);
}

void BlockerMenu::Open() {
    if (auto* mq = RE::UIMessageQueue::GetSingleton()) {
        mq->AddMessage(MENU_NAME, RE::UI_MESSAGE_TYPE::kShow, nullptr);
    }
}

void BlockerMenu::Close() {
    if (auto* mq = RE::UIMessageQueue::GetSingleton()) {
        mq->AddMessage(MENU_NAME, RE::UI_MESSAGE_TYPE::kHide, nullptr);
    }
}

bool BlockerMenu::IsOpen() {
    auto* ui = RE::UI::GetSingleton();
    return ui && ui->IsMenuOpen(MENU_NAME);
}
