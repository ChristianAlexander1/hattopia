# Growtopia Mechanics Research Registry

Researched 2026-10-14 via public web sources. All art and code in this project
are original; only observable mechanics are reproduced.

## Confirmed mechanics (multiple sources)

| # | Mechanic | Observed behavior | Implementation | Confidence |
|---|----------|-------------------|----------------|------------|
| 1 | World size | 100 wide x 60 tall tiles; bottom 6 rows unbreakable bedrock | World 100x60, rows 54-59 bedrock, unbreakable | High |
| 2 | Side-view physics | Run, jump, gravity, tile collision, punch in facing direction | Accel-based controller, AABB vs tilemap | High |
| 3 | Punch-to-break | Punching damages blocks; blocks break after N hits; damage restores after ~5s idle | Per-tile damage, 5s restore timer | High |
| 4 | Drops | Breaking may drop the block, its seed, gems, or nothing | Weighted drops; gems scale with rarity | High |
| 5 | Seeds | Plant on empty tile directly above a solid block | Server validates support tile | High |
| 6 | Growth | Each seed has growTime; fruit count 1-4 when harvested | Server timestamps, stage from elapsed/growTime | High |
| 7 | Harvest | Punch mature tree; drops 1-4 fruit + ~21% chance of seed back | Implemented exactly | High |
| 8 | Splicing | Plant a different seed on a growing tree -> new hybrid tree, timer resets | Splice recipe table, validated server-side | High |
| 9 | World Lock | Placing a lock claims the world; owner controls access list; only owner+access may edit | Lock tile stores ownerId + access list; all edits server-checked | High |
| 10 | Chat | World-wide chat, player names shown | WS broadcast, sanitized, rate-limited | High |
| 11 | Item drops pickup | Walk over ground items to collect | Server magnet+collect radius | High |
| 12 | Trading | Two-player trade window, both confirm, atomic exchange | Server-side atomic swap, cancel on disconnect | Medium |

## Sources
- https://github.com/netroindonesia/growtopia/blob/HEAD/docs/08-game-systems.md (farming numbers: fruit 1-4, 21% seed return)
- https://growtopia.fandom.com/wiki/Seed (planting rule: empty space above a block)
- https://growtopia.fandom.com/wiki/Guide:Splicing (splice = two different seeds, incompatible pairs rejected)
- https://growtopia.fandom.com/wiki/Dropping (drop sources; negative-drop joke)
- https://www.growtopiagame.com/forums/forum/other/everything-else/206421-how-many-blocks-are-in-a-world (100x60, bedrock bottom 6)
- https://growtopia.fandom.com/wiki/Category:Locks (lock claims world, owner + access list)
- https://growtopia.fandom.com/wiki/Robotic_Lock (damage restores after 5s idle)

## Deliberate deviations (documented, not hidden)
- Grow times shortened (10 + rarity*5 s) for demo playability; real GT uses rarity-scaled hours.
- Guest sessions instead of GrowID accounts; no password auth in this build.
- No premium store; gems are score-only.
- Weather is cosmetic + synced (clear/rain cycle); no verified gameplay effects implemented.
- Character customization = color palettes (original system), not GT's clothing items.
- Single World Lock type (locks whole world); area locks deferred to backlog.
