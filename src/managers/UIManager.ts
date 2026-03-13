import * as PIXI from 'pixi.js';
import { EventEmitter } from '../utils/EventEmitter';
import { ItemCatalog, ItemData, ItemCategory } from '../garden/ItemCatalog';
import { GameConfig } from '../core/GameConfig';

type ImgKey = keyof typeof GameConfig.ASSETS.IMAGES;

const FONT_TITLE = 'Fredoka One, cursive';
const FONT_BODY  = 'Nunito, sans-serif';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/**
 * UIManager — 100 % PixiJS, zero DOM elements.
 *
 * Events emitted:
 *   'itemSelected'  (item: ItemData | null)
 *   'dayNight'
 *   'mute'
 *   'tutDone'
 */
export class UIManager extends EventEmitter {

  // ── Pixi ───────────────────────────────────────────────────────
  private _pixi!:         PIXI.Application;
  private _uiLayer!:      PIXI.Container;   // HUD + sidebar
  private _fxLayer!:      PIXI.Container;   // sparkles
  public  _overlayLayer!: PIXI.Container;   // loading / tutorial / modals
  private _textures:      Map<string, PIXI.Texture> = new Map();
  private _smokeTexture:  PIXI.Texture | null = null;

  // ── Coin HUD ────────────────────────────────────────────────
  private _coinHUD!:   PIXI.Container;
  private _coinText!:  PIXI.Text;
  private _coinHUDBg!: PIXI.Graphics;

  // ── Watermark ───────────────────────────────────────────────
  private _watermark!: PIXI.Sprite;

  // ── Skip Day ─────────────────────────────────────────────────
  private _skipDayBtn!:    PIXI.Container;
  private _skipDayBg!:     PIXI.Graphics;
  private _skipDayHandler: (() => void) | null = null;
  private _skipDayT = 0;

  // ── Sidebar ───────────────────────────────────────────────────
  private _sidebar!:        PIXI.Container;
  private _catRows!:        PIXI.Container[];
  private _catBtnConts:     Record<ItemCategory, PIXI.Container> = {} as any;
  private _catBtnBgs:       Record<ItemCategory, PIXI.Graphics>  = {} as any;
  private _catIconSprites:  Record<ItemCategory, PIXI.Sprite>    = {} as any;
  private _catSubMenus:     Record<ItemCategory, PIXI.Container> = {} as any;
  private _catDefaultImg:   Record<ItemCategory, string> = {
    crops:   GameConfig.ASSETS.IMAGES.corn,
    animals: GameConfig.ASSETS.IMAGES.cow,
  };
  private _itemBtnBgs:   Map<string, PIXI.Graphics>  = new Map();
  private _openCat:      ItemCategory | null = null;

  // ── Placement prompt ─────────────────────────────────────────
  private _prompt!:     PIXI.Container;
  private _promptText!: PIXI.Text;

  // ── Toasts ────────────────────────────────────────────────────
  private _toastLayer!: PIXI.Container;

  // ── Upgrade modal ─────────────────────────────────────────────
  private _upgradeModal!:    PIXI.Container;
  private _upgradeSubText!:  PIXI.Text;

  // ── State ──────────────────────────────────────────────────────
  private _coins: number = GameConfig.START_COINS;
  private _selItem:       ItemData | null = null;
  private _animalCount  = 0;
  private _plantCount   = 0;

  // ── Public API ──────────────────────────────────────────────────
  get canvas():       HTMLCanvasElement { return this._pixi.view as HTMLCanvasElement; }
  get app():          PIXI.Application  { return this._pixi; }
  get overlayLayer(): PIXI.Container    { return this._overlayLayer; }
  get selectedItem(): ItemData | null   { return this._selItem; }
  get coins():        number            { return this._coins; }
  get animalCount():  number            { return this._animalCount; }
  get plantCount():   number            { return this._plantCount; }

  // ════════════════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════════════════
  async init(container: HTMLElement): Promise<void> {
    this._loadFonts();

    this._pixi = new PIXI.Application({
      width:           innerWidth,
      height:          innerHeight,
      backgroundAlpha: 0,
      autoDensity:     true,
      resolution:      Math.min(devicePixelRatio, 2),
    });

    const cv = this._pixi.view as HTMLCanvasElement;
    cv.style.cssText = 'position:absolute;inset:0;z-index:45;pointer-events:auto;';
    container.appendChild(cv);

    this._uiLayer      = new PIXI.Container();
    this._fxLayer      = new PIXI.Container();
    this._overlayLayer = new PIXI.Container();
    this._pixi.stage.addChild(this._uiLayer);
    this._pixi.stage.addChild(this._fxLayer);
    this._pixi.stage.addChild(this._overlayLayer);

    await this._loadTextures();
    this._smokeTexture = this._textures.get('smoke') ?? null;

    this._buildCoinHUD();
    this._buildWatermark();
    this._buildSkipDay();
    this._buildSidebar();
    this._buildPrompt();
    this._buildToastLayer();
    this._buildUpgradeModal();

    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }

  private _loadFonts(): void {
    if (document.getElementById('gm-fonts')) return;
    const link = document.createElement('link');
    link.id   = 'gm-fonts';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;700;800;900&display=swap';
    document.head.appendChild(link);
  }

