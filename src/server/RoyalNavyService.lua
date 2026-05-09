local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local RoyalNavyService = {}
RoyalNavyService.__index = RoyalNavyService

function RoyalNavyService.new(shipService, profileService, remotes)
	return setmetatable({
		shipService = shipService,
		profileService = profileService,
		remotes = remotes,
		active = {},
		lastAttack = {},
	}, RoyalNavyService)
end

function RoyalNavyService:recipe()
	local recipe = RecipeUtil.defaultRecipe()
	recipe.id = "royal_navy_frigate"
	recipe.displayName = "Royal Navy Frigate"
	recipe.design.hullColor = { r = 25, g = 62, b = 128 }
	recipe.design.sailColor = { r = 244, g = 244, b = 236 }
	recipe.design.trimColor = { r = 238, g = 204, b = 102 }
	recipe.flagId = "uk"
	recipe.upgrades.cannonSlots = 3
	recipe.upgrades.cannons = 2
	recipe.upgrades.speed = 2
	return recipe
end

function RoyalNavyService:start()
	self.shipService:onShipSunk(function(ship, attacker)
		if ship.isNavy then
			self.active[ship.id] = nil
			if attacker and attacker.owner then
				local gold = math.random(GameConfig.Balance.RoyalNavy.GoldMin, GameConfig.Balance.RoyalNavy.GoldMax)
				self.profileService:addGold(attacker.owner, gold)
				if math.random() <= GameConfig.Balance.RoyalNavy.CrewRewardChance then
					self.profileService:upgradeActiveShip(attacker.owner, "crew", 1, 5)
					self.remotes.Notify:FireClient(attacker.owner, ("Royal Navy defeated: +%d gold and a crew member joined."):format(gold))
				else
					self.remotes.Notify:FireClient(attacker.owner, ("Royal Navy defeated: +%d gold."):format(gold))
				end
				self.shipService:sendHUD(attacker.owner)
			end
		end
	end)

	task.spawn(function()
		while true do
			task.wait(GameConfig.Balance.RoyalNavy.SpawnInterval)
			if math.random() <= GameConfig.Balance.RoyalNavy.SpawnChance then
				self:spawn()
			end
		end
	end)

	task.spawn(function()
		while true do
			task.wait(0.5)
			for _, ship in pairs(self.active) do
				self:update(ship)
			end
		end
	end)
end

function RoyalNavyService:spawn()
	local angle = math.random() * math.pi * 2
	local position = Vector3.new(math.cos(angle) * 720, GameConfig.World.SpawnHeight, math.sin(angle) * 720)
	local ship = self.shipService:spawnNavyShip(self:recipe(), CFrame.new(position, Vector3.zero))
	self.active[ship.id] = ship
	self.remotes.Notify:FireAllClients("Royal Navy patrol sighted.")
end

function RoyalNavyService:nearestPlayerShip(ship)
	local nearest, best = nil, math.huge
	for _, player in ipairs(Players:GetPlayers()) do
		local target = self.shipService:getPlayerShip(player)
		if target and not target.model:GetAttribute("Sunk") then
			local distance = (target.root.Position - ship.root.Position).Magnitude
			if distance < best then
				nearest = target
				best = distance
			end
		end
	end
	return nearest, best
end

function RoyalNavyService:update(ship)
	if not ship.root.Parent or ship.model:GetAttribute("Sunk") then
		self.active[ship.id] = nil
		return
	end
	local target, distance = self:nearestPlayerShip(ship)
	if not target then
		ship.input.throttle = 0
		return
	end
	ship.aiTargetPosition = target.root.Position
	ship.input.throttle = 1
	ship.input.last = os.clock()
	if distance <= GameConfig.Balance.RoyalNavy.AttackRange and os.clock() - (self.lastAttack[ship.id] or 0) >= GameConfig.Balance.RoyalNavy.AttackCooldown then
		self.lastAttack[ship.id] = os.clock()
		self.shipService:damageShip(target, GameConfig.Balance.RoyalNavy.Damage, ship)
	end
end

return RoyalNavyService
