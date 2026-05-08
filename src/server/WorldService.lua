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
