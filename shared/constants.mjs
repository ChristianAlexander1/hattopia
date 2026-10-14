// Shared constants: imported by both client and server (same values, no drift).
export const TILE = 32;
export const WORLD_W = 100;
export const WORLD_H = 60;
export const BEDROCK_ROWS = 6; // bottom rows are unbreakable bedrock

// Physics (px, seconds)
export const PHYS = {
  maxRun: 250,      // max horizontal speed px/s
  accel: 2200,      // ground acceleration
  airAccel: 1400,
  friction: 2600,   // ground deceleration when no input
  jumpVel: 640,
  gravity: 1900,
  maxFall: 950,
  coyote: 0.09,     // coyote time seconds
  jumpBuffer: 0.12,
};

// Interaction
export const PUNCH_RANGE = 5 * TILE; // max distance from player center to tile center (long-range punch)
export const PUNCH_COOLDOWN = 0.28;    // seconds between punches
export const DAMAGE_RESTORE_S = 5;    // block damage resets after 5s idle (researched)
export const PICKUP_MAGNET_R = 56;    // drops fly to player within this radius
export const PICKUP_COLLECT_R = 26;   // collected within this radius
export const TRADE_RANGE = 4.5 * TILE;

// Inventory
export const INV_SLOTS = 24;
export const MAX_STACK = 200;

// Chat
export const CHAT_MAX_LEN = 120;
export const CHAT_COOLDOWN_MS = 1500;

// Farming
export const SEED_RETURN_CHANCE = 0.21; // researched: 21% seed back on harvest
export const growTimeFor = (rarity) => 10 + rarity * 5; // seconds (demo-tuned)

// Weather: centralized preset table (weights must sum to 1). The server rolls
// new weather from this; the client mirrors the same preset names for VFX.
export const WEATHER_KINDS = [
  { kind: 'clear', w: 0.35 }, { kind: 'cloudy', w: 0.20 }, { kind: 'drizzle', w: 0.13 },
  { kind: 'rain', w: 0.12 }, { kind: 'heavy', w: 0.08 }, { kind: 'storm', w: 0.06 },
  { kind: 'fog', w: 0.03 }, { kind: 'snow', w: 0.03 },
];
export function rollWeatherKind(rand = Math.random()) {
  let acc = 0;
  for (const k of WEATHER_KINDS) { acc += k.w; if (rand < acc) return k.kind; }
  return 'clear';
}
