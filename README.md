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
- Moderator-only live tools for cruise mode, Gold Rush, merchant convoy events, and ending events.

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
- Left click during boarding: swing temporary cutlass

### iPad / Touch

- `SAIL`: sail forward
- `BACK`: reverse slowly
- `<` / `>`: turn
- `L` / `R`: fire left or right cannons
- Tap an enemy ship: lock target
- `LOCK`: lock target under touch/cursor
- `BOARD`: start boarding against the locked/hovered ship
- Tap during boarding with the cutlass equipped: swing

Boarding only starts when the defender ship is below 50% HP and close enough to grapple.

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

## Persistence Model

Only compact profile data is saved:

```lua
{
	gold = number,
	totalGoldEarned = number,
	merchantSinks = number,
	captures = number,
	equippedCosmetic = string,
	ownedCosmetics = { [cosmeticId] = true },
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
