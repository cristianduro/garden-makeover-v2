export type ItemCategory = 'crops' | 'animals';

export interface ItemData {
  readonly id:        string;
  readonly name:      string;
  readonly category:  ItemCategory;
  readonly zone:      'field' | 'fence';
  readonly nodeName:  string;
  readonly imageKey:  string;
  readonly soundKey?: string;
  readonly cost:      number;
  readonly animIdle?:   string;
  readonly animAction?: string;
  readonly scale:       number;
  /** Natural world-Y of feet when node sits at its GLB origin (measured in-browser) */
  readonly feetY:       number;
}

export const ItemCatalog: Record<ItemCategory, ItemData[]> = {
  crops: [
    { id:'corn',       name:'Corn',       category:'crops',  zone:'field', nodeName:'corn_1',       imageKey:'corn',       cost:40,  scale:0.9, feetY:0.1158 },
    { id:'grape',      name:'Grape',      category:'crops',  zone:'field', nodeName:'grape_1',      imageKey:'grape',      cost:50,  scale:1.0, feetY:0.0061 },
    { id:'strawberry', name:'Strawberry', category:'crops',  zone:'field', nodeName:'strawberry_1', imageKey:'strawberry', cost:35,  scale:1.0, feetY:0.0191 },
    { id:'tomato',     name:'Tomato',     category:'crops',  zone:'field', nodeName:'tomato_1',     imageKey:'tomato',     cost:35,  scale:1.0, feetY:0.1748 },
  ],
  animals: [
    { id:'chicken', name:'Chicken', category:'animals', zone:'fence', nodeName:'chicken_1', imageKey:'chicken',
      soundKey:'chicken', cost:80,  animIdle:'idle_chicken', animAction:'action_chicken', scale:1.0, feetY:0.0421 },
    { id:'cow',     name:'Cow',     category:'animals', zone:'fence', nodeName:'cow_1',     imageKey:'cow',
      soundKey:'cow',     cost:150, animIdle:'idle_cow',     animAction:'action_cow',     scale:0.65, feetY:0.0916 },
    { id:'sheep',   name:'Sheep',   category:'animals', zone:'fence', nodeName:'sheep_1',   imageKey:'sheep',
      soundKey:'sheep',   cost:100, animIdle:'idle_sheep',   animAction:'action_sheep',   scale:0.85, feetY:0.0727 },
  ],
};

export const SHEEP_FEET_Y = 0.0727; // for tutorial guide

export const AllItems = Object.values(ItemCatalog).flat();
