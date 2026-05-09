local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)

local VillagerService = {}
VillagerService.__index = VillagerService

function VillagerService.new(remotes)
	return setmetatable({
		remotes = remotes,
		lastReturnFire = {},
	}, VillagerService)
end

function VillagerService:start(gearService)
	gearService.onVillagerAttacked = function(villager, attacker)
		self:returnFire(villager, attacker)
	end

	for _, port in ipairs(GameConfig.World.Ports) do
		self:spawnVillagers(port)
	end
end

function VillagerService:spawnVillagers(port)
	local parent = workspace:FindFirstChild(port.name)
	if not parent then
		return
	end
	for index = 1, 3 do
		local model = Instance.new("Model")
		model.Name = "Villager"
		model:SetAttribute("Villager", true)
		model.Parent = parent

		local root = Instance.new("Part")
		root.Name = "HumanoidRootPart"
		root.Size = Vector3.new(2, 4, 1)
		root.Position = port.position + Vector3.new(-18 + index * 12, 8, 4)
		root.Color = Color3.fromRGB(196, 137, 87)
		root.Parent = model
		model.PrimaryPart = root

		local humanoid = Instance.new("Humanoid")
		humanoid.MaxHealth = GameConfig.Balance.IslandActivities.VillagerHP
		humanoid.Health = humanoid.MaxHealth
		humanoid.WalkSpeed = 10
		humanoid.Parent = model
	end
end

function VillagerService:returnFire(villager, attacker)
	local now = os.clock()
	if now - (self.lastReturnFire[villager] or 0) < 1.5 then
		return
	end
	self.lastReturnFire[villager] = now

	local character = attacker.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not humanoid or not root or not villager.PrimaryPart then
		return
	end
	if (root.Position - villager.PrimaryPart.Position).Magnitude <= GameConfig.Balance.IslandActivities.VillagerReturnRange then
		humanoid:TakeDamage(GameConfig.Balance.IslandActivities.VillagerReturnDamage)
		self.remotes.Notify:FireClient(attacker, "Villagers are returning fire.")
	end
end

return VillagerService