  private async _loadTextures(): Promise<void> {
    const sources: Record<string, string> = {
      ...(GameConfig.ASSETS.IMAGES as Record<string, string>),
      smoke:   '/assets/images/smoke.png',
      skipDay: '/assets/images/skip_day.png',
      icon:    '/assets/icon.png',
    };
    await Promise.all(Object.entries(sources).map(([k, url]) =>
      new Promise<void>(resolve => {
        const tex = PIXI.Texture.from(url);
        this._textures.set(k, tex);
        if (tex.baseTexture.valid) { resolve(); return; }
        tex.baseTexture.once('loaded', () => resolve());
        tex.baseTexture.once('error',  () => resolve());
      })
    ));
  }

  // ════════════════════════════════════════════════════════════════
  //  COIN HUD  (top-right)
  // ════════════════════════════════════════════════════════════════
  private _buildCoinHUD(): void {
    this._coinHUD   = new PIXI.Container();
    this._coinHUDBg = new PIXI.Graphics();
    this._coinHUD.addChild(this._coinHUDBg);

    const gem = new PIXI.Sprite(this._textures.get('money') ?? PIXI.Texture.WHITE);
    gem.anchor.set(0, 0.5);
    gem.name = 'gem';
    this._coinHUD.addChild(gem);

    this._coinText = new PIXI.Text(`${this._coins}`, {
      fontFamily: FONT_TITLE, fontSize: 28, fill: 0xffffff,
      dropShadow: true, dropShadowDistance: 2, dropShadowAlpha: 0.5,
    });
    this._coinText.anchor.set(0, 0.5);
    this._coinHUD.addChild(this._coinText);

    this._uiLayer.addChild(this._coinHUD);
    this._layoutCoinHUD();
  }

  private _layoutCoinHUD(): void {
    const portrait  = innerWidth < innerHeight;
    const gemSz     = portrait ? 26 : 32;
    const fontSize  = portrait ? 22 : 28;
    const padV = 8, padH = 16, gap = 8;

    const gem = this._coinHUD.getChildByName('gem') as PIXI.Sprite;
    gem.width  = gemSz;
    gem.height = gemSz;
    gem.x = padH / 2;
    gem.y = 0;

    this._coinText.style.fontSize = fontSize;
    this._coinText.x = gem.x + gemSz + gap;
    this._coinText.y = 0;

    const totalW = gem.x + gemSz + gap + this._coinText.width + padH / 2 + padH;
    const totalH = gemSz + padV * 2;

    this._coinHUDBg.clear();
    this._coinHUDBg.lineStyle(1, 0xffffff, 0.15);
    this._coinHUDBg.beginFill(0x000000, 0.78);
    this._coinHUDBg.drawRoundedRect(0, -totalH / 2, totalW, totalH, 14);
    this._coinHUDBg.endFill();

    const margin = Math.max(10, innerWidth * 0.02);
    const topMargin = Math.max(10, innerHeight * 0.02);
    this._coinHUD.x = innerWidth  - totalW - margin;
    this._coinHUD.y = topMargin + totalH / 2;
  }

  private _updateCoinText(): void {
    this._coinText.text = `${this._coins}`;
    this._layoutCoinHUD();
  }

  // ════════════════════════════════════════════════════════════════
  //  WATERMARK  (top-left)
  // ════════════════════════════════════════════════════════════════
  private _buildWatermark(): void {
    this._watermark = new PIXI.Sprite(this._textures.get('icon') ?? PIXI.Texture.WHITE);
    this._watermark.anchor.set(0, 0);
    this._watermark.alpha = 0.55;
    this._uiLayer.addChild(this._watermark);
  }

  private _layoutWatermark(): void {
    const sz = Math.max(36, Math.min(innerWidth * 0.06, 60));
    const margin = Math.max(8, innerWidth * 0.015);
    this._watermark.width  = sz;
    this._watermark.height = sz;
    this._watermark.x = margin;
    this._watermark.y = Math.max(8, innerHeight * 0.015);
  }

