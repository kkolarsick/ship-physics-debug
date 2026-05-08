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
- PC and iPad controls, including touch buttons and tap-to-lock targeting.
- Smooth follow camera for sailing, with normal character camera during boarding.
- NPC merchant route loop for the gold economy.
- Boarding gate: defender must be below 50% HP and within grapple range.
- Instanced boarding arena with defender crew NPCs.
- Capture semantics: winner receives a copied `ShipRecipe`; a fresh prize ship spawns at nearest port.
- DataStore persists `PlayerProfile` plus `ShipRecipe` only, not live part graphs.
- Addictive progression loop: merchant-sink milestones, capture rewards, gold spend goals, and persistent upgrades.
- Shop UI for gold cosmetics/upgrades plus Robux developer-product hooks.
- Purchasable mast flags: country flags, pirate flag, `67`, and `41`.
- Moderator-only live tools for cruise mode, Gold Rush, merchant convoy events, and ending events.
- PvP port control: hold a harbor capture zone or sink enemy players near a port to flip ownership.
- Rare Ghost Ship NPC: all-black, unkillable, one-shots ships, and removes 10% of a victim's gold.
- Eight distinct ports with larger islands, docks, towers, huts, palms, themed landmarks, and treasure-search spots.

Ports and territory control are intentionally out of scope for this MVP.

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

The project uses `default.project.json` to map:

- `src/shared` to `ReplicatedStorage.Shared`
- `src/server` to `ServerScriptService.PirateGameServer`
- `src/client` to `StarterPlayer.StarterPlayerScripts.PirateGameClient`

## Controls

### PC

- `W`: sail forward
- `S`: reverse slowly
- `A` / `D`: turn
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
- `L` / `R`: fire left or right cannons
- Tap an enemy ship: lock target
- `LOCK`: lock target under touch/cursor
- `BOARD`: start boarding against the locked/hovered ship
- `WALK`: toggle shore leave / captain mode
- Tap during boarding with the cutlass equipped: swing

Boarding only starts when the defender ship is below 50% HP and close enough to grapple.

Captain mode disables default avatar movement and drives the ship instead. Shore leave re-enables avatar controls so players can walk on islands and use treasure-search prompts.

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
- `Balance.IslandActivities`: treasure-search cooldown and reward range
- `Balance.Boarding`: grapple range, channel time, crew count, crew HP/damage, arena timeout
- `World.Ports`: prize ship spawn locations
- `World.MerchantRoutes`: merchant patrol routes
- `Moderation.ModeratorUserIds`: Roblox user ids allowed to run live events

Shop and microtransaction setup lives in:

```text
src/shared/ShopConfig.lua
```

Set each Robux product's `productId` after creating Developer Products in the Roblox Creator Dashboard. Leave the ids as `0` while testing without real purchases.

## Shop / Monetization

Gold shop items are server-validated through `ShopService`:

- Flags: Pirate, USA, United Kingdom, France, Spain, 67, 41
- Ship skins: Crimson Corsair, Royal Navy
- Upgrades: hull HP, cannon damage, sail speed, boarding crew

Robux products are configured as Developer Product hooks:

- Coin Pouch
- Treasure Chest
- Storm Sails bundle
- Cannon Upgrade Kit
- Sail Upgrade Kit

The client only prompts purchases or sends item ids. The server owns all grants, receipt processing, gold spending, upgrade levels, and cosmetic ownership.

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

## Persistence Model

Only compact profile data is saved:

```lua
{
	gold = number,
	totalGoldEarned = number,
	merchantSinks = number,
	captures = number,
	equippedCosmetic = string,
	equippedFlag = string,
	ownedCosmetics = { [cosmeticId] = true },
	ownedFlags = { [flagId] = true },
	activeShipIndex = number,
	ships = { ShipRecipe }
}
```

Live ship instances, procedural parts, constraints, cannonballs, NPCs, and arenas are never saved. On spawn, the server rebuilds the live model from the selected `ShipRecipe`.

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
