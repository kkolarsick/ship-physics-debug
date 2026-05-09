# Pirate Ship PvP MVP

Server-authoritative Roblox naval combat prototype with merchant ships, boarding, and blueprint capture.

## What Is Implemented

- Rojo project scaffold with clear `shared`, `server`, and `client` boundaries.
- Server-owned ship physics using `BodyVelocity` and `BodyGyro`.
- Client sends ship input only; server clamps throttle/turn and replicates motion.
- Procedural ships are rebuilt from compact `ShipRecipe` data.
- Upgraded procedural ship visuals: rails, stern cabins, rigging, lanterns, figureheads, wake foam, and warmer materials.
- World polish: ocean plane, foam strips, harbor towers, beacon lights, atmosphere, bloom, and sun rays.
- Cannon combat with pooled cannonballs, server-side hit validation, HP, sinking, and merchant gold rewards.
- Cannon feedback: muzzle flashes and hit bursts replicate to all clients.
- Target lock, reticle, and HUD for gold/HP.
- Polished Roblox-style HUD with animated HP bar, rich panels, smoother notices, and grouped trading-post UI.
- PC and iPad controls, including polished touch buttons and tap-to-lock targeting.
- Smooth player-controlled follow camera for sailing, with normal character camera during boarding.
- NPC merchant route loop for the gold economy.
- Boarding gate: defender must be below 50% HP and within grapple range.
- Instanced boarding arena with defender crew NPCs.
- Capture semantics: winner receives a copied `ShipRecipe`; a fresh prize ship spawns at nearest port.
- DataStore persists `PlayerProfile` plus `ShipRecipe` only, not live part graphs, with autosave, leave-save, shutdown-save, retries, and failed-load overwrite protection.
- Addictive progression loop: merchant-sink milestones, capture rewards, gold spend goals, and persistent upgrades.
- Shop UI for gold cosmetics/upgrades plus Robux developer-product hooks.
- Store access is now a physical trading post on each island, not a global button.
- New players start with `0` gold; gold must be earned through trials, treasure, merchants, PvP, or configured products.
- Purchasable mast flags: country flags, pirate flag, `67`, and `41`.
- Purchasable pirate gear: cutlass and flintlock pistol, both no-blood.
- Upgrade loop: buy more cannon pairs, stronger cannons, faster sails, and hired crew with escalating costs.
- Ship class ladder: ten increasingly expensive ship classes with better HP, speed, cannon damage, size, and cannon slots.
- Moderator-only live tools for cruise mode, Gold Rush, merchant convoy events, and ending events.
- PvP port control: hold a harbor capture zone or sink enemy players near a port to flip ownership.
- Rare Ghost Ship NPC: all-black, unkillable, one-shots ships, and removes 10% of a victim's gold.
- Eight distinct ports with larger islands, docks, towers, huts, palms, themed landmarks, and treasure-search spots.
- Marine outposts at sea with watch towers, docks, beacon lights, and cannon silhouettes.
- Royal Navy patrol encounters that hunt players; defeating one grants random gold and may add a crew member.
- Rare Kraken encounter that attacks player ships; defeating it pays a large gold reward, but losing to it wipes current gold.

Ports, island activities, sea outposts, and world threats are included as MVP gameplay layers around the core naval loop.

## Studio Setup

1. Install Rojo.
2. Open this folder in a terminal.
3. Run:

```powershell
rojo serve
```

4. Open Roblox Studio.
5. Install/open the Rojo Studio plugin.
6. Connect to the local Rojo server.
7. Press Play with at least one test player.

For DataStore testing in Studio, publish the place and enable API Services in Game Settings. Without that, the fallback profile still lets you test the live loop, but saves may fail in Studio.

Player data saves through Roblox DataStore on autosave, player leave, and server shutdown. If a DataStore load fails, the player gets a temporary session profile, but that session is not written back over their real saved data.

The project uses `default.project.json` to map:

- `src/shared` to `ReplicatedStorage.Shared`
- `src/server` to `ServerScriptService.PirateGameServer`
- `src/client` to `StarterPlayer.StarterPlayerScripts.PirateGameClient`

## Controls

### PC

