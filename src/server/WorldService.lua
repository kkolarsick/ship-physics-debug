local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local GameConfig = require(game:GetService("ReplicatedStorage").Shared.GameConfig)

local WorldService = {}
WorldService.__index = WorldService

function WorldService.new()
	return setmetatable({
		folders = {},
	}, WorldService)
end

function WorldService:getFolder(name)
	local folder = self.folders[name] or Workspace:FindFirstChild(name)
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = name
		folder.Parent = Workspace
	end
	self.folders[name] = folder
	return folder
end

function WorldService:setup()
	Lighting.ClockTime = 16.4
	Lighting.Brightness = 2.4
	Lighting.Ambient = Color3.fromRGB(78, 91, 112)
	Lighting.OutdoorAmbient = Color3.fromRGB(112, 128, 148)
	Lighting.ColorShift_Top = Color3.fromRGB(255, 211, 148)
	Lighting.ColorShift_Bottom = Color3.fromRGB(29, 84, 112)
	Lighting.EnvironmentDiffuseScale = 0.6
	Lighting.EnvironmentSpecularScale = 0.85

	local atmosphere = Lighting:FindFirstChild("PirateAtmosphere")
	if not atmosphere then
		atmosphere = Instance.new("Atmosphere")
		atmosphere.Name = "PirateAtmosphere"
		atmosphere.Density = 0.28
		atmosphere.Offset = 0.2
		atmosphere.Color = Color3.fromRGB(208, 225, 232)
		atmosphere.Decay = Color3.fromRGB(81, 103, 124)
		atmosphere.Glare = 0.18
		atmosphere.Haze = 1.8
		atmosphere.Parent = Lighting
	end

	local sun = Lighting:FindFirstChild("WarmSun")
	if not sun then
		sun = Instance.new("SunRaysEffect")
		sun.Name = "WarmSun"
		sun.Intensity = 0.055
		sun.Spread = 0.72
		sun.Parent = Lighting
	end

	local bloom = Lighting:FindFirstChild("CannonBloom")
	if not bloom then
		bloom = Instance.new("BloomEffect")
		bloom.Name = "CannonBloom"
		bloom.Intensity = 0.18
		bloom.Size = 28
		bloom.Threshold = 1.15
		bloom.Parent = Lighting
	end

	local ocean = Workspace:FindFirstChild("Ocean")
	if not ocean then
		ocean = Instance.new("Part")
		ocean.Name = "Ocean"
		ocean.Anchored = true
		ocean.Size = Vector3.new(1800, 1, 1800)
		ocean.Position = Vector3.new(0, GameConfig.World.WaterY - 1, 0)
		ocean.Material = Enum.Material.Water
		ocean.Color = Color3.fromRGB(18, 93, 132)
		ocean.Transparency = 0.25
		ocean.Parent = Workspace
	end

	local waveFolder = self:getFolder("WaveStrips")
	if #waveFolder:GetChildren() == 0 then
		for index = 1, 46 do
			local wave = Instance.new("Part")
			wave.Name = "FoamLine"
			wave.Anchored = true
			wave.CanCollide = false
			wave.Material = Enum.Material.Neon
			wave.Color = Color3.fromRGB(181, 226, 232)
			wave.Transparency = 0.82
			wave.Size = Vector3.new(120 + (index % 5) * 28, 0.08, 1.4)
			local x = ((index * 137) % 1500) - 750
			local z = ((index * 271) % 1500) - 750
			wave.CFrame = CFrame.new(x, GameConfig.World.WaterY + 0.04, z) * CFrame.Angles(0, math.rad((index * 31) % 180), 0)
			wave.Parent = waveFolder
		end
	end

	for _, port in ipairs(GameConfig.World.Ports) do
		local model = Workspace:FindFirstChild(port.name)
		if not model then
			model = Instance.new("Model")
			model.Name = port.name
			model.Parent = Workspace

			local dock = Instance.new("Part")
			dock.Name = "Dock"
			dock.Anchored = true
			dock.Size = Vector3.new(70, 4, 32)
			dock.Position = port.position
			dock.Color = Color3.fromRGB(112, 80, 51)
			dock.Material = Enum.Material.WoodPlanks
			dock.Parent = model
			model.PrimaryPart = dock

			local tower = Instance.new("Part")
			tower.Name = "HarborTower"
			tower.Anchored = true
			tower.Size = Vector3.new(14, 38, 14)
			tower.Position = port.position + Vector3.new(-32, 20, -8)
			tower.Color = Color3.fromRGB(198, 181, 143)
			tower.Material = Enum.Material.Slate
			tower.Parent = model

			local beacon = Instance.new("PointLight")
			beacon.Name = "Beacon"
			beacon.Color = Color3.fromRGB(255, 197, 98)
			beacon.Brightness = 2.2
			beacon.Range = 95
			beacon.Parent = tower

			local marker = Instance.new("Part")
			marker.Name = "SpawnMarker"
			marker.Anchored = true
			marker.CanCollide = false
			marker.Transparency = 0.4
			marker.Shape = Enum.PartType.Cylinder
			marker.Size = Vector3.new(2, 20, 20)
			marker.CFrame = CFrame.new(port.position + Vector3.new(0, 5, 52)) * CFrame.Angles(0, 0, math.rad(90))
			marker.Color = Color3.fromRGB(64, 196, 126)
			marker.Parent = model
		end
	end
end

function WorldService:nearestPort(position)
	local nearest = GameConfig.World.Ports[1]
	local best = math.huge
	for _, port in ipairs(GameConfig.World.Ports) do
		local distance = (port.position - position).Magnitude
		if distance < best then
			best = distance
			nearest = port
		end
	end
	return nearest
end

function WorldService:portSpawnCFrame(position)
	local port = self:nearestPort(position)
	return CFrame.new(port.position + Vector3.new(0, GameConfig.World.SpawnHeight, 68), port.position + Vector3.new(0, GameConfig.World.SpawnHeight, 160))
end

return WorldService
