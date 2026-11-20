"""Builds the Hotkey Panel's icon library from the author's own pictures (made for their other UI work).

  icons/menus/<id>.png  - mod / game menu pictures (256 px sources)
  icons/items/<id>.png  - item pictures (160 px sources)
  js/iconlib.js         - the list the page reads (id, name, group)

Pictures are saved at 128 px. Run after changing the lists below:
  python tools/build_icons.py <menu pictures folder> <item pictures folder>
The line icons are drawn in js/lineicons.js and are not touched here."""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
VIEW = os.path.normpath(os.path.join(HERE, '..', 'dist', 'PrismaUI', 'views', 'HotkeyPanel'))
MENU_SRC = ITEM_SRC = ''
SIZE = 128

MENUS = [
    ('bath', 'Bath'), ('book', 'Book'), ('calendar', 'Calendar'), ('camp', 'Camp'), ('customskills', 'Skill tree'),
    ('fittingroom', 'Hanger'), ('followers', 'Followers'), ('gallery', 'Gallery'), ('generic', 'Rune stone'),
    ('horse', 'Horse'), ('hotkeys', 'Keyboard'), ('inventory', 'Satchel'), ('itemvault', 'Vault'),
    ('journal', 'Journal'), ('ledger', 'Rose book'), ('magic', 'Magic'), ('map', 'Map'), ('mcm', 'MCM'),
    ('menus', 'Menus'), ('mods', 'Mods'), ('outfits', 'Outfits'), ('photo', 'Portrait'), ('racemenu', 'Mirror'),
    ('save', 'Save'), ('shower', 'Shower'), ('skills', 'Skills'), ('skse', 'SKSE'), ('soap', 'Soap'),
    ('teleport', 'Portal'), ('wait', 'Wait'),
]

ITEMS = [
    ('Potions', [
        ('potion_restore_health', 'Health potion'), ('potion_restore_magicka', 'Magicka potion'),
        ('potion_restore_stamina', 'Stamina potion'), ('potion_fortify_health', 'Fortify health'),
        ('potion_fortify_skill', 'Fortify skill'), ('potion_invisibility', 'Invisibility'),
        ('potion_night_eye_detect', 'Night eye'), ('potion_resist_fire', 'Resist fire'),
        ('potion_resist_cold_standard', 'Resist frost'), ('potion_resist_shock', 'Resist shock'),
        ('potion_resist_magic', 'Resist magic'), ('potion_cure_disease_poison', 'Cure disease'),
        ('potion_waterbreathing', 'Waterbreathing'), ('potion_drug_skooma', 'Skooma'),
        ('potion_blood_potion', 'Blood potion'), ('poison_damage_health', 'Poison'),
        ('poison_damage_magicka', 'Magicka poison'), ('poison_damage_stamina', 'Stamina poison'),
        ('poison_paralysis', 'Paralysis poison'), ('poison_fear_frenzy', 'Frenzy poison'),
    ]),
    ('Magic', [
        ('scroll_alteration', 'Alteration scroll'), ('scroll_conjuration', 'Conjuration scroll'),
        ('scroll_destruction', 'Destruction scroll'), ('scroll_illusion', 'Illusion scroll'),
        ('scroll_restoration', 'Restoration scroll'), ('book_spelltome_alteration', 'Alteration tome'),
        ('book_spelltome_conjuration', 'Conjuration tome'), ('book_spelltome_destruction', 'Destruction tome'),
        ('book_spelltome_illusion', 'Illusion tome'), ('book_spelltome_restoration', 'Restoration tome'),
        ('weapon_staff_alteration', 'Alteration staff'), ('weapon_staff_conjuration', 'Conjuration staff'),
        ('weapon_staff_destruction', 'Destruction staff'), ('weapon_staff_illusion', 'Illusion staff'),
        ('weapon_staff_restoration', 'Restoration staff'), ('soulgem_common_filled', 'Soul gem'),
        ('soulgem_grand_filled', 'Grand soul gem'), ('soulgem_black_filled', 'Black soul gem'),
        ('soulgem_azuras_star', "Azura's Star"), ('book_elder_scroll', 'Elder Scroll'),
    ]),
    ('Weapons', [
        ('weapon_sword_steel', 'Sword'), ('weapon_dagger_steel', 'Dagger'), ('weapon_greatsword_steel', 'Greatsword'),
        ('weapon_battleaxe_steel', 'Battleaxe'), ('weapon_mace_steel', 'Mace'), ('weapon_warhammer_steel', 'Warhammer'),
        ('weapon_bow_steel', 'Bow'), ('weapon_crossbow_steel', 'Crossbow'), ('ammo_arrow_iron', 'Arrow'),
        ('ammo_bolt_steel', 'Bolt'), ('weapon_sword_daedric', 'Daedric sword'), ('weapon_bow_daedric', 'Daedric bow'),
        ('weapon_pickaxe_tool_steel', 'Pickaxe'),
    ]),
    ('Armour', [
        ('armor_generic_heavy_helmet', 'Helmet'), ('armor_generic_heavy_cuirass', 'Cuirass'),
        ('armor_generic_heavy_gauntlets', 'Gauntlets'), ('armor_generic_heavy_boots', 'Boots'),
        ('armor_generic_heavy_shield', 'Shield'), ('armor_generic_light_extra_hood', 'Hood'),
        ('armor_generic_light_extra_cloak_cape', 'Cloak'), ('armor_generic_light_extra_backpack_bag', 'Backpack'),
        ('jewel_ring_gold', 'Ring'), ('jewel_necklace_amulet_gold', 'Amulet'), ('jewel_circlet_tiara_gold', 'Circlet'),
    ]),
    ('Gear', [
        ('light_torch', 'Torch'), ('light_lantern', 'Lantern'), ('misc_lockpick', 'Lockpick'), ('key_key', 'Key'),
        ('key_ornate_key', 'Ornate key'), ('misc_gold_coins', 'Gold'), ('misc_gold_coin_purse_medium', 'Coin purse'),
        ('misc_camping_gear', 'Camping gear'), ('misc_camping_torchbug_in_a_jar', 'Torchbug jar'),
        ('misc_hammer', 'Hammer'), ('misc_shovel', 'Shovel'), ('misc_instrument_lute', 'Lute'),
        ('misc_instrument_drum', 'Drum'), ('misc_instrument_flute', 'Flute'), ('misc_instrument_nord_war_horn', 'War horn'),
        ('misc_dragon_claw_golden_claw', 'Golden claw'), ('misc_dragon_bone', 'Dragon bone'),
        ('misc_dragon_scales', 'Dragon scales'), ('misc_trophy_skull', 'Skull'), ('book_treasure_map', 'Treasure map'),
        ('book_journal_diary', 'Diary'), ('book_letter', 'Letter'), ('book_recipe', 'Recipe'),
    ]),
    ('Food and drink', [
        ('food_sweetroll', 'Sweetroll'), ('food_apple', 'Apple'), ('food_bread_loaf', 'Bread'),
        ('food_cheese_wheel', 'Cheese'), ('food_stew', 'Stew'), ('food_steak', 'Steak'),
        ('food_cooked_fish', 'Cooked fish'), ('food_honey', 'Honey'), ('drink_mead', 'Mead'), ('drink_wine', 'Wine'),
        ('drink_water', 'Water'), ('drink_tea', 'Tea'), ('misc_tankard', 'Tankard'),
    ]),
]


