local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local GhostShipService = {}
GhostShipService.__index = GhostShipService

function GhostShipService.new(shipService, profileService, worldService, remotes)
	return setmetatable({
		shipService = shipService,
		profileService = profileService,
		worldService = worldService,
		remotes = remotes,
		activeGhost = nil,
	}, GhostShipService)
end

function GhostShipService:ghostRecipe()
	local recipe = RecipeUtil.defaultRecipe()
	recipe.id = "ghost_ship"
	recipe.displayName = "Ghost Ship"
	recipe.design.hullColor = { r = 0, g = 0, b = 0 }
	recipe.design.sailColor = { r = 5, g = 5, b = 8 }
	recipe.design.trimColor = { r = 0, g = 0, b = 0 }
	recipe.flagId = "pirate"
	recipe.upgrades.hull = 99
	recipe.upgrades.speed = 5
	recipe.upgrades.cannons = 99
	return recipe
end

function GhostShipService:start()
	task.spawn(function()
		while true do
			task.wait(GameConfig.Balance.GhostShip.SpawnInterval)
			if not self.activeGhost and math.random() <= GameConfig.Balance.GhostShip.SpawnChance then
				self:spawn()
			end
		end
	end)
end

function GhostShipService:spawn()
	local angle = math.random() * math.pi * 2
	local position = Vector3.new(math.cos(angle) * 760, GameConfig.World.SpawnHeight, math.sin(angle) * 760)
	local ship = self.shipService:spawnGhostShip(self:ghostRecipe(), CFrame.new(position, Vector3.zero))
	self.activeGhost = ship
	self.remotes.Notify:FireAllClients("The Ghost Ship has appeared. Run.")

	task.delay(GameConfig.Balance.GhostShip.ActiveSeconds, function()
		if self.activeGhost == ship then
			self:despawn()
		end
	end)

	task.spawn(function()
		while self.activeGhost == ship and ship.root.Parent and not ship.model:GetAttribute("Sunk") do
			task.wait(0.35)
			self:updateGhost(ship)
		end
	end)
end

function GhostShipService:despawn()
	if self.activeGhost and self.activeGhost.model then
		self.activeGhost.model:Destroy()
	end
	self.activeGhost = nil
end

function GhostShipService:nearestVictim(ship)
	local nearestShip = nil
	local best = math.huge
	for _, player in ipairs(Players:GetPlayers()) do
		local target = self.shipService:getPlayerShip(player)
		if target and not target.model:GetAttribute("Sunk") then
			local distance = (target.root.Position - ship.root.Position).Magnitude
			if distance < best then
				best = distance
				nearestShip = target
			end
		end
	end
	return nearestShip, best
end

function GhostShipService:updateGhost(ship)
	local target, distance = self:nearestVictim(ship)
	if not target then
		ship.input.throttle = 0
		return
	end

	local flat = Vector3.new(target.root.Position.X - ship.root.Position.X, 0, target.root.Position.Z - ship.root.Position.Z)
	if flat.Magnitude > 1 then
		ship.aiTargetPosition = target.root.Position
	end
	ship.input.throttle = 1
	ship.input.last = os.clock()

	if distance <= GameConfig.Balance.GhostShip.AttackRange then
		self:killTarget(target)
	end
end

function GhostShipService:killTarget(target)
	if target.model:GetAttribute("Sunk") then
		return
	end

	if target.owner then
		local lost = self.profileService:removeGoldPercent(target.owner, GameConfig.Balance.GhostShip.GoldLossPercent)
		self.remotes.Notify:FireClient(target.owner, ("Ghost Ship sank you: lost %d gold."):format(lost))
	end
	self.shipService:damageShip(target, target.model:GetAttribute("MaxHP"), self.activeGhost)
end

return GhostShipService
