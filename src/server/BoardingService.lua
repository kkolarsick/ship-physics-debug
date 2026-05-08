local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local BoardingService = {}
BoardingService.__index = BoardingService

function BoardingService.new(shipService, captureService, worldService, remotes)
	return setmetatable({
		shipService = shipService,
		captureService = captureService,
		worldService = worldService,
		remotes = remotes,
		active = {},
		nextArena = 0,
	}, BoardingService)
end

function BoardingService:start()
	self.remotes.BoardRequest.OnServerEvent:Connect(function(player, targetModel)
		self:requestBoard(player, targetModel)
	end)
end

function BoardingService:requestBoard(attackerPlayer, targetModel)
	local attackerShip = self.shipService:getPlayerShip(attackerPlayer)
	local defenderShip = targetModel and self.shipService:getShipFromModel(targetModel)
	if not attackerShip or not defenderShip or attackerShip == defenderShip then
		return
	end
	if defenderShip.isMerchant then
		self.remotes.Notify:FireClient(attackerPlayer, "Merchants surrender gold when sunk. Board player ships for blueprints.")
		return
	end
	if self.active[attackerPlayer] or defenderShip.model:GetAttribute("BoardingLocked") then
		return
	end

	local defenderHP = defenderShip.model:GetAttribute("HP")
	local defenderMax = defenderShip.model:GetAttribute("MaxHP")
	if defenderHP / defenderMax > GameConfig.Balance.Boarding.DefenderHpPercentThreshold then
		self.remotes.Notify:FireClient(attackerPlayer, "Weaken the target below 50% HP before boarding.")
		return
	end
	if (attackerShip.root.Position - defenderShip.root.Position).Magnitude > GameConfig.Balance.Boarding.GrappleRange then
		self.remotes.Notify:FireClient(attackerPlayer, "Move closer to grapple.")
		return
	end

	self.active[attackerPlayer] = true
	defenderShip.model:SetAttribute("BoardingLocked", true)
	self.remotes.BoardingState:FireClient(attackerPlayer, "channel", GameConfig.Balance.Boarding.ChannelSeconds)

	task.delay(GameConfig.Balance.Boarding.ChannelSeconds, function()
		if not attackerPlayer.Parent or defenderShip.model:GetAttribute("Sunk") then
			self.active[attackerPlayer] = nil
			defenderShip.model:SetAttribute("BoardingLocked", false)
			return
		end
		self:runArena(attackerPlayer, attackerShip, defenderShip)
	end)
end

function BoardingService:runArena(attackerPlayer, attackerShip, defenderShip)
	self.nextArena += 1
	local arena = Instance.new("Model")
	arena.Name = "BoardingArena_" .. self.nextArena
	arena.Parent = self.worldService:getFolder("BoardingArenas")

	local origin = Vector3.new(self.nextArena * GameConfig.Balance.Boarding.ArenaSpacing, 160, 0)
	local floor = Instance.new("Part")
	floor.Name = "ArenaFloor"
	floor.Anchored = true
	floor.Size = Vector3.new(90, 2, 90)
	floor.Position = origin
	floor.Color = Color3.fromRGB(92, 61, 38)
	floor.Material = Enum.Material.WoodPlanks
	floor.Parent = arena

	local character = attackerPlayer.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root then
		self:finish(attackerPlayer, defenderShip, arena, false)
		return
	end

	root.CFrame = CFrame.new(origin + Vector3.new(0, 6, 28))
	humanoid.Health = math.min(humanoid.MaxHealth, GameConfig.Balance.Boarding.PlayerArenaHP)
	self.remotes.BoardingState:FireClient(attackerPlayer, "fight", GameConfig.Balance.Boarding.ResolveTimeout)

	local crewLeft = RecipeUtil.crewCount(defenderShip.recipe)
	local crew = {}
	for index = 1, crewLeft do
		local npc = self:createCrewNPC(arena, origin + Vector3.new((index - crewLeft / 2) * 7, 5, -20))
		table.insert(crew, npc)
	end
	self:giveBoardingCutlass(attackerPlayer, crew)

	local finished = false
	local function resolve(won)
		if finished then
			return
		end
		finished = true
		self:finish(attackerPlayer, defenderShip, arena, won)
	end

	for _, npc in ipairs(crew) do
		task.spawn(function()
			self:crewBrain(npc, attackerPlayer, function()
				crewLeft -= 1
				if crewLeft <= 0 then
					resolve(true)
				end
			end)
		end)
	end

	local diedConnection
	diedConnection = humanoid.Died:Connect(function()
		if diedConnection then
			diedConnection:Disconnect()
		end
		resolve(false)
	end)

	task.delay(GameConfig.Balance.Boarding.ResolveTimeout, function()
		resolve(false)
	end)
