// Static game data. Systems read from here; nothing in this file holds mutable state.

export const TILE_W = 64;
export const TILE_H = 32;
export const DEFAULT_MAP_SIZE = 12;
export const SAVE_VERSION = 1;
export const DAY_LENGTH_SECONDS = 300; // one full day/night cycle
export const SIM_STEP = 0.25; // fixed simulation tick, in seconds

export const PALETTE = {
  grass: '#a8d5a2',
  water: '#7ec8e3',
  road: '#d6d0c4',
  peach: '#ffb5a7',
  blush: '#fcd5ce',
  mint: '#b8e0d2',
  lavender: '#cdb4db',
  sidewalk: '#ece7dd',
  sand: '#efe3c8',
  earth: '#d2b89c',
  earthDark: '#b09379',
  leaf: '#93cf98',
  leafLight: '#b9e4ab',
  leafDeep: '#76b585',
  blossom: '#f7c6cf',
  blossomLight: '#fde0e5',
  trunk: '#b99679',
  parkGrass: '#b9e2ad',
  path: '#efe6d6',
  stone: '#f1ece4',
  glass: '#e5eff5',
  windowLit: '#ffe29a',
  pole: '#9d97b6',
  lampOff: '#efe9f6',
  lampOn: '#fff4c9',
  marking: '#fbf8f2',
};

export const BUILDING_VARIANTS = {
  peach: { wall: PALETTE.peach, roof: '#e9968c', trim: '#fff1ec' },
  blush: { wall: PALETTE.blush, roof: '#e6a79e', trim: '#fff7f4' },
  mint: { wall: PALETTE.mint, roof: '#8ec3af', trim: '#f2fbf7' },
  lavender: { wall: PALETTE.lavender, roof: '#a991c4', trim: '#f8f2fb' },
};
export const VARIANT_KEYS = Object.keys(BUILDING_VARIANTS);

// Structure definitions. `capacity` > 0 makes a structure housing; `greenery` feeds desirability.
// Future per-structure data (jobs, upkeep, power draw, pollution, …) belongs here.
export const STRUCTURES = {
  house: { label: 'House', capacity: 4, greenery: 0, height: 27 },
  tower: { label: 'Tower', capacity: 16, greenery: 0, height: 70 },
  tree: { label: 'Tree', capacity: 0, greenery: 1, walkable: true, height: 26 },
  park: { label: 'Park', capacity: 0, greenery: 3, walkable: true, height: 0 },
  road: { label: 'Road', capacity: 0, greenery: 0, walkable: true, road: true, height: 0 },
};

export const TOOLS = [
  { id: 'house', label: 'House', key: '1' },
  { id: 'tower', label: 'Tower', key: '2' },
  { id: 'tree', label: 'Tree', key: '3' },
  { id: 'park', label: 'Park', key: '4' },
  { id: 'road', label: 'Road', key: '5' },
  { id: 'water', label: 'Water', key: '6' },
  { id: 'bulldoze', label: 'Bulldoze', key: '7' },
];

export const CAR_COLORS = ['#ff9f8f', '#8fd0bd', '#b49ad1', '#ffd98f', '#9cc4ea', '#f7f3ea', '#f6a9c0'];
export const SHIRT_COLORS = ['#ff8f7e', '#7fc4ad', '#a98bd0', '#ffcf6e', '#86b5e6', '#f49ab8', '#ffffff'];
export const SKIN_TONES = ['#f6d5bd', '#e8b896', '#c98e6a', '#8d5a3f', '#f1c7a5'];
