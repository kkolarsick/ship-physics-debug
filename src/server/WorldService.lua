local Lighting = game:GetService("Lighting")
local Workspace = game:GetService("Workspace")

local GameConfig = require(game:GetService("ReplicatedStorage").Shared.GameConfig)

local WorldService = {}
WorldService.__index = WorldService

local function makeAnchoredPart(parent, name, size, cframe, color, material)
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

local function addPalm(parent, position, height)
	local trunk = makeAnchoredPart(parent, "PalmTrunk", Vector3.new(2, height, 2), CFrame.new(position + Vector3.new(0, height / 2, 0)) * CFrame.Angles(0, 0, math.rad(8)), Color3.fromRGB(104, 69, 38), Enum.Material.Wood)
	for index = 1, 5 do
		local leaf = makeAnchoredPart(parent, "PalmLeaf", Vector3.new(3, 1, 13), CFrame.new(position + Vector3.new(0, height + 1, 0)) * CFrame.Angles(0, math.rad(index * 72), math.rad(18)), Color3.fromRGB(38, 128, 58), Enum.Material.Grass)
		leaf.CanCollide = false
	end
	return trunk
end

local function addHut(parent, position, color)
	local base = makeAnchoredPart(parent, "HarborHut", Vector3.new(18, 10, 14), CFrame.new(position + Vector3.new(0, 5, 0)), color, Enum.Material.WoodPlanks)
	local roof = Instance.new("WedgePart")
	roof.Name = "HutRoof"
	roof.Anchored = true
	roof.Size = Vector3.new(20, 8, 16)
	roof.CFrame = CFrame.new(position + Vector3.new(0, 13, 0)) * CFrame.Angles(0, math.rad(90), 0)
	roof.Color = Color3.fromRGB(92, 55, 32)
	roof.Material = Enum.Material.Wood
	roof.Parent = parent
	return base
end

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

			local island = Instance.new("Part")
			island.Name = "Island"
			island.Anchored = true
			island.Shape = Enum.PartType.Cylinder
			island.Size = Vector3.new(9, 170, 135)
			island.CFrame = CFrame.new(port.position + Vector3.new(0, -2, 0)) * CFrame.Angles(0, 0, math.rad(90))
			island.Color = Color3.fromRGB(212, 190, 132)
			island.Material = Enum.Material.Sand
			island.Parent = model

			local grass = Instance.new("Part")
			grass.Name = "IslandGreen"
			grass.Anchored = true
			grass.Shape = Enum.PartType.Cylinder
			grass.Size = Vector3.new(1.2, 112, 82)
			grass.CFrame = CFrame.new(port.position + Vector3.new(0, 3.15, 0)) * CFrame.Angles(0, 0, math.rad(90))
			grass.Color = Color3.fromRGB(67, 147, 66)
			grass.Material = Enum.Material.Grass
			grass.Parent = model

			local dockDirection = (port.spawnPosition - port.position).Unit
			local dockCenter = port.position + dockDirection * 58
			local dock = makeAnchoredPart(model, "Dock", Vector3.new(34, 4, 82), CFrame.new(dockCenter, port.spawnPosition), Color3.fromRGB(112, 80, 51), Enum.Material.WoodPlanks)
			model.PrimaryPart = dock

			local tower = makeAnchoredPart(model, "HarborTower", Vector3.new(14, 38, 14), CFrame.new(port.position + Vector3.new(-32, 20, -8)), Color3.fromRGB(198, 181, 143), Enum.Material.Slate)

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

			for index = 1, 5 do
				local angle = math.rad(index * 72 + (#port.name * 5))
				addPalm(model, port.position + Vector3.new(math.cos(angle) * 46, 5, math.sin(angle) * 34), 18 + (index % 3) * 3)
			end

			addHut(model, port.position + Vector3.new(22, 4, -24), if port.theme == "pirate" then Color3.fromRGB(91, 45, 39) else Color3.fromRGB(139, 97, 55))
			addHut(model, port.position + Vector3.new(-18, 4, 28), if port.theme == "market" then Color3.fromRGB(180, 95, 64) else Color3.fromRGB(116, 78, 47))

			if port.theme == "temple" then
				makeAnchoredPart(model, "Sunspire", Vector3.new(18, 44, 18), CFrame.new(port.position + Vector3.new(14, 26, 12)), Color3.fromRGB(220, 191, 112), Enum.Material.Slate)
			elseif port.theme == "pirate" then
				makeAnchoredPart(model, "SkullRock", Vector3.new(24, 20, 18), CFrame.new(port.position + Vector3.new(10, 14, 22)), Color3.fromRGB(56, 56, 60), Enum.Material.Rock)
			elseif port.theme == "navy" then
				makeAnchoredPart(model, "FortWall", Vector3.new(52, 16, 8), CFrame.new(port.position + Vector3.new(0, 10, -38)), Color3.fromRGB(174, 169, 151), Enum.Material.Slate)
			end

			local activity = makeAnchoredPart(model, "TreasureHuntSpot", Vector3.new(12, 1, 12), CFrame.new(port.position + Vector3.new(-26, 5.4, 16)), Color3.fromRGB(255, 214, 91), Enum.Material.Neon)
			activity.Transparency = 0.35
			activity.CanCollide = false
			activity:SetAttribute("PortName", port.name)
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
	return CFrame.new(port.spawnPosition, port.spawnPosition + (port.spawnPosition - port.position).Unit * 90)
end

return WorldService
