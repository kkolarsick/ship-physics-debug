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
	}, IslandActivityService)
end

function IslandActivityService:start()
	for _, spot in ipairs(Workspace:GetDescendants()) do
		if spot:IsA("BasePart") and spot.Name == "TreasureHuntSpot" then
			self:wireSpot(spot)
		end
	end
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
end

return IslandActivityService