- `W`: sail forward
- `S`: reverse slowly
- `A` / `D`: turn
- Hold right mouse and drag: orbit the ship camera
- `Q`: fire left cannons
- `E`: fire right cannons
- `T`: lock target under mouse
- `B`: board locked/hovered target
- `X`: toggle shore leave / captain mode
- Left click during boarding: swing temporary cutlass

### iPad / Touch

- `SAIL`: sail forward
- `BACK`: reverse slowly
- `<` / `>`: turn
- Swipe while sailing: orbit the ship camera
- `L` / `R`: fire left or right cannons
- Tap an enemy ship: lock target
- `LOCK`: lock target under touch/cursor
- `BOARD`: start boarding against the locked/hovered ship
- `WALK`: toggle shore leave / captain mode
- Tap during boarding with the cutlass equipped: swing

Boarding only starts when the defender ship is below 50% HP and close enough to grapple.

Captain mode disables default avatar movement and drives the ship instead. Shore leave re-enables avatar controls so players can walk on islands, use treasure-search prompts, duel other pirates, and visit trading posts.

## Tuning

All main balance knobs live in:

```text
src/shared/GameConfig.lua
```

Useful sections:

- `Balance.Ship`: HP, speed, force, turning, respawn/sink timing
- `Balance.Progression`: merchant milestones and capture rewards
- `Balance.Camera`: follow distance, height, look-ahead, smoothing
- `Balance.Cannons`: cooldown, damage, projectile speed, range, pool size
- `Balance.Merchants`: NPC count, speed, HP, reward, respawn timing
- `Balance.PortControl`: capture radius/time and PvP port rewards
- `Balance.GhostShip`: rare spawn rate, lifetime, speed, attack range, gold-loss percent
- `Balance.RoyalNavy`: patrol spawn rate, HP, speed, attack damage, gold rewards, crew reward chance
- `Balance.Kraken`: spawn rate, HP, speed, attack damage, lifetime, victory reward
- `Balance.IslandActivities`: treasure-search cooldown and reward range
- `Balance.Boarding`: grapple range, channel time, crew count, crew HP/damage, arena timeout
- `World.Ports`: prize ship spawn locations
- `World.MarineOutposts`: sea outpost locations
- `World.MerchantRoutes`: merchant patrol routes
- `Moderation.ModeratorUserIds`: Roblox user ids allowed to run live events
- `ShopConfig.ShipClasses`: ship class prices, sizes, cannon slots, and class stat bonuses

Shop and microtransaction setup lives in:

```text
src/shared/ShopConfig.lua
```

Set each Robux product's `productId` after creating Developer Products in the Roblox Creator Dashboard. Leave the ids as `0` while testing without real purchases.

## Shop / Monetization

Gold shop items are server-validated through `ShopService`. Players open the store at physical `TradingPost` prompts on islands.

- Gear: Cutlass, Flintlock Pistol
- Flags: Pirate, USA, United Kingdom, France, Spain, 67, 41
- Ship skins: Crimson Corsair, Royal Navy
- Ship classes: Skiff, Schooner, War Cutter, Brigantine, Corsair Corvette, Battle Frigate, Treasure Galleon, Man-of-War, Dread Corsair, Pirate Lord Flagship
- Upgrades: hull HP, cannon damage, cannon pairs per side, sail speed, hired cannon crew

New profiles start with zero gold. Product gold can exist for trial/testing/live monetization, but the default progression assumes gold is earned.

## Island PvP And Villagers

When players toggle shore leave, they can use bought gear on islands:

- Cutlass: close-range duel weapon
- Flintlock Pistol: short-cooldown ranged sidearm
- Player-vs-player gear damage only works when both players are on shore leave
- No blood effects are used

Villagers are neutral NPCs on islands. Attacking them causes return fire and player damage.

Robux products are configured as Developer Product hooks:

- Coin Pouch
- Treasure Chest

The client only prompts purchases or sends item ids. The server owns all grants, receipt processing, gold spending, upgrade levels, and cosmetic ownership.

## Ship Classes

Trading posts sell ten ship classes. Each class is a compact `ShipRecipe` with stronger class bonuses for HP, speed, and cannon damage. Higher tiers also become physically larger and unlock more cannon slots up to six per side.

Buying a class adds that recipe to the player's saved fleet and immediately launches it. Buying an already owned class launches it again for free. Prices climb sharply so players must earn gold through merchants, treasure, PvP, Navy patrols, captures, or boss fights.

