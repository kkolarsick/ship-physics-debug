local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)

local GearService = {}
GearService.__index = GearService

function GearService.new(profileService, remotes)
	return setmetatable({
		profileService = profileService,
		remotes = remotes,
		lastPistol = {},
		onVillagerAttacked = nil,
	}, GearService)
end

function GearService:start()
	self.remotes.ShoreMode.OnServerEvent:Connect(function(player, enabled)
		player:SetAttribute("OnFootPvP", enabled == true)
	end)

	Players.PlayerAdded:Connect(function(player)
		player.CharacterAdded:Connect(function()
			task.wait(0.5)
			self:giveOwnedGear(player)
		end)
	end)
end

function GearService:giveOwnedGear(player)
	local profile = self.profileService:get(player)
	if not profile then
		return
	end
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then
		return
	end
	if profile.ownedGear.cutlass and not backpack:FindFirstChild("Cutlass") then
		self:createCutlass(player, backpack)
	end
	if profile.ownedGear.pistol and not backpack:FindFirstChild("Flintlock Pistol") then
		self:createPistol(player, backpack)
	end
end

function GearService:createCutlass(player, backpack)
	local tool = Instance.new("Tool")
	tool.Name = "Cutlass"
	tool.RequiresHandle = true
	tool.CanBeDropped = false
	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.35, 4, 0.35)
	handle.Color = Color3.fromRGB(190, 190, 195)
	handle.Material = Enum.Material.Metal
	handle.Parent = tool
	tool.Activated:Connect(function()
		self:attack(player, GameConfig.Balance.Gear.MeleeRange, GameConfig.Balance.Gear.CutlassDamage)
	end)
	tool.Parent = backpack
end

function GearService:createPistol(player, backpack)
	local tool = Instance.new("Tool")
	tool.Name = "Flintlock Pistol"
	tool.RequiresHandle = true
	tool.CanBeDropped = false
	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(1, 1, 2.6)
	handle.Color = Color3.fromRGB(45, 38, 31)
	handle.Material = Enum.Material.Wood
	handle.Parent = tool
	tool.Activated:Connect(function()
		local now = os.clock()
		if now - (self.lastPistol[player] or 0) < GameConfig.Balance.Gear.PistolCooldown then
			return
		end
		self.lastPistol[player] = now
		self:attack(player, GameConfig.Balance.Gear.PistolRange, GameConfig.Balance.Gear.PistolDamage)
	end)
	tool.Parent = backpack
end

function GearService:attack(player, range, damage)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return
	end

	local targetHumanoid, targetModel, targetPlayer = self:nearestTarget(player, root.Position, range)
	if not targetHumanoid then
		return
	end

	local finalDamage = damage
	if targetPlayer then
		if not player:GetAttribute("OnFootPvP") or not targetPlayer:GetAttribute("OnFootPvP") then
			return
		end
		finalDamage *= GameConfig.Balance.Gear.PlayerPvpDamageScale
	end

	targetHumanoid:TakeDamage(finalDamage)
	if targetModel and targetModel:GetAttribute("Villager") and self.onVillagerAttacked then
		self.onVillagerAttacked(targetModel, player)
	end
end

function GearService:nearestTarget(attacker, origin, range)
	local bestHumanoid, bestModel, bestPlayer = nil, nil, nil
	local bestDistance = range
	for _, player in ipairs(Players:GetPlayers()) do
		if player ~= attacker then
			local character = player.Character
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if humanoid and root and humanoid.Health > 0 then
				local distance = (root.Position - origin).Magnitude
				if distance < bestDistance then
					bestDistance = distance
					bestHumanoid = humanoid
					bestModel = character
					bestPlayer = player
				end
			end
		end
	end

	for _, model in ipairs(workspace:GetDescendants()) do
		if model:IsA("Model") and model:GetAttribute("Villager") then
			local humanoid = model:FindFirstChildOfClass("Humanoid")
			local root = model.PrimaryPart
			if humanoid and root and humanoid.Health > 0 then
				local distance = (root.Position - origin).Magnitude
				if distance < bestDistance then
					bestDistance = distance
					bestHumanoid = humanoid
					bestModel = model
					bestPlayer = nil
				end
			end
		end
	end

	return bestHumanoid, bestModel, bestPlayer
end

return GearService