end

function BoardingService:createCrewNPC(parent, position)
	local model = Instance.new("Model")
	model.Name = "DefenderCrew"
	model.Parent = parent

	local body = Instance.new("Part")
	body.Name = "HumanoidRootPart"
	body.Size = Vector3.new(2, 4, 1)
	body.Position = position
	body.Color = Color3.fromRGB(150, 40, 38)
	body.Parent = model

	local humanoid = Instance.new("Humanoid")
	humanoid.MaxHealth = GameConfig.Balance.Boarding.CrewHP
	humanoid.Health = humanoid.MaxHealth
	humanoid.WalkSpeed = 13
	humanoid.Parent = model

	model.PrimaryPart = body
	return model
end

function BoardingService:giveBoardingCutlass(player, crew)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then
		return
	end

	local oldTool = backpack:FindFirstChild("Boarding Cutlass")
	if oldTool then
		oldTool:Destroy()
	end

	local tool = Instance.new("Tool")
	tool.Name = "Boarding Cutlass"
	tool.RequiresHandle = true
	tool.CanBeDropped = false

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.4, 4, 0.4)
	handle.Color = Color3.fromRGB(190, 190, 195)
	handle.Material = Enum.Material.Metal
	handle.Parent = tool

	local lastSwing = 0
	tool.Activated:Connect(function()
		if os.clock() - lastSwing < 0.55 then
			return
		end
		lastSwing = os.clock()

		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if not root then
			return
		end

		local nearestHumanoid = nil
		local nearestDistance = 9
		for _, npc in ipairs(crew) do
			local humanoid = npc:FindFirstChildOfClass("Humanoid")
			local npcRoot = npc.PrimaryPart
			if humanoid and humanoid.Health > 0 and npcRoot then
				local distance = (npcRoot.Position - root.Position).Magnitude
				if distance < nearestDistance then
					nearestDistance = distance
					nearestHumanoid = humanoid
				end
			end
		end

		if nearestHumanoid then
			nearestHumanoid:TakeDamage(38)
		end
	end)

	tool.Parent = backpack
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid:EquipTool(tool)
	end
end

function BoardingService:crewBrain(npc, player, onDefeated)
	local humanoid = npc:FindFirstChildOfClass("Humanoid")
	local root = npc.PrimaryPart
	if not humanoid or not root then
		return
	end

	local defeated = false
	humanoid.Died:Connect(function()
		if defeated then
			return
		end
		defeated = true
		onDefeated()
	end)

	while humanoid.Health > 0 and player.Parent do
		task.wait(GameConfig.Balance.Boarding.CrewAttackCooldown)
		local character = player.Character
		local targetHumanoid = character and character:FindFirstChildOfClass("Humanoid")
		local targetRoot = character and character:FindFirstChild("HumanoidRootPart")
		if not targetHumanoid or not targetRoot or targetHumanoid.Health <= 0 then
			return
		end

		humanoid:MoveTo(targetRoot.Position)
		if (targetRoot.Position - root.Position).Magnitude < 7 then
			targetHumanoid:TakeDamage(GameConfig.Balance.Boarding.CrewDamage)
		end
	end
end

function BoardingService:finish(attackerPlayer, defenderShip, arena, won)
	self.active[attackerPlayer] = nil
	if defenderShip and defenderShip.model then
		defenderShip.model:SetAttribute("BoardingLocked", false)
	end

	if won then
		self.captureService:capture(attackerPlayer, defenderShip)
		self.remotes.BoardingState:FireClient(attackerPlayer, "won")
	else
		self.remotes.BoardingState:FireClient(attackerPlayer, "lost")
	end

	local ship = self.shipService:getPlayerShip(attackerPlayer)
	local character = attackerPlayer.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local backpack = attackerPlayer:FindFirstChildOfClass("Backpack")
	local backpackTool = backpack and backpack:FindFirstChild("Boarding Cutlass")
	local characterTool = character and character:FindFirstChild("Boarding Cutlass")
	if backpackTool then
		backpackTool:Destroy()
	end
	if characterTool then
		characterTool:Destroy()
	end
	if ship and root then
		root.CFrame = ship.root.CFrame + Vector3.new(0, 8, 0)
	end

	if arena then
		arena:Destroy()
	end
end

return BoardingService
