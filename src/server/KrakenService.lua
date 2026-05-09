local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local KrakenService = {}
KrakenService.__index = KrakenService

function KrakenService.new(shipService, profileService, worldService, remotes)
	return setmetatable({
		shipService = shipService,
		profileService = profileService,
		worldService = worldService,
		remotes = remotes,
		active = {},
		lastAttack = {},
		nextId = 900000,
	}, KrakenService)
end

function KrakenService:start()
	self.shipService:onShipSunk(function(ship, attacker)
		if ship.isKraken then
			self.active[ship.id] = nil
			if attacker and attacker.owner then
				local gold = math.random(GameConfig.Balance.Kraken.GoldRewardMin, GameConfig.Balance.Kraken.GoldRewardMax)
				self.profileService:addGold(attacker.owner, gold)
				self.shipService:sendHUD(attacker.owner)
				self.remotes.Notify:FireClient(attacker.owner, ("Kraken defeated: +%d gold."):format(gold))
			end
		elseif attacker and attacker.isKraken and ship.owner then
			self.profileService:removeGoldPercent(ship.owner, 1)
			self.shipService:sendHUD(ship.owner)
			self.remotes.Notify:FireClient(ship.owner, "The Kraken dragged your ship under. All gold lost.")
		end
	end)

	task.spawn(function()
		while true do
			task.wait(GameConfig.Balance.Kraken.SpawnInterval)
			if math.random() <= GameConfig.Balance.Kraken.SpawnChance then
				self:spawn()
			end
		end
	end)

	task.spawn(function()
		while true do
			task.wait(0.5)
			for _, kraken in pairs(self.active) do
				self:update(kraken)
			end
		end
	end)
end

function KrakenService:createPart(parent, name, size, cframe, color, shape)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = Enum.Material.SmoothPlastic
	part.Shape = shape or Enum.PartType.Block
	part.CanCollide = false
	part.Massless = true
	part.Parent = parent
	return part
end

function KrakenService:weld(root, part)
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = root
	weld.Part1 = part
	weld.Parent = part
end

function KrakenService:spawn()
	for _, active in pairs(self.active) do
		if active.model.Parent and not active.model:GetAttribute("Sunk") then
			return
		end
	end

	self.nextId += 1
	local angle = math.random() * math.pi * 2
	local position = Vector3.new(math.cos(angle) * 640, GameConfig.World.SpawnHeight, math.sin(angle) * 640)
	local model = Instance.new("Model")
	model.Name = "Kraken"
	model:SetAttribute("ShipId", self.nextId)
	model:SetAttribute("TeamKind", "Kraken")
	model:SetAttribute("MaxHP", GameConfig.Balance.Kraken.HP)
	model:SetAttribute("HP", GameConfig.Balance.Kraken.HP)
	model:SetAttribute("Sunk", false)
	model.Parent = self.worldService:getFolder("Krakens")

	local root = self:createPart(model, "Root", Vector3.new(22, 16, 22), CFrame.new(position), Color3.fromRGB(34, 16, 42), Enum.PartType.Ball)
	root.Massless = false
	model.PrimaryPart = root

	local crown = self:createPart(model, "Crown", Vector3.new(15, 8, 15), root.CFrame * CFrame.new(0, 9, 0), Color3.fromRGB(62, 29, 76), Enum.PartType.Ball)
	self:weld(root, crown)

	for index = 1, 8 do
		local theta = math.rad(index * 45)
		local offset = Vector3.new(math.cos(theta) * 18, -2, math.sin(theta) * 18)
		local tentacle = self:createPart(
			model,
			"Tentacle",
			Vector3.new(7, 7, 38),
			CFrame.new(position + offset, position + offset + Vector3.new(math.cos(theta), 0.2, math.sin(theta))) * CFrame.Angles(math.rad(78), 0, 0),
			Color3.fromRGB(47, 20, 58),
			Enum.PartType.Cylinder
		)
		self:weld(root, tentacle)
	end

	local bodyVelocity = Instance.new("BodyVelocity")
	bodyVelocity.Name = "ShipBodyVelocity"
	bodyVelocity.MaxForce = Vector3.new(GameConfig.Balance.Ship.LinearForce, GameConfig.Balance.Ship.LinearForce, GameConfig.Balance.Ship.LinearForce)
	bodyVelocity.Velocity = Vector3.zero
	bodyVelocity.Parent = root

	local bodyGyro = Instance.new("BodyGyro")
	bodyGyro.Name = "ShipBodyGyro"
	bodyGyro.MaxTorque = Vector3.new(0, GameConfig.Balance.Ship.TurnTorque, 0)
	bodyGyro.P = 4500
	bodyGyro.D = 500
	bodyGyro.CFrame = root.CFrame
	bodyGyro.Parent = root

	local ship = {
		id = self.nextId,
		model = model,
		root = root,
		owner = nil,
		recipe = RecipeUtil.defaultRecipe(),
		input = {
			throttle = 0,
			turn = 0,
			last = os.clock(),
		},
		lastFire = 0,
		isKraken = true,
		spawnedAt = os.clock(),
	}

	self.shipService:register(ship)
	self.active[ship.id] = ship
	self.remotes.Notify:FireAllClients("The Kraken rises from the deep.")
end

function KrakenService:nearestPlayerShip(kraken)
	local nearest, best = nil, math.huge
	for _, player in ipairs(Players:GetPlayers()) do
		local target = self.shipService:getPlayerShip(player)
		if target and not target.model:GetAttribute("Sunk") then
			local distance = (target.root.Position - kraken.root.Position).Magnitude
			if distance < best then
				nearest = target
				best = distance
			end
		end
	end
	return nearest, best
end

function KrakenService:update(kraken)
	if not kraken.root.Parent or kraken.model:GetAttribute("Sunk") then
		self.active[kraken.id] = nil
		return
	end

	if os.clock() - kraken.spawnedAt > GameConfig.Balance.Kraken.ActiveSeconds then
		self.active[kraken.id] = nil
		kraken.model:Destroy()
		self.shipService.ships[kraken.id] = nil
		self.shipService.shipsByModel[kraken.model] = nil
		self.remotes.Notify:FireAllClients("The Kraken sinks back beneath the waves.")
		return
	end

	local target, distance = self:nearestPlayerShip(kraken)
	if not target then
		kraken.input.throttle = 0
		return
	end

	kraken.aiTargetPosition = target.root.Position
	kraken.input.throttle = 1
	kraken.input.last = os.clock()

	if distance <= GameConfig.Balance.Kraken.AttackRange and os.clock() - (self.lastAttack[kraken.id] or 0) >= GameConfig.Balance.Kraken.AttackCooldown then
		self.lastAttack[kraken.id] = os.clock()
		self.shipService:damageShip(target, GameConfig.Balance.Kraken.Damage, kraken)
	end
end

return KrakenService
