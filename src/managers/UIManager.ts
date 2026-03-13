import * as PIXI from 'pixi.js';
import { EventEmitter } from '../utils/EventEmitter';
import { ItemCatalog, ItemData, ItemCategory } from '../garden/ItemCatalog';
import { GameConfig } from '../core/GameConfig';

type ImgKey = keyof typeof GameConfig.ASSETS.IMAGES;

/**
 * UIManager — replicates the reference game UI:
 *
 *  TOP-RIGHT: coin counter (gem icon)
 *  LEFT SIDEBAR: Crop | Cattle buttons → expands to item sub-list
 *  IN-WORLD: handled by ZoneHints (+ sprites)
 *  BOTTOM-CENTER: placement prompt when item selected
 *
 * Events:
 *  'itemSelected'  (item: ItemData | null)
 *  'dayNight'
 *  'mute'
 *  'tutDone'
 */
export class UIManager extends EventEmitter {
  private _pixi!:    PIXI.Application;
  private _root!:    HTMLElement;

  // DOM panels
  private _sidebar!: HTMLElement;
  private _coinEl!:  HTMLElement;
  private _prompt!:  HTMLElement;
  private _toastWrap!: HTMLElement;

  private _coins: number = GameConfig.START_COINS;
  private _selItem: ItemData | null = null;
  private _menuOpen = false;
  private _openCat: ItemCategory | null = null;
  private _animalCount = 0;
  private _plantCount  = 0;
  private _upgradeModal!: HTMLElement;
  private _skipDayBtn!:   HTMLElement;

  async init(container: HTMLElement): Promise<void> {
    this._root = container;
    this._injectStyles();
    this._buildCoinHUD();
    this._buildSidebar();
    this._buildPrompt();
    this._buildToasts();
    this._buildUpgradeModal();
    this._initPixi();
    window.addEventListener('resize', () => this._pixi.renderer.resize(innerWidth, innerHeight));
  }

