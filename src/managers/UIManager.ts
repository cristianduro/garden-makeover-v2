import * as PIXI from 'pixi.js';
import { EventEmitter } from '../utils/EventEmitter';
import { ItemCatalog, ItemData, ItemCategory } from '../garden/ItemCatalog';
import { GameConfig } from '../core/GameConfig';

type ImgKey = keyof typeof GameConfig.ASSETS.IMAGES;

const FONT_TITLE = 'Fredoka One, cursive';
const FONT_BODY  = 'Nunito, sans-serif';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export class UIManager extends EventEmitter {

  private pixiApp!:         PIXI.Application;
  private uiLayer!:         PIXI.Container;
  private fxLayer!:         PIXI.Container;
  public  overlayLayer!:    PIXI.Container;
  private textures:         Map<string, PIXI.Texture> = new Map();
  private smokeTexture:     PIXI.Texture | null = null;

  private coinHUD!:    PIXI.Container;
  private coinText!:   PIXI.Text;
  private coinHUDBg!:  PIXI.Graphics;

  private watermark!:  PIXI.Sprite;

  private skipDayBtn!:    PIXI.Container;
  private skipDayBg!:     PIXI.Graphics;
  private skipDayBorder!: PIXI.Graphics;
  private skipDayHandler: (() => void) | null = null;
  private skipDayTime  = 0;
  private skipDaySize  = 52;

  private sidebar!:       PIXI.Container;
  private categoryRows!:  PIXI.Container[];
  private categoryButtonContainers: Record<ItemCategory, PIXI.Container> = {} as any;
  private categoryButtonBackgrounds: Record<ItemCategory, PIXI.Graphics>  = {} as any;
  private categoryIconSprites:  Record<ItemCategory, PIXI.Sprite>    = {} as any;
  private categorySubMenus:     Record<ItemCategory, PIXI.Container> = {} as any;
  private categoryDefaultImages: Record<ItemCategory, string> = {
    crops:   GameConfig.ASSETS.IMAGES.corn,
    animals: GameConfig.ASSETS.IMAGES.cow,
  };
  private itemButtonBackgrounds: Map<string, PIXI.Graphics>  = new Map();
  private openCategory:  ItemCategory | null = null;

  private prompt!:     PIXI.Container;
  private promptText!: PIXI.Text;

  private toastLayer!: PIXI.Container;

  private upgradeModal!:    PIXI.Container;
  private upgradeSubText!:  PIXI.Text;

  private coinBalance: number = GameConfig.START_COINS;
  private currentSelection:   ItemData | null = null;
  private placedAnimalCount  = 0;
  private placedPlantCount   = 0;

  get canvas():        HTMLCanvasElement { return this.pixiApp.view as HTMLCanvasElement; }
  get app():           PIXI.Application  { return this.pixiApp; }
  get selectedItem():  ItemData | null   { return this.currentSelection; }
  get coins():         number            { return this.coinBalance; }
  get animalCount():   number            { return this.placedAnimalCount; }
  get plantCount():    number            { return this.placedPlantCount; }

  async init(container: HTMLElement): Promise<void> {
    this.loadFonts();

    this.pixiApp = new PIXI.Application({
      width:           innerWidth,
      height:          innerHeight,
      backgroundAlpha: 0,
      autoDensity:     true,
      resolution:      Math.min(devicePixelRatio, 2),
    });

    const cv = this.pixiApp.view as HTMLCanvasElement;
    cv.style.cssText = 'position:absolute;inset:0;z-index:45;pointer-events:auto;';
    container.appendChild(cv);

    this.uiLayer      = new PIXI.Container();
    this.fxLayer      = new PIXI.Container();
    this.overlayLayer = new PIXI.Container();
    this.pixiApp.stage.addChild(this.uiLayer);
    this.pixiApp.stage.addChild(this.fxLayer);
    this.pixiApp.stage.addChild(this.overlayLayer);

    await this.loadTextures();
    this.smokeTexture = this.textures.get('smoke') ?? null;

    this.buildCoinHUD();
    this.buildWatermark();
    this.buildSkipDay();
    this.buildSidebar();
    this.buildPrompt();
    this.buildToastLayer();
    this.buildUpgradeModal();

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  private loadFonts(): void {
    if (document.getElementById('gm-fonts')) return;
    const link = document.createElement('link');
    link.id   = 'gm-fonts';
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;700;800;900&display=swap';
    document.head.appendChild(link);
  }

  private async loadTextures(): Promise<void> {
    const sources: Record<string, string> = {
      ...(GameConfig.ASSETS.IMAGES as Record<string, string>),
      smoke:   '/assets/images/smoke.png',
      skipDay: '/assets/images/skip_day.png',
      icon:    '/assets/icon.png',
    };
    await Promise.all(Object.entries(sources).map(([k, url]) =>
      new Promise<void>(resolve => {
        const tex = PIXI.Texture.from(url);
        this.textures.set(k, tex);
        if (tex.baseTexture.valid) { resolve(); return; }
        tex.baseTexture.once('loaded', () => resolve());
        tex.baseTexture.once('error',  () => resolve());
      })
    ));
  }

  private buildCoinHUD(): void {
    this.coinHUD   = new PIXI.Container();
    this.coinHUDBg = new PIXI.Graphics();
    this.coinHUD.addChild(this.coinHUDBg);

    const gem = new PIXI.Sprite(this.textures.get('money') ?? PIXI.Texture.WHITE);
    gem.anchor.set(0, 0.5);
    gem.name = 'gem';
    this.coinHUD.addChild(gem);

    this.coinText = new PIXI.Text(`${this.coinBalance}`, {
      fontFamily: FONT_TITLE, fontSize: 28, fill: 0xffffff,
      dropShadow: true, dropShadowDistance: 2, dropShadowAlpha: 0.5,
    });
    this.coinText.anchor.set(0, 0.5);
    this.coinHUD.addChild(this.coinText);

    this.uiLayer.addChild(this.coinHUD);
    this.layoutCoinHUD();
  }

  private layoutCoinHUD(): void {
    const portrait  = innerWidth < innerHeight;
    const gemSz     = portrait ? 26 : 32;
    const fontSize  = portrait ? 22 : 28;
    const padV = 8, padH = 16, gap = 8;

    const gem = this.coinHUD.getChildByName('gem') as PIXI.Sprite;
    gem.width  = gemSz;
    gem.height = gemSz;
    gem.x = padH / 2;
    gem.y = 0;

    this.coinText.style.fontSize = fontSize;
    this.coinText.x = gem.x + gemSz + gap;
    this.coinText.y = 0;

    const totalW = gem.x + gemSz + gap + this.coinText.width + padH / 2 + padH;
    const totalH = gemSz + padV * 2;

    this.coinHUDBg.clear();
    this.coinHUDBg.lineStyle(1, 0xffffff, 0.15);
    this.coinHUDBg.beginFill(0x000000, 0.78);
    this.coinHUDBg.drawRoundedRect(0, -totalH / 2, totalW, totalH, 14);
    this.coinHUDBg.endFill();

    const margin = Math.max(10, innerWidth * 0.02);
    const topMargin = Math.max(10, innerHeight * 0.02);
    this.coinHUD.x = innerWidth  - totalW - margin;
    this.coinHUD.y = topMargin + totalH / 2;
  }

  private updateCoinText(): void {
    this.coinText.text = `${this.coinBalance}`;
    this.layoutCoinHUD();
  }

  private buildWatermark(): void {
    this.watermark = new PIXI.Sprite(this.textures.get('icon') ?? PIXI.Texture.WHITE);
    this.watermark.anchor.set(0, 0);
    this.watermark.alpha = 0.55;
    this.uiLayer.addChild(this.watermark);
  }

  private layoutWatermark(): void {
    const sz = Math.max(36, Math.min(innerWidth * 0.06, 60));
    const margin = Math.max(8, innerWidth * 0.015);
    this.watermark.width  = sz;
    this.watermark.height = sz;
    this.watermark.x = margin;
    this.watermark.y = Math.max(8, innerHeight * 0.015);
  }

  private buildSkipDay(): void {
    this.skipDayBtn = new PIXI.Container();
    this.skipDayBtn.visible = false;

    this.skipDayBg = new PIXI.Graphics();
    this.skipDayBtn.addChild(this.skipDayBg);

    const img = new PIXI.Sprite(this.textures.get('skipDay') ?? PIXI.Texture.WHITE);
    img.anchor.set(0.5);
    img.name = 'img';
    this.skipDayBtn.addChild(img);

    // Animated border drawn separately to avoid feedback loop when reading container.width
    this.skipDayBorder = new PIXI.Graphics();
    this.skipDayBtn.addChild(this.skipDayBorder);

    this.skipDayBtn.eventMode = 'static';
    this.skipDayBtn.cursor    = 'pointer';

    this.skipDayBtn.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this.skipDayBtn.scale.set(0.93);
    });
    this.skipDayBtn.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this.skipDayBtn.scale.set(1);
      if (this.skipDayHandler) this.skipDayHandler();
    });
    this.skipDayBtn.on('pointerover', () => this.skipDayBtn.scale.set(1.1));
    this.skipDayBtn.on('pointerout',  () => this.skipDayBtn.scale.set(1));

    this.pixiApp.ticker.add((dt: number) => {
      if (!this.skipDayBtn.visible) return;
      this.skipDayTime += dt / 60;
      const alpha = 0.35 + 0.55 * (Math.sin(this.skipDayTime * Math.PI / 0.9) * 0.5 + 0.5);
      const sz    = this.skipDaySize;
      this.skipDayBorder.clear();
      this.skipDayBorder.lineStyle(2.5, 0xffc832, alpha);
      this.skipDayBorder.drawRoundedRect(0, 0, sz, sz, 14);
    });

    this.uiLayer.addChild(this.skipDayBtn);
  }

  private layoutSkipDay(): void {
    const sz     = Math.max(42, Math.min(innerWidth * 0.08, 56));
    const margin = Math.max(10, innerWidth * 0.02);
    this.skipDaySize = sz;

    this.skipDayBg.clear();
    this.skipDayBg.beginFill(0x000000, 0.72);
    this.skipDayBg.drawRoundedRect(0, 0, sz, sz, 14);
    this.skipDayBg.endFill();

    this.skipDayBorder.clear();
    this.skipDayBorder.lineStyle(2.5, 0xffc832, 0.5);
    this.skipDayBorder.drawRoundedRect(0, 0, sz, sz, 14);

    const img = this.skipDayBtn.getChildByName('img') as PIXI.Sprite;
    if (img) { img.width = sz - 14; img.height = sz - 14; img.x = sz / 2; img.y = sz / 2; }

    const coinBottom = this.coinHUD.y + this.coinHUDBg.height / 2 + 8;
    this.skipDayBtn.x = innerWidth - sz - margin;
    this.skipDayBtn.y = coinBottom;
  }

  private buildSidebar(): void {
    this.sidebar      = new PIXI.Container();
    this.sidebar.alpha = 0;
    this.categoryRows = [];

    const defs: Array<{ cat: ItemCategory; imgKey: ImgKey; label: string }> = [
      { cat: 'crops',   imgKey: 'corn', label: 'Crop'   },
      { cat: 'animals', imgKey: 'cow',  label: 'Cattle' },
    ];

    defs.forEach(({ cat, imgKey, label }) => {
      const row = this.makeCatRow(cat, imgKey, label);
      this.categoryRows.push(row);
      this.sidebar.addChild(row);
    });

    this.uiLayer.addChild(this.sidebar);
  }

  private makeCatRow(cat: ItemCategory, imgKey: ImgKey, label: string): PIXI.Container {
    const row = new PIXI.Container();
    const SZ  = 64;
    const RAD = 14;

    const btnCont = new PIXI.Container();
    const btnBg   = new PIXI.Graphics();
    this.drawCatBg(btnBg, SZ, false);
    btnCont.addChild(btnBg);

    const catImg = new PIXI.Sprite(this.textures.get(imgKey) ?? PIXI.Texture.WHITE);
    catImg.anchor.set(0.5);
    catImg.width  = SZ * 0.72;
    catImg.height = SZ * 0.72;
    catImg.x = SZ / 2;
    catImg.y = SZ / 2;
    btnCont.addChild(catImg);
    this.categoryIconSprites[cat] = catImg;

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
    btnCont.on('pointerover', () => { if (this.openCategory !== cat) btnCont.scale.set(1.07); });
    btnCont.on('pointerout',  () => { if (this.openCategory !== cat) btnCont.scale.set(1); });
    btnCont.on('pointertap',  (e) => {
      stopNative(e);
      this.toggleMenu(cat);
    });

    this.categoryButtonContainers[cat] = btnCont;
    this.categoryButtonBackgrounds[cat] = btnBg;
    row.addChild(btnCont);

    const lblW   = 80;
    const lblGap = 6;
    const lblBg  = new PIXI.Graphics();
    lblBg.lineStyle(1, 0xffffff, 0.15);
    lblBg.beginFill(0x000000, 0.78);
    lblBg.drawRoundedRect(0, 0, lblW, SZ, RAD);
    lblBg.endFill();
    const lblCont = new PIXI.Container();
    lblCont.addChild(lblBg);
    const lblTxt = new PIXI.Text(label, {
      fontFamily: FONT_TITLE, fontSize: 16, fill: 0xffffff,
    });
    lblTxt.anchor.set(0, 0.5);
    lblTxt.x = 12; lblTxt.y = SZ / 2;
    lblCont.addChild(lblTxt);
    lblCont.x = SZ + lblGap;
    lblCont.name = 'label';
    row.addChild(lblCont);

    const sub = this.makeSubMenu(cat, SZ);
    sub.visible = false;
    this.categorySubMenus[cat] = sub;
    row.addChild(sub);

    return row;
  }

  private makeSubMenu(cat: ItemCategory, btnSz: number): PIXI.Container {
    const sub    = new PIXI.Container();
    const items  = ItemCatalog[cat];
    const itemH  = 56;
    const itemW  = 210;
    const gap    = 8;
    let yOff = 0;

    items.forEach(item => {
      const btn = this.makeItemBtn(item, itemW, itemH);
      btn.y = yOff;
      sub.addChild(btn);
      yOff += itemH + gap;
    });

    const backH  = 44;
    const backBg = new PIXI.Graphics();
    backBg.lineStyle(1, 0xffffff, 0.15);
    backBg.beginFill(0x505050, 0.8);
    backBg.drawRoundedRect(0, 0, itemW, backH, 14);
    backBg.endFill();
    const backTxt = new PIXI.Text('← Back', {
      fontFamily: FONT_TITLE, fontSize: 16, fill: 'rgba(255,255,255,0.7)',
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
      this.closeMenu();
    });
    backCont.on('pointerover', () => { backBg.tint = 0xcccccc; });
    backCont.on('pointerout',  () => { backBg.tint = 0xffffff; });
    sub.addChild(backCont);

    return sub;
  }

  private makeItemBtn(item: ItemData, w: number, h: number): PIXI.Container {
    const cont = new PIXI.Container();
    const bg   = new PIXI.Graphics();
    this.drawItemBtnBg(bg, w, h, false, false);
    cont.addChild(bg);
    this.itemButtonBackgrounds.set(item.id, bg);

    const iconSz  = 40;
    const imgKey  = item.imageKey as ImgKey;
    const iconTex = this.textures.get(imgKey) ?? PIXI.Texture.WHITE;
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

    const gemSz  = 16;
    const gemTex = this.textures.get('money') ?? PIXI.Texture.WHITE;
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

    cont.eventMode = 'static';
    cont.cursor    = 'pointer';
    cont.hitArea   = new PIXI.Rectangle(0, 0, w, h);

    const stopNative = (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();

    cont.on('pointerdown', (e) => { stopNative(e); cont.scale.set(0.97); });
    cont.on('pointerup',   (e) => { stopNative(e); cont.scale.set(1); });
    cont.on('pointerover', () => {
      if (this.currentSelection?.id !== item.id && this.coinBalance >= item.cost) {
        cont.x = 5;
      }
    });
    cont.on('pointerout', () => {
      if (this.currentSelection?.id !== item.id) cont.x = 0;
    });
    cont.on('pointertap', (e) => {
      stopNative(e);
      this.selectItem(item);
    });

    return cont;
  }

  private drawCatBg(graphics: PIXI.Graphics, sz: number, active: boolean): void {
    graphics.clear();
    const borderColor = active ? 0x3ddc68 : 0xffffff;
    const borderAlpha = active ? 1.0 : 0.2;
    graphics.lineStyle(2, borderColor, borderAlpha);
    graphics.beginFill(0x000000, 0.78);
    graphics.drawRoundedRect(0, 0, sz, sz, 14);
    graphics.endFill();
  }

  private drawItemBtnBg(graphics: PIXI.Graphics, w: number, h: number,
                         selected: boolean, noCoins: boolean): void {
    graphics.clear();
    const borderColor = selected ? 0x3ddc68 : 0xffffff;
    const borderAlpha = selected ? 1.0 : 0.18;
    const fillColor   = selected ? 0x3ddc68 : 0x000000;
    const fillAlpha   = selected ? 0.18    : 0.78;
    graphics.lineStyle(1, borderColor, borderAlpha);
    graphics.beginFill(fillColor, fillAlpha);
    graphics.drawRoundedRect(0, 0, w, h, 14);
    graphics.endFill();
    if (noCoins) { graphics.alpha = 0.45; } else { graphics.alpha = 1; }
  }

  private toggleMenu(cat: ItemCategory): void {
    if (this.openCategory === cat) { this.closeMenu(); return; }
    this.closeMenu();
    this.openCategory = cat;

    const sub  = this.categorySubMenus[cat];
    const btnBg = this.categoryButtonBackgrounds[cat];
    this.drawCatBg(btnBg, 64, true);
    sub.visible = true;
    this.positionSubMenu(cat);
    this.refreshSubMenu(cat);
  }

  private closeMenu(): void {
    if (!this.openCategory) return;
    const cat  = this.openCategory;
    this.openCategory = null;
    this.categorySubMenus[cat].visible = false;
    this.drawCatBg(this.categoryButtonBackgrounds[cat], 64, false);
    this.categoryButtonContainers[cat].scale.set(1);
  }

  /** Position the open submenu based on current orientation. */
  private positionSubMenu(cat: ItemCategory): void {
    const portrait = innerWidth < innerHeight;
    const sub  = this.categorySubMenus[cat];
    const row  = this.categoryRows[cat === 'crops' ? 0 : 1];
    const lbl  = row.getChildByName('label') as PIXI.Container | null;

    if (portrait) {
      const totalSubH = sub.height;
      sub.x = 0;
      sub.y = -(totalSubH + 8);
    } else {
      const lblW = lbl ? (lbl.width + 4) : 88;
      sub.x = 64 + lblW;
      sub.y = -sub.height / 2 + 32;
    }
  }

  private refreshSubMenu(cat: ItemCategory): void {
    const sub = this.categorySubMenus[cat];
    ItemCatalog[cat].forEach(item => {
      const bg = this.itemButtonBackgrounds.get(item.id);
      if (!bg) return;
      const selected = this.currentSelection?.id === item.id;
      const noCoins  = this.coinBalance < item.cost;
      this.drawItemBtnBg(bg, 210, 56, selected, noCoins);
      const parent = bg.parent as PIXI.Container;
      parent.alpha = noCoins ? 0.5 : 1;
    });
    this.positionSubMenu(cat);
    void sub;
  }

  private selectItem(item: ItemData): void {
    if (this.coinBalance < item.cost) {
      this.showToast(`❌ Need ${item.cost} coins!`);
      this.shakeCoinHUD();
      return;
    }

    this.currentSelection = item;

    const allCats: ItemCategory[] = ['crops', 'animals'];
    allCats.forEach(cat => {
      ItemCatalog[cat].forEach(i => {
        const bg = this.itemButtonBackgrounds.get(i.id);
        if (bg) this.drawItemBtnBg(bg, 210, 56, i.id === item.id, this.coinBalance < i.cost);
      });
    });

    const iconKey = item.imageKey as ImgKey;
    const cat     = item.zone === 'fence' ? 'animals' : 'crops';
    const newTex  = this.textures.get(iconKey) ?? PIXI.Texture.WHITE;
    this.categoryIconSprites[cat].texture = newTex;

    this.closeMenu();
    this.showPrompt(item);
    this.emit('itemSelected', item);
  }

  private layoutSidebar(): void {
    const portrait = innerWidth < innerHeight;
    const SZ       = portrait ? 52 : 64;
    const gap      = portrait ? 8  : 10;
    const margin   = portrait ? 6  : 8;

    (['crops', 'animals'] as ItemCategory[]).forEach(cat => {
      const bg = this.categoryButtonBackgrounds[cat];
      this.drawCatBg(bg, SZ, this.openCategory === cat);
      const icon = this.categoryIconSprites[cat];
      icon.width  = SZ * 0.72;
      icon.height = SZ * 0.72;
      icon.x = SZ / 2; icon.y = SZ / 2;
      this.categoryButtonContainers[cat].hitArea = new PIXI.Rectangle(0, 0, SZ, SZ);
    });

    if (portrait) {
      this.sidebar.x = margin;
      this.sidebar.y = innerHeight - SZ - margin;

      this.categoryRows.forEach((row, index) => {
        row.x = index * (SZ + gap);
        row.y = 0;
        const lbl = row.getChildByName('label') as PIXI.Container | null;
        if (lbl) lbl.visible = false;
      });
    } else {
      const totalH = this.categoryRows.length * SZ + (this.categoryRows.length - 1) * gap;
      this.sidebar.x = margin;
      this.sidebar.y = (innerHeight - totalH) / 2;

      this.categoryRows.forEach((row, index) => {
        row.x = 0;
        row.y = index * (SZ + gap);
        const lbl = row.getChildByName('label') as PIXI.Container | null;
        if (lbl) lbl.visible = true;
      });
    }

    if (this.openCategory) this.positionSubMenu(this.openCategory);
  }

  private buildPrompt(): void {
    this.prompt = new PIXI.Container();
    this.prompt.visible = false;
    this.uiLayer.addChild(this.prompt);
  }

  private showPrompt(item: ItemData): void {
    this.prompt.removeChildren();

    const emoji = this.itemEmoji(item.id);
    const zone  = item.zone === 'fence' ? 'in the pen' : 'in the field';
    const msg   = `${emoji} Place ${item.name} ${zone}`;

    const padV = 12, padH = 22, gap = 14;

    const text = new PIXI.Text(msg, {
      fontFamily: FONT_TITLE, fontSize: 17, fill: 0xffffff,
    });
    text.anchor.set(0, 0.5);
    this.promptText = text;

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

    this.prompt.addChild(bg, text, cancelCont);
    this.prompt.visible = true;
    this.layoutPrompt();
  }

  private layoutPrompt(): void {
    if (!this.prompt.visible) return;
    const margin = Math.max(14, innerHeight * 0.025);
    this.prompt.x = (innerWidth - this.prompt.width) / 2;
    this.prompt.y = margin;
  }

  private buildToastLayer(): void {
    this.toastLayer = new PIXI.Container();
    this.uiLayer.addChild(this.toastLayer);
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

    this.toastLayer.addChild(toast);
    this.layoutToasts();

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
        this.pixiApp.ticker.remove(fn);
        this.toastLayer.removeChild(toast);
        this.layoutToasts();
      }
    };
    this.pixiApp.ticker.add(fn);
  }

  private layoutToasts(): void {
    const portrait = innerWidth < innerHeight;
    const baseY    = portrait ? innerHeight * 0.80 : innerHeight - 120;
    this.toastLayer.x = innerWidth / 2;
    this.toastLayer.y = baseY;

    let yOff = 0;
    for (let index = this.toastLayer.children.length - 1; index >= 0; index--) {
      const toast = this.toastLayer.children[index] as PIXI.Container;
      toast.y = yOff;
      yOff -= (toast.height + 6);
    }
  }

  private buildUpgradeModal(): void {
    this.upgradeModal = new PIXI.Container();
    this.upgradeModal.visible = false;

    const backdrop = new PIXI.Graphics();
    backdrop.beginFill(0x000000, 0.72);
    backdrop.drawRect(0, 0, innerWidth, innerHeight);
    backdrop.endFill();
    backdrop.name = 'backdrop';
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this.hideUpgradeModal();
    });
    this.upgradeModal.addChild(backdrop);

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

    this.upgradeSubText = new PIXI.Text('', {
      fontFamily: FONT_BODY, fontSize: 16, fontWeight: '700',
      fill: 'rgba(255,255,255,0.73)', wordWrap: true, wordWrapWidth: boxW - 64,
      align: 'center',
    });
    this.upgradeSubText.anchor.set(0.5, 0);
    this.upgradeSubText.x = boxW / 2; this.upgradeSubText.y = 128;

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

    const dismissTxt = new PIXI.Text('Maybe later', {
      fontFamily: FONT_BODY, fontSize: 13, fontWeight: '700',
      fill: 'rgba(255,255,255,0.4)',
    });
    dismissTxt.anchor.set(0.5, 0);
    dismissTxt.x = boxW / 2; dismissTxt.y = 248;
    dismissTxt.eventMode = 'static';
    dismissTxt.cursor    = 'pointer';
    dismissTxt.on('pointerdown', (e: PIXI.FederatedPointerEvent) =>
      (e.nativeEvent as PointerEvent).stopImmediatePropagation());
    dismissTxt.on('pointertap',  (e: PIXI.FederatedPointerEvent) => {
      (e.nativeEvent as PointerEvent).stopImmediatePropagation();
      this.hideUpgradeModal();
    });
    dismissTxt.on('pointerover', () => { dismissTxt.style.fill = 'rgba(255,255,255,0.8)'; });
    dismissTxt.on('pointerout',  () => { dismissTxt.style.fill = 'rgba(255,255,255,0.4)'; });

    const box = new PIXI.Container();
    box.addChild(boxBg, emoji, title, this.upgradeSubText, ctaCont, dismissTxt);
    box.name = 'box';
    this.upgradeModal.addChild(box);

    this.overlayLayer.addChild(this.upgradeModal);
    this.layoutUpgradeModal();
  }

  private layoutUpgradeModal(): void {
    const backdrop = this.upgradeModal.getChildByName('backdrop') as PIXI.Graphics;
    if (backdrop) {
      backdrop.clear();
      backdrop.beginFill(0x000000, 0.72);
      backdrop.drawRect(0, 0, innerWidth, innerHeight);
      backdrop.endFill();
      backdrop.hitArea = new PIXI.Rectangle(0, 0, innerWidth, innerHeight);
    }
    const box = this.upgradeModal.getChildByName('box') as PIXI.Container;
    if (box) {
      box.x = (innerWidth  - box.width)  / 2;
      box.y = (innerHeight - box.height) / 2;
    }
  }

  showUpgradeModal(type: 'animals' | 'plants'): void {
    if (type === 'animals') {
      this.upgradeSubText.text =
        `You've placed all ${GameConfig.MAX_ANIMALS} free animals.\nUnlock unlimited animals in the full game!`;
    } else {
      this.upgradeSubText.text =
        `You've placed all ${GameConfig.MAX_PLANTS} free crops.\nUnlock unlimited crops in the full game!`;
    }
    this.layoutUpgradeModal();
    this.upgradeModal.visible = true;

    const box = this.upgradeModal.getChildByName('box') as PIXI.Container;
    if (!box) return;
    box.scale.set(0.8); box.alpha = 0;
    let animProgress = 0;
    const fn = (dt: number) => {
      animProgress = Math.min(animProgress + dt / 60 / 0.35, 1);
      const ease = animProgress < 0.5 ? 2*animProgress*animProgress : -1+(4-2*animProgress)*animProgress;
      const scale = lerp(0.8, 1, ease);
      box.scale.set(scale);
      box.alpha = animProgress;
      if (animProgress >= 1) this.pixiApp.ticker.remove(fn);
    };
    this.pixiApp.ticker.add(fn);
  }

  private hideUpgradeModal(): void {
    this.upgradeModal.visible = false;
  }

  clearSelection(): void {
    this.currentSelection = null;
    this.prompt.visible = false;

    (['crops', 'animals'] as ItemCategory[]).forEach(cat => {
      ItemCatalog[cat].forEach(item => {
        const bg = this.itemButtonBackgrounds.get(item.id);
        if (bg) this.drawItemBtnBg(bg, 210, 56, false, this.coinBalance < item.cost);
      });
      const defKey = this.categoryDefaultImages[cat] as string;
      const defTex = PIXI.Texture.from(defKey);
      this.categoryIconSprites[cat].texture = defTex;
    });

    this.emit('itemSelected', null);
  }

  onItemPlaced(name: string, cost: number, sx?: number, sy?: number): void {
    this.coinBalance = Math.max(0, this.coinBalance - cost);
    this.updateCoinText();
    this.bounceCoinHUD();
    this.prompt.visible = false;
    this.currentSelection = null;
    this.showToast(`✨ ${name} placed!`);
    if (sx !== undefined && sy !== undefined) this.spawnSparkles(sx, sy);
  }

  showSkipDay(onClick: () => void): void {
    this.skipDayHandler = onClick;
    this.skipDayBtn.visible = true;
    this.layoutSkipDay();
  }

  hideSkipDay(): void {
    this.skipDayBtn.visible = false;
  }

  incrementCount(zone: 'field' | 'fence'): void {
    if (zone === 'fence') this.placedAnimalCount++;
    else                  this.placedPlantCount++;
  }

  /** Show sidebar — called by TutorialState when tutorial completes. */
  showSidebar(): void {
    let animProgress = 0;
    const fn = (dt: number) => {
      animProgress = Math.min(animProgress + dt / 60 / 0.6, 1);
      this.sidebar.alpha = animProgress;
      if (animProgress >= 1) this.pixiApp.ticker.remove(fn);
    };
    this.pixiApp.ticker.add(fn);
  }

  updateMuteIcon(_muted: boolean): void {}
  updateDNIcon(_isDay: boolean):   void {}

  private onResize(): void {
    this.pixiApp.renderer.resize(innerWidth, innerHeight);
    this.layoutCoinHUD();
    this.layoutWatermark();
    this.layoutSkipDay();
    this.layoutSidebar();
    this.layoutPrompt();
    this.layoutToasts();
    this.layoutUpgradeModal();
  }

  private spawnSparkles(sx: number, sy: number): void {
    const tex = this.smokeTexture ?? PIXI.Texture.from('/assets/images/smoke.png');

    type Puff = { sprite: PIXI.Sprite; vx: number; vy: number; vr: number; life: number; maxLife: number };
    const puffs: Puff[] = [];

    for (let index = 0; index < 6; index++) {
      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5);
      const size = 40 + Math.random() * 40;
      sprite.width  = size; sprite.height = size;
      sprite.position.set(sx + (Math.random()-0.5)*20, sy + (Math.random()-0.5)*10);
      sprite.alpha  = 0;
      this.fxLayer.addChild(sprite);

      const angle = -Math.PI/2 + (Math.random()-0.5)*Math.PI;
      const speed = 30 + Math.random() * 50;
      const life  = 0.55 + Math.random() * 0.35;
      puffs.push({ sprite, life, maxLife: life,
        vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        vr: (Math.random()-0.5)*1.5 });
    }

    const fn = (dt: number) => {
      const delta = dt / 60;
      let done = true;
      puffs.forEach(puff => {
        if (puff.life <= 0) { puff.sprite.alpha = 0; return; }
        done = false;
        puff.life -= delta;
        const progress = puff.life / puff.maxLife;
        puff.sprite.alpha    = progress < 0.8 ? progress/0.8*0.8 : (1-progress)/0.2*0.8;
        puff.sprite.x       += puff.vx * delta;
        puff.sprite.y       += puff.vy * delta;
        puff.vy             -= 15 * delta;
        puff.sprite.rotation += puff.vr * delta;
        puff.sprite.scale.set(1 + (1-progress)*1.2);
      });
      if (done) {
        puffs.forEach(puff => this.fxLayer.removeChild(puff.sprite));
        this.pixiApp.ticker.remove(fn);
      }
    };
    this.pixiApp.ticker.add(fn);
  }

  private itemEmoji(id: string): string {
    const emojiMap: Record<string, string> = {
      chicken:'🐔', cow:'🐄', sheep:'🐑',
      corn:'🌽', grape:'🍇', strawberry:'🍓', tomato:'🍅',
    };
    return emojiMap[id] ?? '🌱';
  }

  private bounceCoinHUD(): void {
    let animProgress = 0;
    const fn = (dt: number) => {
      animProgress = Math.min(animProgress + dt / 60 / 0.35, 1);
      const scale = 1 + 0.2 * Math.sin(animProgress * Math.PI);
      this.coinHUD.scale.set(scale);
      if (animProgress >= 1) { this.coinHUD.scale.set(1); this.pixiApp.ticker.remove(fn); }
    };
    this.pixiApp.ticker.add(fn);
  }

  private shakeCoinHUD(): void {
    const origX = this.coinHUD.x;
    let animProgress = 0;
    const fn = (dt: number) => {
      animProgress = Math.min(animProgress + dt / 60 / 0.3, 1);
      this.coinHUD.x = origX + Math.sin(animProgress * Math.PI * 5) * 6 * (1 - animProgress);
      if (animProgress >= 1) { this.coinHUD.x = origX; this.pixiApp.ticker.remove(fn); }
    };
    this.pixiApp.ticker.add(fn);
  }
}
