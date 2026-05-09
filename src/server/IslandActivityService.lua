local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local GameConfig = require(game:GetService("ReplicatedStorage").Shared.GameConfig)

local IslandActivityService = {}
IslandActivityService.__index = IslandActivityService

function IslandActivityService.new(profileService, shipService, remotes)
	return setmetatable({
		profileService = profileService,
		shipService = shipService,
		remotes = remotes,
		cooldowns = {},
		activeMaps = {},
		nextMapId = 0,
	}, IslandActivityService)
end

function IslandActivityService:getFolder()
	local folder = Workspace:FindFirstChild("BuriedTreasures")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "BuriedTreasures"
		folder.Parent = Workspace
	end
	return folder
end

function IslandActivityService:start()
	for _, spot in ipairs(Workspace:GetDescendants()) do
		if spot:IsA("BasePart") and spot.Name == "TreasureHuntSpot" then
			self:wireSpot(spot)
		end
	end

	Players.PlayerRemoving:Connect(function(player)
		self:clearMaps(player)
		self.cooldowns[player] = nil
	end)
end

function IslandActivityService:wireSpot(spot)
	local prompt = spot:FindFirstChildOfClass("ProximityPrompt")
	if not prompt then
		prompt = Instance.new("ProximityPrompt")
		prompt.Name = "TreasurePrompt"
		prompt.ActionText = "Search"
		prompt.ObjectText = "Island Treasure"
		prompt.HoldDuration = 2.5
		prompt.MaxActivationDistance = 18
		prompt.RequiresLineOfSight = false
		prompt.Parent = spot
	end

	prompt.Triggered:Connect(function(player)
		self:search(player, spot)
	end)
end

function IslandActivityService:search(player, spot)
	local now = os.clock()
	local last = self.cooldowns[player] or 0
	if now - last < GameConfig.Balance.IslandActivities.TreasureCooldown then
		self.remotes.Notify:FireClient(player, "This island needs time to reveal more treasure.")
		return
	end

	self.cooldowns[player] = now
	local reward = math.random(GameConfig.Balance.IslandActivities.TreasureMinGold, GameConfig.Balance.IslandActivities.TreasureMaxGold)
	self.profileService:addGold(player, reward)
	self.shipService:sendHUD(player)
	self.remotes.Notify:FireClient(player, ("Treasure found at %s: +%d gold"):format(spot:GetAttribute("PortName") or "the island", reward))

	if math.random() <= GameConfig.Balance.IslandActivities.TreasureMapChance then
		self:createTreasureMap(player)
	end
end

function IslandActivityService:activeMapCount(player)
	local maps = self.activeMaps[player]
	if not maps then
		return 0
	end
	local count = 0
	for _, map in pairs(maps) do
		if map.part and map.part.Parent then
			count += 1
		end
	end
	return count
end

function IslandActivityService:randomTreasurePosition(port)
	local angle = math.random() * math.pi * 2
	local radius = math.random(GameConfig.Balance.IslandActivities.BuriedTreasureRadiusMin, GameConfig.Balance.IslandActivities.BuriedTreasureRadiusMax)
	return port.position + Vector3.new(math.cos(angle) * radius, 5.7, math.sin(angle) * radius)
end

function IslandActivityService:createTreasureMap(player)
	if self:activeMapCount(player) >= GameConfig.Balance.IslandActivities.MaxActiveTreasureMaps then
		self.remotes.Notify:FireClient(player, "You already have too many treasure maps to chase.")
		return
	end

	self.nextMapId += 1
	local port = GameConfig.World.Ports[math.random(1, #GameConfig.World.Ports)]
	local position = self:randomTreasurePosition(port)
	local reward = math.random(GameConfig.Balance.IslandActivities.BuriedTreasureMinGold, GameConfig.Balance.IslandActivities.BuriedTreasureMaxGold)
	local mapId = ("%d_%d"):format(player.UserId, self.nextMapId)

	local marker = Instance.new("Part")
	marker.Name = "BuriedTreasure"
	marker.Anchored = true
	marker.CanCollide = false
	marker.Size = Vector3.new(8, 0.35, 8)
	marker.CFrame = CFrame.new(position)
	marker.Color = Color3.fromRGB(190, 150, 82)
	marker.Material = Enum.Material.Sand
	marker.Transparency = 0.18
	marker:SetAttribute("OwnerUserId", player.UserId)
	marker:SetAttribute("MapId", mapId)
	marker:SetAttribute("PortName", port.name)
	marker.Parent = self:getFolder()

	local crossA = Instance.new("Part")
	crossA.Name = "TreasureMapX"
	crossA.Anchored = true
	crossA.CanCollide = false
	crossA.Size = Vector3.new(9, 0.12, 1.4)
	crossA.CFrame = marker.CFrame * CFrame.Angles(0, math.rad(45), 0)
	crossA.Color = Color3.fromRGB(116, 45, 38)
	crossA.Material = Enum.Material.WoodPlanks
	crossA.Parent = marker

	local crossB = crossA:Clone()
	crossB.CFrame = marker.CFrame * CFrame.Angles(0, math.rad(-45), 0)
	crossB.Parent = marker

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "DigTreasurePrompt"
	prompt.ActionText = "Dig"
	prompt.ObjectText = "Buried Treasure"
	prompt.HoldDuration = 3
	prompt.MaxActivationDistance = 14
	prompt.RequiresLineOfSight = false
	prompt.Parent = marker

	self.activeMaps[player] = self.activeMaps[player] or {}
	self.activeMaps[player][mapId] = {
		part = marker,
		reward = reward,
		portName = port.name,
	}

	prompt.Triggered:Connect(function(triggeringPlayer)
		self:digTreasure(triggeringPlayer, mapId)
	end)

	self.remotes.Notify:FireClient(player, ("Treasure map found: dig near %s."):format(port.name))
end

function IslandActivityService:clearMaps(player)
	local maps = self.activeMaps[player]
	if not maps then
		return
	end
	for _, map in pairs(maps) do
		if map.part and map.part.Parent then
			map.part:Destroy()
		end
	end
	self.activeMaps[player] = nil
end

function IslandActivityService:digTreasure(player, mapId)
	local maps = self.activeMaps[player]
	local map = maps and maps[mapId]
	if not map or not map.part or not map.part.Parent then
		self.remotes.Notify:FireClient(player, "This treasure map is already spent.")
		return
	end

	self.profileService:addGold(player, map.reward)
	self.shipService:sendHUD(player)
	self.remotes.Notify:FireClient(player, ("Buried treasure dug up near %s: +%d gold"):format(map.portName, map.reward))
	map.part:Destroy()
	maps[mapId] = nil
end

return IslandActivityService