def shrink(src, dst):
    im = Image.open(src).convert('RGBA')
    if im.size != (SIZE, SIZE):
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(dst, optimize=True)


def main():
    global MENU_SRC, ITEM_SRC
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    MENU_SRC, ITEM_SRC = sys.argv[1], sys.argv[2]
    missing = [m for m, _ in MENUS if not os.path.isfile(os.path.join(MENU_SRC, m + '.png'))]
    missing += [i for _, lst in ITEMS for i, _ in lst if not os.path.isfile(os.path.join(ITEM_SRC, i + '.png'))]
    if missing:
        sys.exit('missing pictures: ' + ', '.join(missing))
    out_m, out_i = os.path.join(VIEW, 'icons', 'menus'), os.path.join(VIEW, 'icons', 'items')
    for d in (out_m, out_i):
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):            # a picture taken off the lists goes too
            if f.endswith('.png'):
                os.remove(os.path.join(d, f))
    lib = {'menus': [], 'items': []}
    for m, name in MENUS:
        shrink(os.path.join(MENU_SRC, m + '.png'), os.path.join(out_m, m + '.png'))
        lib['menus'].append([m, name])
    for group, lst in ITEMS:
        for i, name in lst:
            shrink(os.path.join(ITEM_SRC, i + '.png'), os.path.join(out_i, i + '.png'))
            lib['items'].append([i, name, group])
    js = ('/* generated by tools/build_icons.py - do not edit */\n'
          'window.HKP_ICONLIB = ' + json.dumps(lib, separators=(',', ':')) + ';\n')
    with open(os.path.join(VIEW, 'js', 'iconlib.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    total = sum(os.path.getsize(os.path.join(d, f)) for d in (out_m, out_i) for f in os.listdir(d))
    print('%d menu + %d item pictures, %.1f MB' % (len(lib['menus']), len(lib['items']), total / 1048576))


if __name__ == '__main__':
    main()
