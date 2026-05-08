local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local CannonService = {}
CannonService.__index = CannonService

function CannonService.new(shipService, worldService, remotes)
	return setmetatable({
		shipService = shipService,
		worldService = worldService,
		remotes = remotes,
		pool = {},
		ballConnections = {},
		nextPoolIndex = 1,
		hitTimes = {},
	}, CannonService)
end

function CannonService:buildPool()
	local folder = self.worldService:getFolder("Cannonballs")
	for index = 1, GameConfig.Balance.Cannons.PoolSize do
		local ball = Instance.new("Part")
		ball.Name = "Cannonball_" .. index
		ball.Shape = Enum.PartType.Ball
		ball.Size = Vector3.new(1.4, 1.4, 1.4)
		ball.Material = Enum.Material.Metal
		ball.Color = Color3.fromRGB(20, 20, 22)
		ball.CanCollide = false
		ball.Anchored = true
		ball.Transparency = 1
		ball.Parent = folder
		table.insert(self.pool, ball)
	end
end

function CannonService:nextBall()
	local ball = self.pool[self.nextPoolIndex]
	self.nextPoolIndex = (self.nextPoolIndex % #self.pool) + 1
	if self.ballConnections[ball] then
		self.ballConnections[ball]:Disconnect()
		self.ballConnections[ball] = nil
	end
	return ball
end

function CannonService:fire(player, side)
	local ship = self.shipService:getPlayerShip(player)
	if not ship or ship.model:GetAttribute("Sunk") then
		return
	end

	local now = os.clock()
	if now - ship.lastFire < GameConfig.Balance.Cannons.Cooldown then
		return
	end
	ship.lastFire = now

	side = if side == "left" then -1 else 1
	local root = ship.root
	local right = root.CFrame.RightVector * side
	local damage = RecipeUtil.cannonDamage(ship.recipe)

	for _, z in ipairs(GameConfig.Balance.Cannons.SpawnForwardOffsets) do
		local origin = root.Position + root.CFrame.LookVector * z + root.CFrame.RightVector * side * GameConfig.Balance.Cannons.SpawnSideOffset + Vector3.new(0, 3, 0)
		self.remotes.CannonFX:FireAllClients(origin, right.Unit)
		self:spawnProjectile(ship, origin, right.Unit, damage)
	end
end

function CannonService:spawnProjectile(attacker, origin, direction, damage)
	local ball = self:nextBall()
	ball.Anchored = false
	ball.Transparency = 0
	ball.CFrame = CFrame.new(origin)
	ball.AssemblyLinearVelocity = direction * GameConfig.Balance.Cannons.BallSpeed
	ball:SetNetworkOwner(nil)

	local touched
	touched = ball.Touched:Connect(function(hit)
		local target = self.shipService:getShipFromModel(hit)
		if not target or target == attacker or target.model:GetAttribute("Sunk") then
			return
		end

		if (origin - target.root.Position).Magnitude > GameConfig.Balance.Cannons.Range then
			return
		end

		local key = ("%d:%d"):format(attacker.id, target.id)
		local lastHit = self.hitTimes[key] or 0
		if os.clock() - lastHit < GameConfig.Balance.Cannons.HitDebounce then
			return
		end
		self.hitTimes[key] = os.clock()

		if touched then
			touched:Disconnect()
			self.ballConnections[ball] = nil
		end
		ball.Transparency = 1
		ball.Anchored = true
		ball.AssemblyLinearVelocity = Vector3.zero
		self.remotes.HitFX:FireAllClients(ball.Position)
		self.shipService:damageShip(target, damage, attacker)
	end)
	self.ballConnections[ball] = touched

	task.delay(GameConfig.Balance.Cannons.BallLifetime, function()
		if touched then
			touched:Disconnect()
			self.ballConnections[ball] = nil
		end
		if ball.Parent then
			ball.Transparency = 1
			ball.Anchored = true
			ball.AssemblyLinearVelocity = Vector3.zero
			ball.Parent = self.worldService:getFolder("Cannonballs")
		end
	end)
end

function CannonService:start()
	self:buildPool()
	self.remotes.FireCannons.OnServerEvent:Connect(function(player, side)
		self:fire(player, side)
	end)
end

return CannonService