  // ════════════════════════════════════════════════════════════════
  //  STYLES
  // ════════════════════════════════════════════════════════════════
  private _injectStyles(): void {
    const s = document.createElement('style');
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;700;800;900&display=swap');

      :root {
        --gm-green:      #3ddc68;
        --gm-green-dark: #1a8c3a;
        --gm-blue:       #4ab8ff;
        --gm-blue-dark:  #1a6aaa;
        --gm-gold:       #f5c430;
        --gm-dark:       rgba(0,0,0,0.78);
        --gm-radius:     14px;
        --gm-font-title: 'Fredoka One', cursive;
        --gm-font-body:  'Nunito', sans-serif;
        --sb-w:          clamp(120px, 22vw, 180px);
        --icon-size:     clamp(52px, 9vw, 72px);
        --fs-label:      clamp(13px, 2.5vw, 17px);
        --fs-cost:       clamp(11px, 2vw, 14px);
      }

      /* ── Coin HUD ──────────────────────────────────────────── */
      #gm-coin-hud {
        position:       absolute;
        top:            clamp(10px,2vh,18px);
        right:          clamp(10px,2vw,20px);
        z-index:        40;
        display:        flex;
        align-items:    center;
        gap:            8px;
        background:     var(--gm-dark);
        border-radius:  var(--gm-radius);
        padding:        8px 16px 8px 10px;
        border:         1px solid rgba(255,255,255,0.15);
        backdrop-filter: blur(8px);
        pointer-events: none;
      }
      #gm-coin-gem {
        width:  clamp(26px,5vw,36px);
        height: clamp(26px,5vw,36px);
        object-fit: contain;
        flex-shrink: 0;
        filter: drop-shadow(0 0 6px rgba(100,255,150,0.5));
      }
      #gm-coin-val {
        font-family: var(--gm-font-title);
        font-size:   clamp(20px,4vw,30px);
        color:       #fff;
        text-shadow: 0 2px 8px rgba(0,0,0,0.5);
      }

      /* ── WATERMARK logo ────────────────────────────────────── */
      #gm-watermark {
        position:       absolute;
        top:            clamp(8px,1.5vh,16px);
        left:           clamp(8px,1.5vw,16px);
        z-index:        40;
        opacity:        0.55;
        pointer-events: none;
        width:          clamp(36px,6vw,60px);
        height:         auto;
        filter:         drop-shadow(0 2px 6px rgba(0,0,0,0.4));
        transition:     opacity .3s;
      }
      #gm-watermark:hover { opacity: 0.85; }

      /* ── LEFT SIDEBAR ─────────────────────────────────────── */
      #gm-sidebar {
        position:       absolute;
        left:           0;
        top:            50%;
        transform:      translateY(-50%);
        z-index:        40;
        display:        flex;
        flex-direction: column;
        gap:            clamp(6px,1.2vh,10px);
        padding:        clamp(8px,1.5vw,14px);
        pointer-events: all;
      }

      .gm-sb-row {
        display:        flex;
        align-items:    center;
        gap:            0;
        position:       relative;
      }

      /* Main category button */
      .gm-cat-btn {
        width:           var(--icon-size);
        height:          var(--icon-size);
        border-radius:   var(--gm-radius);
        border:          2px solid rgba(255,255,255,0.2);
        background:      var(--gm-dark);
        backdrop-filter: blur(8px);
        cursor:          pointer;
        display:         flex;
        align-items:     center;
        justify-content: center;
        transition:      transform .18s, box-shadow .18s, border-color .18s;
        position:        relative;
        flex-shrink:     0;
        overflow:        hidden;
      }
      .gm-cat-btn:hover  { transform: scale(1.07); border-color: rgba(255,255,255,0.5); }
      .gm-cat-btn:active { transform: scale(0.95); }
      .gm-cat-btn.active { border-color: var(--gm-green); box-shadow: 0 0 18px rgba(61,220,104,0.4); }
      .gm-cat-btn img { width: 72%; height: 72%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,.4)); }

      /* Small + badge on category icon */
      .gm-cat-plus {
        position:    absolute;
        bottom:      3px; right: 3px;
        width:       18px; height: 18px;
        background:  var(--gm-green);
        border-radius: 50%;
        display:     flex; align-items: center; justify-content: center;
        font-size:   14px; font-weight: 900; color: white; line-height:1;
        box-shadow:  0 1px 4px rgba(0,0,0,.3);
      }

      /* Label next to button */
      .gm-cat-label {
        background:    var(--gm-dark);
        backdrop-filter: blur(8px);
        border:        1px solid rgba(255,255,255,0.15);
        border-left:   none;
        border-radius: 0 var(--gm-radius) var(--gm-radius) 0;
        padding:       0 14px;
        height:        var(--icon-size);
        display:       flex;
        align-items:   center;
        font-family:   var(--gm-font-title);
        font-size:     var(--fs-label);
        color:         #fff;
        white-space:   nowrap;
        pointer-events: none;
        transition:    opacity .2s, transform .2s;
      }

      /* Sub-menu that slides out right */
      .gm-sub-menu {
        position:   absolute;
        left:       calc(var(--icon-size) + clamp(100px, 18vw, 145px));
        top:        50%;
        transform:  translateY(-50%) scaleX(0);
        transform-origin: left center;
        display:    flex;
        flex-direction: column;
        gap:        8px;
        transition: transform .22s cubic-bezier(.34,1.56,.64,1);
        pointer-events: none;
        z-index:    50;
      }
      .gm-sub-menu.open {
        transform:    translateY(-50%) scaleX(1);
        pointer-events: all;
      }

      .gm-item-btn {
        display:        flex;
        align-items:    center;
        gap:            10px;
        background:     var(--gm-dark);
        backdrop-filter: blur(8px);
        border:         1px solid rgba(255,255,255,0.18);
        border-radius:  var(--gm-radius);
        padding:        8px 14px 8px 10px;
        cursor:         pointer;
        transition:     transform .15s, border-color .15s;
        min-width:      clamp(140px,24vw,200px);
        white-space:    nowrap;
      }
      .gm-item-btn:hover  { transform: translateX(5px); border-color: var(--gm-green); }
      .gm-item-btn:active { transform: translateX(3px) scale(0.97); }
      .gm-item-btn.selected { border-color: var(--gm-green); background: rgba(61,220,104,0.18); }
      .gm-item-btn.no-coins { opacity: 0.45; cursor: not-allowed; }
      .gm-item-btn img {
        width:  clamp(32px,6vw,44px);
        height: clamp(32px,6vw,44px);
        object-fit: contain;
        filter: drop-shadow(0 1px 3px rgba(0,0,0,.4));
        flex-shrink: 0;
      }
      .gm-item-info { display: flex; flex-direction: column; }
      .gm-item-name { font-family: var(--gm-font-title); font-size: var(--fs-label); color: #fff; }
      .gm-item-cost {
        font-family: var(--gm-font-body); font-size: var(--fs-cost); font-weight: 800;
        color: var(--gm-gold); display: flex; align-items: center; gap: 3px;
      }
      .gm-item-cost-gem {
        width:  18px;
        height: 18px;
        object-fit: contain;
        vertical-align: middle;
        margin-right: 2px;
      }

      /* Back button */
      .gm-back-btn {
        display:     flex;
        align-items: center;
        gap:         10px;
        background:  rgba(80,80,80,0.8);
        border:      1px solid rgba(255,255,255,0.15);
        border-radius: var(--gm-radius);
        padding:     8px 14px 8px 10px;
        cursor:      pointer;
        color:       rgba(255,255,255,0.7);
        font-family: var(--gm-font-title);
        font-size:   var(--fs-label);
        transition:  background .15s;
        white-space: nowrap;
      }
      .gm-back-btn:hover { background: rgba(100,100,100,0.8); }

      /* ── PLACEMENT PROMPT ──────────────────────────────────── */
      #gm-prompt {
        position:       absolute;
        top:            clamp(14px,2.5vh,22px);
        left:           50%;
        transform:      translateX(-50%);
        background:     var(--gm-dark);
        backdrop-filter: blur(10px);
        border:         2px solid var(--gm-green);
        border-radius:  var(--gm-radius);
        padding:        10px 22px;
        display:        none;
        align-items:    center;
        gap:            12px;
        z-index:        40;
        white-space:    nowrap;
        animation:      gm-prompt-in .3s ease;
        pointer-events: all;
      }
      @keyframes gm-prompt-in { from{opacity:0;transform:translateX(-50%) translateY(-8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
      #gm-prompt-text { font-family: var(--gm-font-title); font-size: clamp(14px,2.5vw,18px); color: #fff; }
      #gm-prompt-cancel {
        background: rgba(255,60,60,0.25); border: 1px solid rgba(255,100,100,0.4);
        border-radius: 50%; width: 26px; height: 26px; cursor: pointer; color: #ff8888;
        display: flex; align-items: center; justify-content: center; font-size: 14px;
        transition: background .15s;
      }
      #gm-prompt-cancel:hover { background: rgba(255,60,60,0.5); }

      /* ── TOASTS ────────────────────────────────────────────── */
      #gm-toasts {
        position:   absolute;
        bottom:     clamp(80px,14vh,120px);
        left:       50%;
        transform:  translateX(-50%);
        display:    flex;
        flex-direction: column;
        align-items: center;
        gap:        6px;
        z-index:    50;
        pointer-events: none;
      }
      .gm-toast {
        background:  var(--gm-dark);
        border:      1px solid rgba(255,255,255,0.18);
        border-radius: var(--gm-radius);
        padding:     9px 20px;
        color:       #fff;
        font-family: var(--gm-font-title);
        font-size:   clamp(13px,2.5vw,17px);
        animation:   gm-tin .3s ease, gm-tout .35s ease 1.9s forwards;
        white-space: nowrap;
        backdrop-filter: blur(8px);
      }
      @keyframes gm-tin  { from{opacity:0;transform:scale(.85)} to{opacity:1;transform:scale(1)} }
      @keyframes gm-tout { to{opacity:0;transform:scale(.85)} }


      /* ════════════════════════════════════════════════════════
         RESPONSIVE — portrait phone / small landscape
         ════════════════════════════════════════════════════════ */

      /* ── PORTRAIT (width < height) ─────────────────────────── */
      @media (orientation: portrait) {
        :root {
          --icon-size:  clamp(48px, 12vw, 64px);
          --fs-label:   clamp(12px, 3.5vw, 16px);
          --fs-cost:    clamp(10px, 2.8vw, 14px);
        }

        /* Coin HUD — smaller, keep top-right */
        #gm-coin-gem { width: clamp(22px,7vw,32px); height: clamp(22px,7vw,32px); }
        #gm-coin-val { font-size: clamp(16px,5.5vw,26px); }

        /* Sidebar moves to BOTTOM-LEFT in portrait */
        #gm-sidebar {
          left:      0;
          top:       auto;
          bottom:    0;
          transform: none;
          flex-direction: row;
          padding:   clamp(6px,2vw,12px);
          gap:       clamp(6px,2vw,10px);
          align-items: flex-end;
        }

        .gm-sb-row {
          flex-direction: column-reverse;
          align-items: flex-start;
        }

        /* Labels: above the icon in portrait */
        .gm-cat-label {
          border-left:   1px solid rgba(255,255,255,0.15);
          border-bottom: none;
          border-radius: var(--gm-radius) var(--gm-radius) 0 0;
          padding:       0 10px;
          height:        auto;
          padding-top:   6px;
          padding-bottom: 6px;
        }

        /* Sub-menu opens UPWARD in portrait */
        .gm-sub-menu {
          position:       fixed !important;
          left:           8px !important;
          top:            auto !important;
          bottom:         calc(var(--icon-size) + 20px) !important;
          transform:      translateY(10px) scaleY(0);
          transform-origin: bottom left;
          flex-direction: column;
          max-height:     55vh;
          overflow-y:     auto;
          opacity:        0;
          transition:     transform .22s cubic-bezier(.34,1.56,.64,1), opacity .18s;
        }
        .gm-sub-menu.open {
          transform:    translateY(0) scaleY(1);
          opacity:      1;
        }

        /* Hide text labels in portrait to save horizontal space */
        .gm-cat-label { display: none; }

        /* Sidebar: fixed at bottom-left, horizontal row */
        #gm-sidebar {
          position: fixed !important;
        }

        /* Prompt — stays top-center but smaller text + no white-space nowrap */
        #gm-prompt { white-space: normal; text-align: center; max-width: 80vw; padding: 8px 14px; }

        /* Toasts — higher up so they don't overlap sidebar */
        #gm-toasts { bottom: clamp(100px,20vh,160px); }
      }

      /* ── NARROW LANDSCAPE (height < 500px) ─────────────────── */
      @media (orientation: landscape) and (max-height: 500px) {
        :root {
          --icon-size:  clamp(40px, 8vh, 56px);
          --fs-label:   clamp(11px, 2.2vh, 15px);
          --fs-cost:    clamp(10px, 1.8vh, 13px);
        }
        /* Sub-menu: keep left but allow overflow-y */
        .gm-sub-menu {
          max-height: 80vh;
          overflow-y: auto;
        }
        #gm-coin-val { font-size: clamp(14px,3.5vh,22px); }
        #gm-coin-gem { width: clamp(20px,4.5vh,30px); height: clamp(20px,4.5vh,30px); }
      }

      /* ── VERY SMALL SCREENS (max-width 360px) ────────────────── */
      @media (max-width: 360px) {
        :root {
          --icon-size: 44px;
          --fs-label:  12px;
          --fs-cost:   10px;
        }
        .gm-item-btn { min-width: 130px; padding: 6px 10px; }
      }
      /* ── Skip Day button ───────────────────────────────────── */
      #gm-skip-day {
        position:       absolute;
        top:            calc(clamp(10px,2vh,18px) + clamp(52px,10vh,72px) + 8px);
        right:          clamp(10px,2vw,20px);
        z-index:        40;
        width:          clamp(42px,8vw,56px);
        height:         clamp(42px,8vw,56px);
        border-radius:  var(--gm-radius);
        border:         2px solid rgba(255,200,50,0.5);
        background:     rgba(0,0,0,0.72);
        backdrop-filter: blur(8px);
        padding:        6px;
        display:        none;
        align-items:    center;
        justify-content: center;
        cursor:         pointer;
        box-shadow:     0 0 18px rgba(255,200,50,0.3);
        animation:      gm-skip-pulse 1.8s ease-in-out infinite;
        transition:     transform .15s, box-shadow .15s;
      }
      #gm-skip-day:hover  { transform: scale(1.1); box-shadow: 0 0 28px rgba(255,200,50,0.6); }
      #gm-skip-day:active { transform: scale(0.95); }
      #gm-skip-day img    { width: 100%; height: 100%; object-fit: contain; }
      @keyframes gm-skip-pulse {
        0%,100% { border-color: rgba(255,200,50,0.4); box-shadow: 0 0 14px rgba(255,200,50,0.25); }
        50%     { border-color: rgba(255,200,50,0.9); box-shadow: 0 0 28px rgba(255,200,50,0.55); }
      }

      /* ── Pixi canvas ────────────────────────────────────────── */
      #gm-pixi { position:absolute;inset:0;z-index:45;pointer-events:none; }
    `;
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════
  //  BUILD DOM
  // ════════════════════════════════════════════════════════════════
  private _buildCoinHUD(): void {
    const hud = document.createElement('div');
    hud.id = 'gm-coin-hud';
    hud.innerHTML = `<img id="gm-coin-gem" src="${GameConfig.ASSETS.IMAGES.money}" alt="coins"><div id="gm-coin-val">${this._coins}</div>`;
    this._coinEl = hud.querySelector('#gm-coin-val')!;
    this._root.appendChild(hud);

    // ── Watermark logo top-left ─────────────────────────────────────
    const wm = document.createElement('img');
    wm.id  = 'gm-watermark';
    wm.src = '/assets/icon.png';
    wm.alt = '';
    this._root.appendChild(wm);

    // ── Skip Day button (shown when no more moves) ────────────────
    this._skipDayBtn = document.createElement('button');
    this._skipDayBtn.id = 'gm-skip-day';
    const skipImg = document.createElement('img');
    skipImg.src = '/assets/images/skip_day.png';
    skipImg.alt = 'Skip Day';
    this._skipDayBtn.appendChild(skipImg);
    this._root.appendChild(this._skipDayBtn);
  }

  private _buildSidebar(): void {
    this._sidebar = document.createElement('div');
    this._sidebar.id = 'gm-sidebar';

    // Crop row
    this._sidebar.appendChild(this._makeCatRow('crops', 'corn', 'Crop'));
    // Animals row
    this._sidebar.appendChild(this._makeCatRow('animals', 'cow', 'Cattle'));

    // Disabled until tutorial completes (enabled by TutorialState._finish)
    this._sidebar.style.opacity       = '0';
    this._sidebar.style.pointerEvents = 'none';

    this._root.appendChild(this._sidebar);
  }

  private _makeCatRow(cat: ItemCategory, imgKey: ImgKey, label: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'gm-sb-row';

    // Icon button
    const btn = document.createElement('div');
    btn.className = 'gm-cat-btn';
    btn.dataset.cat = cat;
    btn.innerHTML = `
      <img src="${GameConfig.ASSETS.IMAGES[imgKey]}" alt="${label}">
      <div class="gm-cat-plus">+</div>
    `;

    // Label
    const lbl = document.createElement('div');
    lbl.className = 'gm-cat-label';
    lbl.textContent = label;

    // Sub-menu (hidden)
    const sub = document.createElement('div');
    sub.className = 'gm-sub-menu';
    sub.dataset.subcat = cat;

    // Items in sub-menu
    ItemCatalog[cat].forEach(item => {
      const imgSrc = GameConfig.ASSETS.IMAGES[item.imageKey as ImgKey] ?? '';
      const itemBtn = document.createElement('div');
      itemBtn.className = 'gm-item-btn';
      itemBtn.dataset.itemId = item.id;
      itemBtn.innerHTML = `
        <img src="${imgSrc}" alt="${item.name}">
        <div class="gm-item-info">
          <div class="gm-item-name">${item.name}</div>
          <div class="gm-item-cost"><img class="gm-item-cost-gem" src="${GameConfig.ASSETS.IMAGES.money}" alt="$">${item.cost}</div>
        </div>
      `;
      itemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectItem(item, itemBtn);
      });
      sub.appendChild(itemBtn);
    });

    // Back button at bottom of sub-menu
    const back = document.createElement('div');
    back.className = 'gm-back-btn';
    back.innerHTML = '← Back';
    back.addEventListener('click', (e) => { e.stopPropagation(); this._closeMenu(); });
    sub.appendChild(back);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu(cat, btn, sub);
    });

    row.appendChild(btn);
    row.appendChild(lbl);
    row.appendChild(sub);
    return row;
  }

  private _toggleMenu(cat: ItemCategory, btn: HTMLElement, sub: HTMLElement): void {
    const isOpen = sub.classList.contains('open');
    this._closeMenu();
    if (!isOpen) {
      sub.classList.add('open');
      btn.classList.add('active');
      this._openCat = cat;
      this._menuOpen = true;
      // Refresh cost highlights
      this._refreshSubMenu(sub);
    }
  }

  private _closeMenu(): void {
    document.querySelectorAll('.gm-sub-menu').forEach(el => el.classList.remove('open'));
    document.querySelectorAll('.gm-cat-btn').forEach(el => el.classList.remove('active'));
    this._menuOpen  = false;
    this._openCat   = null;
  }

  private _refreshSubMenu(sub: HTMLElement): void {
    sub.querySelectorAll<HTMLElement>('.gm-item-btn').forEach(btn => {
      const id   = btn.dataset.itemId!;
      const item = Object.values(ItemCatalog).flat().find(i => i.id === id);
      if (!item) return;
      btn.classList.toggle('no-coins', this._coins < item.cost);
      btn.classList.toggle('selected', this._selItem?.id === id);
    });
  }

  private _selectItem(item: ItemData, btn: HTMLElement): void {
    if (this._coins < item.cost) {
      this.showToast(`❌ Need ${item.cost} coins!`);
      this._shake(document.getElementById('gm-coin-val')!);
      return;
    }
    this._selItem = item;
    document.querySelectorAll('.gm-item-btn').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');

    // Update the category button image to reflect the selected item
    const cat = item.zone === 'fence' ? 'animals' : 'crops';
    const catBtn = document.querySelector<HTMLElement>(`.gm-cat-btn[data-cat="${cat}"] img`);
    if (catBtn) (catBtn as HTMLImageElement).src = (GameConfig.ASSETS.IMAGES as any)[item.imageKey] ?? (catBtn as HTMLImageElement).src;

    this._closeMenu();

    // Show placement prompt
    const text = document.getElementById('gm-prompt-text')!;
    text.innerHTML = `${this._itemEmoji(item.id)} Place <strong>${item.name}</strong> ${item.zone === 'fence' ? 'in the pen' : 'in the field'}`;
    (this._prompt.style as any).display = 'flex';
    this.emit('itemSelected', item);
  }

  // ════════════════════════════════════════════════════════════════
  //  PROMPT / CANCEL
  // ════════════════════════════════════════════════════════════════
  private _buildPrompt(): void {
    this._prompt = document.createElement('div');
    this._prompt.id = 'gm-prompt';
    this._prompt.innerHTML = `
      <div id="gm-prompt-text"></div>
      <div id="gm-prompt-cancel">✕</div>
    `;
    this._prompt.querySelector('#gm-prompt-cancel')!
      .addEventListener('click', () => this.clearSelection());
    this._root.appendChild(this._prompt);
  }

  clearSelection(): void {
    this._selItem = null;
    (this._prompt.style as any).display = 'none';
    document.querySelectorAll('.gm-item-btn').forEach(el => el.classList.remove('selected'));
    // Revert cat button images to defaults
    const cropBtn = document.querySelector<HTMLImageElement>('.gm-cat-btn[data-cat="crops"] img');
    const animBtn = document.querySelector<HTMLImageElement>('.gm-cat-btn[data-cat="animals"] img');
    if (cropBtn) cropBtn.src = GameConfig.ASSETS.IMAGES.corn;
    if (animBtn) animBtn.src = GameConfig.ASSETS.IMAGES.cow;
    this.emit('itemSelected', null);
  }

  // ════════════════════════════════════════════════════════════════
  //  TOASTS
  // ════════════════════════════════════════════════════════════════
  private _buildToasts(): void {
    this._toastWrap = document.createElement('div');
    this._toastWrap.id = 'gm-toasts';
    this._root.appendChild(this._toastWrap);
  }

  showToast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'gm-toast';
    t.textContent = msg;
    this._toastWrap.appendChild(t);
    setTimeout(() => t.remove(), 2300);
  }

  // ════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════
  onItemPlaced(name: string, cost: number, sx?: number, sy?: number): void {
    this._coins = Math.max(0, this._coins - cost);
    this._coinEl.textContent = `${this._coins}`;
    this._bounce(this._coinEl.parentElement!);
    (this._prompt.style as any).display = 'none';
    this._selItem = null;
    this.showToast(`✨ ${name} placed!`);
    if (sx !== undefined && sy !== undefined) this._spawnSparkles(sx, sy);
  }

  updateMuteIcon(_muted: boolean): void {}   // optional
  updateDNIcon(_isDay: boolean):   void {}

  get selectedItem(): ItemData | null { return this._selItem; }
  get coins():        number          { return this._coins; }

  // ════════════════════════════════════════════════════════════════
  //  PIXI (sparkles)
  // ════════════════════════════════════════════════════════════════
  private _smokeTexture: PIXI.Texture | null = null;

  private _initPixi(): void {
    this._pixi = new PIXI.Application({ width: innerWidth, height: innerHeight,
      backgroundAlpha: 0, autoDensity: true, resolution: Math.min(devicePixelRatio,2) as any });
    const cv = this._pixi.view as HTMLCanvasElement;
    cv.id = 'gm-pixi';
    this._root.appendChild(cv);
    // Preload smoke texture
    this._smokeTexture = PIXI.Texture.from('/assets/images/smoke.png');
  }

  private _spawnSparkles(sx: number, sy: number): void {
    const tex = this._smokeTexture ?? PIXI.Texture.from('/assets/images/smoke.png');
    type Puff = { s: PIXI.Sprite; vx: number; vy: number; vr: number; life: number; maxLife: number };
    const puffs: Puff[] = [];

    // 6 smoke puffs burst outward then rise
    for (let i = 0; i < 6; i++) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      const size = 40 + Math.random() * 40;
      s.width  = size;
      s.height = size;
      s.position.set(sx + (Math.random()-0.5)*20, sy + (Math.random()-0.5)*10);
      s.alpha   = 0;
      s.tint    = 0xffffff;
      s.blendMode = PIXI.BLEND_MODES.NORMAL;
      this._pixi.stage.addChild(s);

      const angle  = -Math.PI/2 + (Math.random()-0.5)*Math.PI; // mostly upward
      const speed  = 30 + Math.random() * 50;
      const life   = 0.55 + Math.random() * 0.35;
      puffs.push({
        s, life, maxLife: life,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vr: (Math.random()-0.5) * 1.5,
      });
    }

    const fn = (d: number) => {
      const dt = d / 60;
      let done = true;
      puffs.forEach(p => {
        if (p.life <= 0) { p.s.alpha = 0; return; }
        done = false;
        p.life -= dt;
        const t = p.life / p.maxLife;          // 1→0 as it dies
        // fade in quickly then fade out
        p.s.alpha = t < 0.8 ? t / 0.8 * 0.8 : (1 - t) / 0.2 * 0.8;
        p.s.x += p.vx * dt;
        p.s.y += p.vy * dt;
        p.vy  -= 15 * dt;                      // slight upward drift
        p.s.rotation += p.vr * dt;
        const sc = 1 + (1 - t) * 1.2;         // grows as it fades
        p.s.scale.set(sc);
      });
      if (done) {
        puffs.forEach(p => this._pixi.stage.removeChild(p.s));
        this._pixi.ticker.remove(fn);
      }
    };
    this._pixi.ticker.add(fn);
  }

  // ════════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════════
  private _itemEmoji(id: string): string {
    const m: Record<string,string> = {
      chicken:'🐔', cow:'🐄', sheep:'🐑',
      corn:'🌽', grape:'🍇', strawberry:'🍓', tomato:'🍅',
    };
    return m[id]??'🌱';
  }

  private _bounce(el: HTMLElement): void {
    el.animate([{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],
      {duration:350,easing:'ease-out'});
  }

  private _shake(el: HTMLElement): void {
    el.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},
      {transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:300});
  }
  // (class continues below)

  // ════════════════════════════════════════════════════════════════
  //  UPGRADE POPUP — shown when limits reached
  // ════════════════════════════════════════════════════════════════
  private _buildUpgradeModal(): void {
    this._upgradeModal = document.createElement('div');
    Object.assign(this._upgradeModal.style, {
      position:       'absolute', inset: '0',
      background:     'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(6px)',
      display:        'none',
      alignItems:     'center',
      justifyContent: 'center',
      zIndex:         '60',
      cursor:         'pointer',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background:     'rgba(10,24,10,0.96)',
      border:         '2px solid rgba(61,220,104,0.6)',
      borderRadius:   '20px',
      padding:        'clamp(28px,5vw,48px) clamp(28px,6vw,60px)',
      textAlign:      'center',
      maxWidth:       'min(480px,88vw)',
      boxShadow:      '0 12px 60px rgba(0,0,0,0.7), 0 0 40px rgba(61,220,104,0.15)',
      animation:      'gm-upgrade-in .35s cubic-bezier(.34,1.56,.64,1)',
    });

    // Inject keyframe once
    if (!document.getElementById('gm-upgrade-style')) {
      const s = document.createElement('style');
      s.id = 'gm-upgrade-style';
      s.textContent = `
        @keyframes gm-upgrade-in {
          from { opacity:0; transform: scale(0.8) translateY(20px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }
      `;
      document.head.appendChild(s);
    }

    const emoji = document.createElement('div');
    emoji.textContent = '🌟';
    emoji.style.cssText = 'font-size:clamp(40px,8vw,64px);margin-bottom:10px;';

    const title = document.createElement('div');
    title.textContent = "You're on a roll!";
    Object.assign(title.style, {
      fontFamily: "'Fredoka One', cursive",
      fontSize:   'clamp(22px,4vw,32px)',
      color:      '#fff',
      marginBottom: '10px',
    });

    const sub = document.createElement('div');
    sub.id = 'gm-upgrade-sub';
    Object.assign(sub.style, {
      fontFamily: "'Nunito', sans-serif",
      fontSize:   'clamp(14px,2.2vw,18px)',
      color:      'rgba(255,255,255,0.75)',
      marginBottom: '28px',
      lineHeight: '1.5',
    });

    const ctaBtn = document.createElement('div');
    ctaBtn.textContent = '🛒 Get Full Version';
    Object.assign(ctaBtn.style, {
      background:    'linear-gradient(135deg, #3ddc68, #1a8c3a)',
      borderRadius:  '50px',
      padding:       '14px 36px',
      fontFamily:    "'Fredoka One', cursive",
      fontSize:      'clamp(16px,2.8vw,22px)',
      color:         '#fff',
      cursor:        'pointer',
      display:       'inline-block',
      marginBottom:  '14px',
      boxShadow:     '0 4px 20px rgba(61,220,104,0.4)',
      transition:    'transform .15s',
    });
    ctaBtn.onmouseenter = () => { ctaBtn.style.transform = 'scale(1.05)'; };
    ctaBtn.onmouseleave = () => { ctaBtn.style.transform = 'scale(1)'; };

    const dismissBtn = document.createElement('div');
    dismissBtn.textContent = 'Maybe later';
    Object.assign(dismissBtn.style, {
      color:      'rgba(255,255,255,0.4)',
      fontSize:   'clamp(12px,1.8vw,14px)',
      fontFamily: "'Nunito', sans-serif",
      cursor:     'pointer',
      transition: 'color .15s',
    });
    dismissBtn.onmouseenter = () => { dismissBtn.style.color = 'rgba(255,255,255,0.8)'; };
    dismissBtn.onmouseleave = () => { dismissBtn.style.color = 'rgba(255,255,255,0.4)'; };
    dismissBtn.onclick = (e) => { e.stopPropagation(); this._hideUpgradeModal(); };

    box.append(emoji, title, sub, ctaBtn, dismissBtn);
    this._upgradeModal.appendChild(box);
    this._upgradeModal.addEventListener('click', (e) => {
      if (e.target === this._upgradeModal) this._hideUpgradeModal();
    });
    this._root.appendChild(this._upgradeModal);
  }

  showUpgradeModal(type: 'animals' | 'plants'): void {
    const sub = document.getElementById('gm-upgrade-sub')!;
    if (type === 'animals') {
      sub.innerHTML = `You've placed all <strong>${GameConfig.MAX_ANIMALS} free animals</strong>.<br>Unlock unlimited animals in the full game!`;
    } else {
      sub.innerHTML = `You've placed all <strong>${GameConfig.MAX_PLANTS} free crops</strong>.<br>Unlock unlimited crops in the full game!`;
    }
    (this._upgradeModal.style as any).display = 'flex';
    (this._upgradeModal.querySelector('div')! as any).style.animation = 'none';
    requestAnimationFrame(() => {
      (this._upgradeModal.querySelector('div')! as any).style.animation = 'gm-upgrade-in .35s cubic-bezier(.34,1.56,.64,1)';
    });
  }

  private _hideUpgradeModal(): void {
    (this._upgradeModal.style as any).display = 'none';
  }

  // Called by PlayState after successful placement
  /** Show the Skip Day button and register click callback */
  private _skipDayHandler: ((e: Event) => void) | null = null;

  showSkipDay(onClick: () => void): void {
    // Remove previous listener if any
    if (this._skipDayHandler) {
      this._skipDayBtn.removeEventListener('click', this._skipDayHandler);
    }
    this._skipDayHandler = (e: Event) => { e.stopPropagation(); onClick(); };
    this._skipDayBtn.addEventListener('click', this._skipDayHandler);
    this._skipDayBtn.style.display = 'flex';
  }

  hideSkipDay(): void {
    this._skipDayBtn.style.display = 'none';
  }

  incrementCount(zone: 'field' | 'fence'): void {
    if (zone === 'fence') this._animalCount++;
    else                  this._plantCount++;
  }

  get animalCount(): number { return this._animalCount; }
  get plantCount():  number { return this._plantCount;  }

}