## Moderator Events

Add moderator Roblox user ids in `GameConfig.Moderation.ModeratorUserIds`.

Moderators get a `MOD` panel in-game:

- `Toggle Cruise Ship`: fast, high-HP moderator cruise mode
- `Start Gold Rush`: doubles merchant gold rewards during the live event
- `Spawn Merchant Convoy`: adds extra merchant ships for players to chase
- `End Event`: clears the current live event

These tools are server-gated; non-moderators cannot activate them by firing remotes.

## PvP Port Control

Ports now have capture zones visible as harbor rings. A single player ship holding a port zone long enough captures that port and earns gold. Sinking another player near a port also flips that port to the attacker and grants a PvP reward.

This gives flags and ship identity a gameplay surface: players can sail under a chosen flag, contest harbors, and create visible rivalries around port ownership.

## Islands

Each port has a larger themed island built procedurally in `WorldService`:

- Docks placed beside water spawn lanes
- Sand and grass island layers
- Harbor towers, huts, palms, and themed landmarks
- Treasure-search spots with `ProximityPrompt` rewards

Use `X` on PC or `WALK` on touch to leave captain mode, walk around, and search for treasure.

## Ghost Ship

The Ghost Ship is a rare world threat:

- Spawns from the edge of the map on a timer with a low chance.
- Uses an all-black ship recipe with spectral trim.
- Ignores damage, making it effectively unbeatable.
- Hunts the nearest player ship.
- One-shots ships within range.
- If it sinks a player, that player loses 10% of current gold.

Tune how punishing and frequent it is in `Balance.GhostShip`.

## Royal Navy And Kraken

Royal Navy patrols appear randomly at sea and focus the nearest player ship. They can be defeated with normal cannon fire. The winning attacker earns a random gold reward and has a chance to gain one crew level.

The Kraken is a rare boss threat. It chases the nearest player ship, damages ships directly, and can be killed by cannon fire. Defeating it grants a large random gold reward. If the Kraken sinks a player, that player loses all current gold.

## Persistence Model

Only compact profile data is saved:

```lua
{
	profileVersion = number,
	createdAt = number,
	lastSaveUnix = number,
	gold = number,
	totalGoldEarned = number,
	merchantSinks = number,
	captures = number,
	equippedCosmetic = string,
	equippedFlag = string,
	ownedCosmetics = { [cosmeticId] = true },
	ownedFlags = { [flagId] = true },
	ownedGear = { [gearId] = true },
	ownedShipClasses = { [classId] = true },
	activeShipIndex = number,
	ships = { ShipRecipe }
}
```

Live ship instances, procedural parts, constraints, cannonballs, NPCs, and arenas are never saved. On spawn, the server rebuilds the live model from the selected `ShipRecipe`.

Saves run in `ProfileService`:

- `load(player)`: loads and migrates profile data.
- `startAutosave()`: saves dirty profiles every `GameConfig.DataStore.SaveInterval` seconds.
- `release(player)`: saves when a player leaves.
- `BindToClose`: saves all loaded players during server shutdown.

Tune retry behavior in `GameConfig.DataStore`.

## Capture Rule

Capturing never transfers the defender's live ship instance.

When boarding succeeds:

1. The server deep-copies the defender `ShipRecipe`.
2. The copied recipe is renamed as a prize.
3. The recipe is appended to the winner profile.
4. A fresh `PrizeShip` is spawned at the nearest port from that recipe.

## Main Files

- `src/server/Main.server.lua`: service bootstrap and player lifecycle
- `src/server/ShipService.lua`: authoritative ship state, input, HP, sinking
- `src/server/ShipFactory.lua`: procedural ship assembly from recipes
- `src/server/CannonService.lua`: cannonball pool, fire validation, hit damage
- `src/server/MerchantService.lua`: simple merchant route AI
- `src/server/BoardingService.lua`: grapple channel and arena resolution
- `src/server/CaptureService.lua`: recipe-copy capture behavior
- `src/server/ProfileService.lua`: DataStore-backed profile and recipes
- `src/client/ClientController.client.lua`: input, target lock, reticle, HUD
- `src/shared/GameConfig.lua`: all tuning values
- `src/shared/RecipeUtil.lua`: recipe helpers
- `src/shared/Net.lua`: RemoteEvent creation/access
