# Pirate Ship PvP MVP

Server-authoritative Roblox naval combat prototype with merchant ships, boarding, and blueprint capture.

## What Is Implemented

- Rojo project scaffold with clear `shared`, `server`, and `client` boundaries.
- Server-owned ship physics using `BodyVelocity` and `BodyGyro`.
- Client sends ship input only; server clamps throttle/turn and replicates motion.
- Procedural ships are rebuilt from compact `ShipRecipe` data.
- Cannon combat with pooled cannonballs, server-side hit validation, HP, sinking, and merchant gold rewards.
- Target lock, reticle, and HUD for gold/HP.
- NPC merchant route loop for the gold economy.
- Boarding gate: defender must be below 50% HP and within grapple range.
- Instanced boarding arena with defender crew NPCs.
- Capture semantics: winner receives a copied `ShipRecipe`; a fresh prize ship spawns at nearest port.
- DataStore persists `PlayerProfile` plus `ShipRecipe` only, not live part graphs.

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

- `W`: sail forward
- `S`: reverse slowly
- `A` / `D`: turn
- `Q`: fire left cannons
- `E`: fire right cannons
- `T`: lock target under mouse
- `B`: board locked/hovered target
- Left click during boarding: swing temporary cutlass

Boarding only starts when the defender ship is below 50% HP and close enough to grapple.

## Tuning

All main balance knobs live in:

```text
src/shared/GameConfig.lua
```

Useful sections:

- `Balance.Ship`: HP, speed, force, turning, respawn/sink timing
- `Balance.Cannons`: cooldown, damage, projectile speed, range, pool size
- `Balance.Merchants`: NPC count, speed, HP, reward, respawn timing
- `Balance.Boarding`: grapple range, channel time, crew count, crew HP/damage, arena timeout
- `World.Ports`: prize ship spawn locations
- `World.MerchantRoutes`: merchant patrol routes

## Persistence Model

Only compact profile data is saved:

```lua
{
	gold = number,
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
