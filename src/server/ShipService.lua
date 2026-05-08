local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local ShipService = {}
ShipService.__index = ShipService

function ShipService.new(shipFactory, worldService, profileService, remotes)
	return setmetatable({
		shipFactory = shipFactory,
		worldService = worldService,
		profileService = profileService,
		remotes = remotes,
		shipsByModel = {},
		shipsByPlayer = {},
		ships = {},
		onShipSunk = nil,
	}, ShipService)
end

function ShipService:register(ship)
	self.ships[ship.id] = ship
	self.shipsByModel[ship.model] = ship
	if ship.owner and not ship.isPrize then
		self.shipsByPlayer[ship.owner] = ship
	end
	return ship
end

function ShipService:spawnPlayerShip(player, recipe, cframe)
	local ship = self.shipFactory:createShip({
		name = player.Name .. "_Ship",
		owner = player,
		recipe = recipe,
		cframe = cframe or self.worldService:portSpawnCFrame(Vector3.zero),
		parent = self.worldService:getFolder("Ships"),
		teamKind = "Player",
	})
	self:register(ship)
	self:sendHUD(player)
	return ship
end

function ShipService:spawnPrizeShip(player, recipe, nearPosition)
	local ship = self.shipFactory:createShip({
		name = player.Name .. "_PrizeShip",
		owner = player,
		recipe = recipe,
		cframe = self.worldService:portSpawnCFrame(nearPosition),
		parent = self.worldService:getFolder("Ships"),
		teamKind = "Prize",
	})
	self:register(ship)
	self.remotes.Notify:FireClient(player, "Captured blueprint stolen. Prize ship spawned at nearest port.")
	return ship
end

function ShipService:spawnMerchant(name, recipe, cframe)
	local ship = self.shipFactory:createShip({
		name = name,
		recipe = recipe,
		cframe = cframe,
		parent = self.worldService:getFolder("Merchants"),
		teamKind = "Merchant",
		maxHP = GameConfig.Balance.Merchants.HP,
	})
	self:register(ship)
	return ship
end

function ShipService:getPlayerShip(player)
	return self.shipsByPlayer[player]
end

function ShipService:getShipFromModel(model)
	while model and not self.shipsByModel[model] do
		model = model.Parent
	end
	return model and self.shipsByModel[model] or nil
end

function ShipService:setInput(player, throttle, turn)
	local ship = self:getPlayerShip(player)
	if not ship or ship.model:GetAttribute("Sunk") then
		return
	end

	ship.input.throttle = math.clamp(tonumber(throttle) or 0, GameConfig.Input.MinThrottle, GameConfig.Input.MaxThrottle)
	ship.input.turn = math.clamp(tonumber(turn) or 0, -GameConfig.Input.MaxTurn, GameConfig.Input.MaxTurn)
	ship.input.last = os.clock()
end

function ShipService:setTarget(player, targetModel)
	local ship = self:getPlayerShip(player)
	local target = targetModel and self:getShipFromModel(targetModel)
	if not ship or not target or ship == target then
		if ship then
			ship.target = nil
		end
		return
	end

	if (ship.root.Position - target.root.Position).Magnitude <= GameConfig.Balance.Targeting.LockRange then
		ship.target = target
		self.remotes.ReticleUpdate:FireClient(player, target.model)
	end
end

function ShipService:damageShip(target, amount, attacker)
	if not target or target.model:GetAttribute("Sunk") then
		return
	end

	local hp = math.max(0, target.model:GetAttribute("HP") - amount)
	target.model:SetAttribute("HP", hp)
	if target.owner then
		self:sendHUD(target.owner)
	end
	if attacker and attacker.owner then
		self:sendHUD(attacker.owner)
	end

	if hp <= 0 then
		self:sinkShip(target, attacker)
	end
end

function ShipService:sinkShip(ship, attacker)
	if ship.model:GetAttribute("Sunk") then
		return
	end
	ship.model:SetAttribute("Sunk", true)
	ship.root.ShipBodyVelocity.Velocity = Vector3.zero
	ship.root.ShipBodyGyro.MaxTorque = Vector3.zero

	if ship.isMerchant and attacker and attacker.owner then
		self.profileService:addGold(attacker.owner, GameConfig.Balance.Merchants.GoldReward)
		self.remotes.Notify:FireClient(attacker.owner, ("Merchant sunk: +%d gold"):format(GameConfig.Balance.Merchants.GoldReward))
		self:sendHUD(attacker.owner)
	end

	if self.onShipSunk then
		self.onShipSunk(ship, attacker)
	end

	task.delay(GameConfig.Balance.Ship.SinkDelay, function()
		local sinkPosition = ship.root.Position
		if ship.model then
			ship.model:Destroy()
		end
		self.ships[ship.id] = nil
		self.shipsByModel[ship.model] = nil
		if ship.owner and self.shipsByPlayer[ship.owner] == ship then
			self.shipsByPlayer[ship.owner] = nil
			task.delay(GameConfig.Balance.Ship.RespawnDelay, function()
				if ship.owner.Parent then
					self:spawnPlayerShip(ship.owner, self.profileService:getActiveRecipe(ship.owner), self.worldService:portSpawnCFrame(sinkPosition))
				end
			end)
		end
	end)
end

function ShipService:sendHUD(player)
	local profile = self.profileService:get(player)
	local ship = self:getPlayerShip(player)
	self.remotes.HUDUpdate:FireClient(player, {
		gold = profile and profile.gold or 0,
		hp = ship and ship.model:GetAttribute("HP") or 0,
		maxHP = ship and ship.model:GetAttribute("MaxHP") or RecipeUtil.maxHP(RecipeUtil.defaultRecipe()),
		shipName = ship and ship.recipe.displayName or "No Ship",
	})
end

function ShipService:start()
	RunService.Heartbeat:Connect(function()
		local now = os.clock()
		for _, ship in pairs(self.ships) do
			if not ship.model:GetAttribute("Sunk") and ship.root.Parent then
				local root = ship.root
				local stale = now - ship.input.last > GameConfig.Balance.Ship.MaxInputAge
				local throttle = if stale then 0 else ship.input.throttle
				local turn = if stale then 0 else ship.input.turn
				local speed = ship.isMerchant and GameConfig.Balance.Merchants.Speed or RecipeUtil.maxSpeed(ship.recipe)

				local flatLook = Vector3.new(root.CFrame.LookVector.X, 0, root.CFrame.LookVector.Z)
				if flatLook.Magnitude < 0.01 then
					flatLook = Vector3.zAxis
				else
					flatLook = flatLook.Unit
				end

				root.ShipBodyVelocity.Velocity = flatLook * speed * throttle
				root.ShipBodyGyro.CFrame = root.CFrame * CFrame.Angles(0, -turn * 0.045, 0)
			end
		end
	end)
end

function ShipService:removePlayer(player)
	local ship = self.shipsByPlayer[player]
	if ship and ship.model then
		ship.model:Destroy()
		self.ships[ship.id] = nil
		self.shipsByModel[ship.model] = nil
	end
	self.shipsByPlayer[player] = nil
end

return ShipService