  // ════════════════════════════════════════════════════════════════
  //  SKIP DAY  (top-right, below coin)
  // ════════════════════════════════════════════════════════════════
  private _buildSkipDay(): void {
    this._skipDayBtn = new PIXI.Container();
    this._skipDayBtn.visible = false;

    this._skipDayBg = new PIXI.Graphics();
    this._skipDayBtn.addChild(this._skipDayBg);

    const img = new PIXI.Sprite(this._textures.get('skipDay') ?? PIXI.Texture.WHITE);
    img.anchor.set(0.5);
    img.name = 'img';
    this._skipDayBtn.addChild(img);

    this._skipDayBtn.eventMode = 'static';
    this._skipDayBtn.cursor    = 'pointer';

    this._skipDayBtn.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this._skipDayBtn.scale.set(0.93);
    });
    this._skipDayBtn.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this._skipDayBtn.scale.set(1);
      if (this._skipDayHandler) this._skipDayHandler();
    });
    this._skipDayBtn.on('pointerover', () => this._skipDayBtn.scale.set(1.1));
    this._skipDayBtn.on('pointerout',  () => this._skipDayBtn.scale.set(1));

    // Pulse animation
    this._pixi.ticker.add((dt: number) => {
      if (!this._skipDayBtn.visible) return;
      this._skipDayT += dt / 60;
      const a = 0.4 + 0.5 * (Math.sin(this._skipDayT * Math.PI / 0.9) * 0.5 + 0.5);
      const sz = this._skipDayBtn.getChildByName('img') ? (this._skipDayBtn.width) : 52;
      this._skipDayBg.clear();
      this._skipDayBg.lineStyle(2, 0xffc832, a);
      this._skipDayBg.beginFill(0x000000, 0.72);
      this._skipDayBg.drawRoundedRect(0, 0, sz, sz, 14);
      this._skipDayBg.endFill();
    });

    this._uiLayer.addChild(this._skipDayBtn);
  }

  private _layoutSkipDay(): void {
    const sz = Math.max(42, Math.min(innerWidth * 0.08, 56));
    const margin = Math.max(10, innerWidth * 0.02);

    this._skipDayBg.clear();
    this._skipDayBg.lineStyle(2, 0xffc832, 0.5);
    this._skipDayBg.beginFill(0x000000, 0.72);
    this._skipDayBg.drawRoundedRect(0, 0, sz, sz, 14);
    this._skipDayBg.endFill();

    const img = this._skipDayBtn.getChildByName('img') as PIXI.Sprite;
    if (img) { img.width = sz - 14; img.height = sz - 14; img.x = sz / 2; img.y = sz / 2; }

    // Position: top-right below coin HUD
    const coinBottom = this._coinHUD.y + this._coinHUDBg.height / 2 + 8;
    this._skipDayBtn.x = innerWidth - sz - margin;
    this._skipDayBtn.y = coinBottom;
  }

  // ════════════════════════════════════════════════════════════════
  //  SIDEBAR
  // ════════════════════════════════════════════════════════════════
  private _buildSidebar(): void {
    this._sidebar  = new PIXI.Container();
    this._sidebar.alpha = 0;  // hidden until tutorial done
    this._catRows  = [];

    const defs: Array<{ cat: ItemCategory; imgKey: ImgKey; label: string }> = [
      { cat: 'crops',   imgKey: 'corn', label: 'Crop'   },
      { cat: 'animals', imgKey: 'cow',  label: 'Cattle' },
    ];

    defs.forEach(({ cat, imgKey, label }) => {
      const row = this._makeCatRow(cat, imgKey, label);
      this._catRows.push(row);
      this._sidebar.addChild(row);
    });

    this._uiLayer.addChild(this._sidebar);
  }

  private _makeCatRow(cat: ItemCategory, imgKey: ImgKey, label: string): PIXI.Container {
    const row = new PIXI.Container();
    const SZ  = 64;
    const RAD = 14;

    // ── Category button ────────────────────────────────────────
    const btnCont = new PIXI.Container();
    const btnBg   = new PIXI.Graphics();
    this._drawCatBg(btnBg, SZ, false);
    btnCont.addChild(btnBg);

    const catImg = new PIXI.Sprite(this._textures.get(imgKey) ?? PIXI.Texture.WHITE);
    catImg.anchor.set(0.5);
    catImg.width  = SZ * 0.72;
    catImg.height = SZ * 0.72;
    catImg.x = SZ / 2;
    catImg.y = SZ / 2;
    btnCont.addChild(catImg);
    this._catIconSprites[cat] = catImg;

    // + badge
    const badge = new PIXI.Graphics();
    badge.beginFill(0x3ddc68); badge.drawCircle(0, 0, 9); badge.endFill();
    badge.x = SZ - 5; badge.y = SZ - 5;
    btnCont.addChild(badge);
    const badgeTxt = new PIXI.Text('+', {
      fontFamily: FONT_BODY, fontSize: 14, fontWeight: '900', fill: 0xffffff,
    });
    badgeTxt.anchor.set(0.5);
    badgeTxt.x = SZ - 5; badgeTxt.y = SZ - 5;
    btnCont.addChild(badgeTxt);

    btnCont.eventMode = 'static';
    btnCont.cursor    = 'pointer';
    btnCont.hitArea   = new PIXI.Rectangle(0, 0, SZ, SZ);

    const stopNative = (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();

    btnCont.on('pointerdown', (e) => { stopNative(e); btnCont.scale.set(0.95); });
    btnCont.on('pointerup',   (e) => { stopNative(e); btnCont.scale.set(1); });
    btnCont.on('pointerover', () => { if (this._openCat !== cat) btnCont.scale.set(1.07); });
    btnCont.on('pointerout',  () => { if (this._openCat !== cat) btnCont.scale.set(1); });
    btnCont.on('pointertap',  (e) => {
      stopNative(e);
      this._toggleMenu(cat);
    });

    this._catBtnConts[cat] = btnCont;
    this._catBtnBgs[cat]   = btnBg;
    row.addChild(btnCont);

    // ── Label ──────────────────────────────────────────────────
    const lblW = 80;
    const lblBg = new PIXI.Graphics();
    lblBg.lineStyle(1, 0xffffff, 0.15);
    lblBg.beginFill(0x000000, 0.78);
    lblBg.drawRoundedRect(0, 0, lblW + RAD, SZ, RAD);
    lblBg.endFill();
    // Cover left-side radius
    const lblBg2 = new PIXI.Graphics();
    lblBg2.beginFill(0x000000, 0.78);
    lblBg2.drawRect(0, 0, RAD, SZ);
    lblBg2.endFill();
    const lblCont = new PIXI.Container();
    lblCont.addChild(lblBg, lblBg2);
    const lblTxt = new PIXI.Text(label, {
      fontFamily: FONT_TITLE, fontSize: 16, fill: 0xffffff,
    });
    lblTxt.anchor.set(0, 0.5);
    lblTxt.x = RAD + 4; lblTxt.y = SZ / 2;
    lblCont.addChild(lblTxt);
    lblCont.x = SZ;
    lblCont.name = 'label';
    row.addChild(lblCont);

    // ── Sub-menu ───────────────────────────────────────────────
    const sub = this._makeSubMenu(cat, SZ);
    sub.visible = false;
    this._catSubMenus[cat] = sub;
    row.addChild(sub);

    return row;
  }

  private _makeSubMenu(cat: ItemCategory, btnSz: number): PIXI.Container {
    const sub    = new PIXI.Container();
    const items  = ItemCatalog[cat];
    const itemH  = 56;
    const itemW  = 210;
    const gap    = 8;
    let yOff = 0;

    items.forEach(item => {
      const btn = this._makeItemBtn(item, itemW, itemH);
      btn.y = yOff;
      sub.addChild(btn);
      yOff += itemH + gap;
    });

    // Back button
    const backH  = 44;
    const backBg = new PIXI.Graphics();
    backBg.lineStyle(1, 0xffffff, 0.15);
    backBg.beginFill(0x505050, 0.8);
    backBg.drawRoundedRect(0, 0, itemW, backH, 14);
    backBg.endFill();
    const backTxt = new PIXI.Text('← Back', {
      fontFamily: FONT_TITLE, fontSize: 16, fill: 0xffffffb4,
    });
    backTxt.anchor.set(0, 0.5);
    backTxt.x = 14; backTxt.y = backH / 2;

    const backCont = new PIXI.Container();
    backCont.addChild(backBg, backTxt);
    backCont.y = yOff;
    backCont.eventMode = 'static';
    backCont.cursor    = 'pointer';
    backCont.hitArea   = new PIXI.Rectangle(0, 0, itemW, backH);
    backCont.on('pointerdown', (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation());
    backCont.on('pointertap',  (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this._closeMenu();
    });
    backCont.on('pointerover', () => { backBg.tint = 0xcccccc; });
    backCont.on('pointerout',  () => { backBg.tint = 0xffffff; });
    sub.addChild(backCont);

    return sub;
  }

  private _makeItemBtn(item: ItemData, w: number, h: number): PIXI.Container {
    const cont = new PIXI.Container();
    const bg   = new PIXI.Graphics();
    this._drawItemBtnBg(bg, w, h, false, false);
    cont.addChild(bg);
    this._itemBtnBgs.set(item.id, bg);

    const iconSz  = 40;
    const imgKey  = item.imageKey as ImgKey;
    const iconTex = this._textures.get(imgKey) ?? PIXI.Texture.WHITE;
    const icon    = new PIXI.Sprite(iconTex);
    icon.anchor.set(0.5);
    icon.width  = iconSz;
    icon.height = iconSz;
    icon.x = 10 + iconSz / 2;
    icon.y = h / 2;
    cont.addChild(icon);

    const nameTxt = new PIXI.Text(item.name, {
      fontFamily: FONT_TITLE, fontSize: 16, fill: 0xffffff,
    });
    nameTxt.anchor.set(0, 1);
    nameTxt.x = 10 + iconSz + 10;
    nameTxt.y = h / 2 - 1;
    cont.addChild(nameTxt);

    // Cost row: gem icon + amount
    const gemSz  = 16;
    const gemTex = this._textures.get('money') ?? PIXI.Texture.WHITE;
    const gemSpr = new PIXI.Sprite(gemTex);
    gemSpr.anchor.set(0, 0.5);
    gemSpr.width  = gemSz;
    gemSpr.height = gemSz;
    gemSpr.x = 10 + iconSz + 10;
    gemSpr.y = h / 2 + 10;
    cont.addChild(gemSpr);

    const costTxt = new PIXI.Text(`${item.cost}`, {
      fontFamily: FONT_BODY, fontSize: 13, fontWeight: '800', fill: 0xf5c430,
    });
    costTxt.anchor.set(0, 0.5);
    costTxt.x = gemSpr.x + gemSz + 4;
    costTxt.y = h / 2 + 10;
    cont.addChild(costTxt);

    // Interactivity
    cont.eventMode = 'static';
    cont.cursor    = 'pointer';
    cont.hitArea   = new PIXI.Rectangle(0, 0, w, h);

    const stopNative = (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();

    cont.on('pointerdown', (e) => { stopNative(e); cont.scale.set(0.97); });
    cont.on('pointerup',   (e) => { stopNative(e); cont.scale.set(1); });
    cont.on('pointerover', () => {
      if (this._selItem?.id !== item.id && this._coins >= item.cost) {
        cont.x = 5;
      }
    });
    cont.on('pointerout', () => {
      if (this._selItem?.id !== item.id) cont.x = 0;
    });
    cont.on('pointertap', (e) => {
      stopNative(e);
      this._selectItem(item);
    });

    return cont;
  }

  private _drawCatBg(g: PIXI.Graphics, sz: number, active: boolean): void {
    g.clear();
    const borderColor = active ? 0x3ddc68 : 0xffffff;
    const borderAlpha = active ? 1.0 : 0.2;
    g.lineStyle(2, borderColor, borderAlpha);
    g.beginFill(0x000000, 0.78);
    g.drawRoundedRect(0, 0, sz, sz, 14);
    g.endFill();
  }

  private _drawItemBtnBg(g: PIXI.Graphics, w: number, h: number,
                          selected: boolean, noCoins: boolean): void {
    g.clear();
    const borderColor = selected ? 0x3ddc68 : 0xffffff;
    const borderAlpha = selected ? 1.0 : 0.18;
    const fillColor   = selected ? 0x3ddc68 : 0x000000;
    const fillAlpha   = selected ? 0.18    : 0.78;
    g.lineStyle(1, borderColor, borderAlpha);
    g.beginFill(fillColor, fillAlpha);
    g.drawRoundedRect(0, 0, w, h, 14);
    g.endFill();
    if (noCoins) { g.alpha = 0.45; } else { g.alpha = 1; }
  }

  // ── Menu open / close ──────────────────────────────────────────
  private _toggleMenu(cat: ItemCategory): void {
    if (this._openCat === cat) { this._closeMenu(); return; }
    this._closeMenu();
    this._openCat = cat;

    const sub  = this._catSubMenus[cat];
    const btnB = this._catBtnBgs[cat];
    this._drawCatBg(btnB, 64, true);
    sub.visible = true;
    this._positionSubMenu(cat);
    this._refreshSubMenu(cat);
  }

  private _closeMenu(): void {
    if (!this._openCat) return;
    const cat  = this._openCat;
    this._openCat = null;
    this._catSubMenus[cat].visible = false;
    this._drawCatBg(this._catBtnBgs[cat], 64, false);
    this._catBtnConts[cat].scale.set(1);
  }

  /** Position the open submenu based on current orientation. */
  private _positionSubMenu(cat: ItemCategory): void {
    const portrait = innerWidth < innerHeight;
    const sub  = this._catSubMenus[cat];
    const row  = this._catRows[cat === 'crops' ? 0 : 1];
    const lbl  = row.getChildByName('label') as PIXI.Container | null;

    if (portrait) {
      // Opens upward: position above the sidebar (which is at bottom)
      const totalSubH = sub.height;
      sub.x = 0;
      sub.y = -(totalSubH + 8);
    } else {
      // Landscape: opens to the right
      const lblW = lbl ? (lbl.width + 4) : 88;
      sub.x = 64 + lblW;
      sub.y = -sub.height / 2 + 32;
    }
  }

  private _refreshSubMenu(cat: ItemCategory): void {
    const sub = this._catSubMenus[cat];
    ItemCatalog[cat].forEach(item => {
      const bg = this._itemBtnBgs.get(item.id);
      if (!bg) return;
      const selected = this._selItem?.id === item.id;
      const noCoins  = this._coins < item.cost;
      this._drawItemBtnBg(bg, 210, 56, selected, noCoins);
      const parent = bg.parent as PIXI.Container;
      parent.alpha = noCoins ? 0.5 : 1;
    });
    // Force position refresh
    this._positionSubMenu(cat);
    void sub;
  }

  private _selectItem(item: ItemData): void {
    if (this._coins < item.cost) {
      this.showToast(`❌ Need ${item.cost} coins!`);
      this._shakeCoinHUD();
      return;
    }

    this._selItem = item;

    // Update all item button visuals
    const allCats: ItemCategory[] = ['crops', 'animals'];
    allCats.forEach(c => {
      ItemCatalog[c].forEach(i => {
        const bg = this._itemBtnBgs.get(i.id);
        if (bg) this._drawItemBtnBg(bg, 210, 56, i.id === item.id, this._coins < i.cost);
      });
    });

    // Update cat icon to selected item
    const iconKey = item.imageKey as ImgKey;
    const cat     = item.zone === 'fence' ? 'animals' : 'crops';
    const newTex  = this._textures.get(iconKey) ?? PIXI.Texture.WHITE;
    this._catIconSprites[cat].texture = newTex;

    this._closeMenu();
    this._showPrompt(item);
    this.emit('itemSelected', item);
  }

  // ── Layout ─────────────────────────────────────────────────────
  private _layoutSidebar(): void {
    const portrait = innerWidth < innerHeight;
    const SZ       = portrait ? 52 : 64;
    const gap      = portrait ? 8  : 10;
    const margin   = portrait ? 6  : 8;

    // Resize cat buttons
    (['crops', 'animals'] as ItemCategory[]).forEach(cat => {
      const bg = this._catBtnBgs[cat];
      this._drawCatBg(bg, SZ, this._openCat === cat);
      const icon = this._catIconSprites[cat];
      icon.width  = SZ * 0.72;
      icon.height = SZ * 0.72;
      icon.x = SZ / 2; icon.y = SZ / 2;
      this._catBtnConts[cat].hitArea = new PIXI.Rectangle(0, 0, SZ, SZ);
    });

    if (portrait) {
      // Bottom-left horizontal layout
      this._sidebar.x = margin;
      this._sidebar.y = innerHeight - SZ - margin;

      this._catRows.forEach((row, i) => {
        row.x = i * (SZ + gap);
        row.y = 0;
        const lbl = row.getChildByName('label') as PIXI.Container | null;
        if (lbl) lbl.visible = false;
      });
    } else {
      // Left side, vertically centered
      const totalH = this._catRows.length * SZ + (this._catRows.length - 1) * gap;
      this._sidebar.x = margin;
      this._sidebar.y = (innerHeight - totalH) / 2;

      this._catRows.forEach((row, i) => {
        row.x = 0;
        row.y = i * (SZ + gap);
        const lbl = row.getChildByName('label') as PIXI.Container | null;
        if (lbl) lbl.visible = true;
      });
    }

    // Reposition any open submenu
    if (this._openCat) this._positionSubMenu(this._openCat);
  }

  // ════════════════════════════════════════════════════════════════
  //  PLACEMENT PROMPT  (top-center)
  // ════════════════════════════════════════════════════════════════
  private _buildPrompt(): void {
    this._prompt = new PIXI.Container();
    this._prompt.visible = false;

    // built lazily on first show; store background reference
    this._uiLayer.addChild(this._prompt);
  }

  private _showPrompt(item: ItemData): void {
    this._prompt.removeChildren();

    const emoji = this._itemEmoji(item.id);
    const zone  = item.zone === 'fence' ? 'in the pen' : 'in the field';
    const msg   = `${emoji} Place ${item.name} ${zone}`;

    const padV = 12, padH = 22, gap = 14;

    const text = new PIXI.Text(msg, {
      fontFamily: FONT_TITLE, fontSize: 17, fill: 0xffffff,
    });
    text.anchor.set(0, 0.5);
    this._promptText = text;

    const cancelSz = 26;
    const totalW = padH + text.width + gap + cancelSz + padH;
    const totalH = Math.max(text.height + padV * 2, cancelSz + padV * 2);

    const bg = new PIXI.Graphics();
    bg.lineStyle(2, 0x3ddc68, 1);
    bg.beginFill(0x000000, 0.78);
    bg.drawRoundedRect(0, 0, totalW, totalH, 14);
    bg.endFill();

    text.x = padH;
    text.y = totalH / 2;

    // Cancel button
    const cancelBg = new PIXI.Graphics();
    cancelBg.lineStyle(1, 0xff8888, 0.4);
    cancelBg.beginFill(0xff3c3c, 0.25);
    cancelBg.drawCircle(cancelSz / 2, cancelSz / 2, cancelSz / 2);
    cancelBg.endFill();
    const cancelTxt = new PIXI.Text('✕', {
      fontFamily: FONT_BODY, fontSize: 14, fill: 0xff8888,
    });
    cancelTxt.anchor.set(0.5);
    cancelTxt.x = cancelSz / 2;
    cancelTxt.y = cancelSz / 2;
    const cancelCont = new PIXI.Container();
    cancelCont.addChild(cancelBg, cancelTxt);
    cancelCont.x = padH + text.width + gap;
    cancelCont.y = (totalH - cancelSz) / 2;
    cancelCont.eventMode = 'static';
    cancelCont.cursor    = 'pointer';
    cancelCont.hitArea   = new PIXI.Rectangle(0, 0, cancelSz, cancelSz);
    cancelCont.on('pointerdown', (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation());
    cancelCont.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this.clearSelection();
    });
    cancelCont.on('pointerover', () => { cancelBg.tint = 0xee6666; });
    cancelCont.on('pointerout',  () => { cancelBg.tint = 0xffffff; });

    this._prompt.addChild(bg, text, cancelCont);
    this._prompt.visible = true;
    this._layoutPrompt();
  }

  private _layoutPrompt(): void {
    if (!this._prompt.visible) return;
    const margin = Math.max(14, innerHeight * 0.025);
    this._prompt.x = (innerWidth - this._prompt.width) / 2;
    this._prompt.y = margin;
  }

  // ════════════════════════════════════════════════════════════════
  //  TOASTS
  // ════════════════════════════════════════════════════════════════
  private _buildToastLayer(): void {
    this._toastLayer = new PIXI.Container();
    this._uiLayer.addChild(this._toastLayer);
  }

  showToast(msg: string): void {
    const padV = 10, padH = 20;

    const txt = new PIXI.Text(msg, {
      fontFamily: FONT_TITLE, fontSize: 16, fill: 0xffffff,
    });
    txt.anchor.set(0.5, 0.5);

    const tw = txt.width + padH * 2;
    const th = txt.height + padV * 2;

    const bg = new PIXI.Graphics();
    bg.lineStyle(1, 0xffffff, 0.18);
    bg.beginFill(0x000000, 0.78);
    bg.drawRoundedRect(0, 0, tw, th, 14);
    bg.endFill();

    const toast = new PIXI.Container();
    txt.x = tw / 2; txt.y = th / 2;
    toast.addChild(bg, txt);
    toast.alpha = 0;
    toast.x = -tw / 2;

    this._toastLayer.addChild(toast);
    this._layoutToasts();

    // Animate: fade in (0.3s) → hold (1.65s) → fade out (0.35s)
    let elapsed = 0;
    const total = 2.3;
    const fadeIn = 0.3, fadeOut = 0.35;
    const fn = (dt: number) => {
      elapsed += dt / 60;
      if (elapsed < fadeIn) {
        toast.alpha = elapsed / fadeIn;
      } else if (elapsed < total - fadeOut) {
        toast.alpha = 1;
      } else {
        toast.alpha = Math.max(0, (total - elapsed) / fadeOut);
      }
      if (elapsed >= total) {
        this._pixi.ticker.remove(fn);
        this._toastLayer.removeChild(toast);
        this._layoutToasts();
      }
    };
    this._pixi.ticker.add(fn);
  }

  private _layoutToasts(): void {
    const portrait = innerWidth < innerHeight;
    const baseY    = portrait ? innerHeight * 0.80 : innerHeight - 120;
    this._toastLayer.x = innerWidth / 2;
    this._toastLayer.y = baseY;

    // Stack from bottom up
    let yOff = 0;
    for (let i = this._toastLayer.children.length - 1; i >= 0; i--) {
      const t = this._toastLayer.children[i] as PIXI.Container;
      t.y = yOff;
      yOff -= (t.height + 6);
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  UPGRADE MODAL
  // ════════════════════════════════════════════════════════════════
  private _buildUpgradeModal(): void {
    this._upgradeModal = new PIXI.Container();
    this._upgradeModal.visible = false;

    // Backdrop
    const backdrop = new PIXI.Graphics();
    backdrop.beginFill(0x000000, 0.72);
    backdrop.drawRect(0, 0, innerWidth, innerHeight);
    backdrop.endFill();
    backdrop.name = 'backdrop';
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this._hideUpgradeModal();
    });
    this._upgradeModal.addChild(backdrop);

    // Box
    const boxW  = Math.min(480, innerWidth * 0.88);
    const boxH  = 280;
    const boxBg = new PIXI.Graphics();
    boxBg.lineStyle(2, 0x3ddc68, 0.6);
    boxBg.beginFill(0x080c08, 0.96);
    boxBg.drawRoundedRect(0, 0, boxW, boxH, 20);
    boxBg.endFill();
    boxBg.name = 'boxBg';

    const emoji = new PIXI.Text('🌟', {
      fontFamily: FONT_BODY, fontSize: 52,
    });
    emoji.anchor.set(0.5, 0);
    emoji.x = boxW / 2; emoji.y = 24;

    const title = new PIXI.Text("You're on a roll!", {
      fontFamily: FONT_TITLE, fontSize: 28, fill: 0xffffff,
    });
    title.anchor.set(0.5, 0);
    title.x = boxW / 2; title.y = 86;

    this._upgradeSubText = new PIXI.Text('', {
      fontFamily: FONT_BODY, fontSize: 16, fontWeight: '700',
      fill: 0xffffffbb, wordWrap: true, wordWrapWidth: boxW - 64,
      align: 'center',
    });
    this._upgradeSubText.anchor.set(0.5, 0);
    this._upgradeSubText.x = boxW / 2; this._upgradeSubText.y = 128;

    // CTA button
    const ctaW = 200, ctaH = 48;
    const ctaBg = new PIXI.Graphics();
    ctaBg.beginFill(0x3ddc68);
    ctaBg.drawRoundedRect(0, 0, ctaW, ctaH, 50);
    ctaBg.endFill();
    const ctaTxt = new PIXI.Text('🛒 Get Full Version', {
      fontFamily: FONT_TITLE, fontSize: 18, fill: 0xffffff,
    });
    ctaTxt.anchor.set(0.5);
    ctaTxt.x = ctaW / 2; ctaTxt.y = ctaH / 2;
    const ctaCont = new PIXI.Container();
    ctaCont.addChild(ctaBg, ctaTxt);
    ctaCont.x = (boxW - ctaW) / 2;
    ctaCont.y = 192;
    ctaCont.eventMode = 'static';
    ctaCont.cursor    = 'pointer';
    ctaCont.on('pointerdown', (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation());
    ctaCont.on('pointerover', () => ctaCont.scale.set(1.05));
    ctaCont.on('pointerout',  () => ctaCont.scale.set(1));
    ctaCont.on('pointertap',  (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation());

    // Dismiss
    const dismissTxt = new PIXI.Text('Maybe later', {
      fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700',
      fill: 0xffffff66,
    });
    dismissTxt.anchor.set(0.5, 0);
    dismissTxt.x = boxW / 2; dismissTxt.y = 248;
    dismissTxt.eventMode = 'static';
    dismissTxt.cursor    = 'pointer';
    dismissTxt.on('pointerdown', (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation());
    dismissTxt.on('pointertap',  (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this._hideUpgradeModal();
    });
    dismissTxt.on('pointerover', () => { dismissTxt.style.fill = 0xffffffcc; });
    dismissTxt.on('pointerout',  () => { dismissTxt.style.fill = 0xffffff66; });

    const box = new PIXI.Container();
    box.addChild(boxBg, emoji, title, this._upgradeSubText, ctaCont, dismissTxt);
    box.name = 'box';
    this._upgradeModal.addChild(box);

    this._overlayLayer.addChild(this._upgradeModal);
    this._layoutUpgradeModal();
  }

  private _layoutUpgradeModal(): void {
    const backdrop = this._upgradeModal.getChildByName('backdrop') as PIXI.Graphics;
    if (backdrop) {
      backdrop.clear();
      backdrop.beginFill(0x000000, 0.72);
      backdrop.drawRect(0, 0, innerWidth, innerHeight);
      backdrop.endFill();
      backdrop.hitArea = new PIXI.Rectangle(0, 0, innerWidth, innerHeight);
    }
    const box = this._upgradeModal.getChildByName('box') as PIXI.Container;
    if (box) {
      box.x = (innerWidth  - box.width)  / 2;
      box.y = (innerHeight - box.height) / 2;
    }
  }

  showUpgradeModal(type: 'animals' | 'plants'): void {
    if (type === 'animals') {
      this._upgradeSubText.text =
        `You've placed all ${GameConfig.MAX_ANIMALS} free animals.\nUnlock unlimited animals in the full game!`;
    } else {
      this._upgradeSubText.text =
        `You've placed all ${GameConfig.MAX_PLANTS} free crops.\nUnlock unlimited crops in the full game!`;
    }
    this._layoutUpgradeModal();
    this._upgradeModal.visible = true;

    // Pop-in animation
    const box = this._upgradeModal.getChildByName('box') as PIXI.Container;
    if (!box) return;
    box.scale.set(0.8); box.alpha = 0;
    let t = 0;
    const fn = (dt: number) => {
      t = Math.min(t + dt / 60 / 0.35, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      const s = lerp(0.8, 1, ease);
      box.scale.set(s);
      box.alpha = t;
      if (t >= 1) this._pixi.ticker.remove(fn);
    };
    this._pixi.ticker.add(fn);
  }

  private _hideUpgradeModal(): void {
    this._upgradeModal.visible = false;
  }

  // ════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════════
  clearSelection(): void {
    this._selItem = null;
    this._prompt.visible = false;

    // Reset all item button visuals
    (['crops', 'animals'] as ItemCategory[]).forEach(cat => {
      ItemCatalog[cat].forEach(item => {
        const bg = this._itemBtnBgs.get(item.id);
        if (bg) this._drawItemBtnBg(bg, 210, 56, false, this._coins < item.cost);
      });
      // Reset cat icon to default
      const defKey = this._catDefaultImg[cat] as string;
      const defTex = PIXI.Texture.from(defKey);
      this._catIconSprites[cat].texture = defTex;
    });

    this.emit('itemSelected', null);
  }

  onItemPlaced(name: string, cost: number, sx?: number, sy?: number): void {
    this._coins = Math.max(0, this._coins - cost);
    this._updateCoinText();
    this._bounceCoinHUD();
    this._prompt.visible = false;
    this._selItem = null;
    this.showToast(`✨ ${name} placed!`);
    if (sx !== undefined && sy !== undefined) this._spawnSparkles(sx, sy);
  }

  showSkipDay(onClick: () => void): void {
    this._skipDayHandler = onClick;
    this._skipDayBtn.visible = true;
    this._layoutSkipDay();
  }

  hideSkipDay(): void {
    this._skipDayBtn.visible = false;
  }

  incrementCount(zone: 'field' | 'fence'): void {
    if (zone === 'fence') this._animalCount++;
    else                  this._plantCount++;
  }

  /** Show sidebar — called by TutorialState when tutorial completes. */
  showSidebar(): void {
    let t = 0;
    const fn = (dt: number) => {
      t = Math.min(t + dt / 60 / 0.6, 1);
      this._sidebar.alpha = t;
      if (t >= 1) this._pixi.ticker.remove(fn);
    };
    this._pixi.ticker.add(fn);
  }

  updateMuteIcon(_muted: boolean): void {}
  updateDNIcon(_isDay: boolean):   void {}

  // ════════════════════════════════════════════════════════════════
  //  RESIZE
  // ════════════════════════════════════════════════════════════════
  private _onResize(): void {
    this._pixi.renderer.resize(innerWidth, innerHeight);
    this._layoutCoinHUD();
    this._layoutWatermark();
    this._layoutSkipDay();
    this._layoutSidebar();
    this._layoutPrompt();
    this._layoutToasts();
    this._layoutUpgradeModal();
  }

  // ════════════════════════════════════════════════════════════════
  //  SPARKLES  (PixiJS particle effect)
  // ════════════════════════════════════════════════════════════════
  private _spawnSparkles(sx: number, sy: number): void {
    const tex = this._smokeTexture ?? PIXI.Texture.from('/assets/images/smoke.png');

    type Puff = { s: PIXI.Sprite; vx: number; vy: number; vr: number; life: number; maxLife: number };
    const puffs: Puff[] = [];

    for (let i = 0; i < 6; i++) {
      const s    = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      const size = 40 + Math.random() * 40;
      s.width  = size; s.height = size;
      s.position.set(sx + (Math.random()-0.5)*20, sy + (Math.random()-0.5)*10);
      s.alpha  = 0;
      this._fxLayer.addChild(s);

      const angle = -Math.PI/2 + (Math.random()-0.5)*Math.PI;
      const speed = 30 + Math.random() * 50;
      const life  = 0.55 + Math.random() * 0.35;
      puffs.push({ s, life, maxLife: life,
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        vr: (Math.random()-0.5)*1.5 });
    }

    const fn = (dt: number) => {
      const delta = dt / 60;
      let done = true;
      puffs.forEach(p => {
        if (p.life <= 0) { p.s.alpha = 0; return; }
        done = false;
        p.life -= delta;
        const t = p.life / p.maxLife;
        p.s.alpha    = t < 0.8 ? t/0.8*0.8 : (1-t)/0.2*0.8;
        p.s.x       += p.vx * delta;
        p.s.y       += p.vy * delta;
        p.vy        -= 15 * delta;
        p.s.rotation += p.vr * delta;
        p.s.scale.set(1 + (1-t)*1.2);
      });
      if (done) {
        puffs.forEach(p => this._fxLayer.removeChild(p.s));
        this._pixi.ticker.remove(fn);
      }
    };
    this._pixi.ticker.add(fn);
  }

  // ════════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════════
  private _itemEmoji(id: string): string {
    const m: Record<string, string> = {
      chicken:'🐔', cow:'🐄', sheep:'🐑',
      corn:'🌽', grape:'🍇', strawberry:'🍓', tomato:'🍅',
    };
    return m[id] ?? '🌱';
  }

  private _bounceCoinHUD(): void {
    let t = 0;
    const fn = (dt: number) => {
      t = Math.min(t + dt / 60 / 0.35, 1);
      const s = 1 + 0.2 * Math.sin(t * Math.PI);
      this._coinHUD.scale.set(s);
      if (t >= 1) { this._coinHUD.scale.set(1); this._pixi.ticker.remove(fn); }
    };
    this._pixi.ticker.add(fn);
  }

  private _shakeCoinHUD(): void {
    const origX = this._coinHUD.x;
    let t = 0;
    const fn = (dt: number) => {
      t = Math.min(t + dt / 60 / 0.3, 1);
      this._coinHUD.x = origX + Math.sin(t * Math.PI * 5) * 6 * (1 - t);
      if (t >= 1) { this._coinHUD.x = origX; this._pixi.ticker.remove(fn); }
    };
    this._pixi.ticker.add(fn);
  }
}
