local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local ShipFactory = {}
ShipFactory.__index = ShipFactory

local function makePart(name, size, cframe, color, parent)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = Enum.Material.WoodPlanks
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

local function makeWedge(name, size, cframe, color, parent)
	local part = Instance.new("WedgePart")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = Enum.Material.WoodPlanks
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

local function weld(root, part)
	local constraint = Instance.new("WeldConstraint")
	constraint.Part0 = root
	constraint.Part1 = part
	constraint.Parent = root
	part.Anchored = false
end

function ShipFactory.new(worldService)
	return setmetatable({
		worldService = worldService,
		nextShipId = 0,
	}, ShipFactory)
end

function ShipFactory:createShip(options)
	self.nextShipId += 1

	local recipe = RecipeUtil.deepCopy(options.recipe or RecipeUtil.defaultRecipe())
	local design = recipe.design or {}
	local length = design.length or 32
	local width = design.width or 12
	local hullColor = RecipeUtil.color3FromTable(design.hullColor)
	local sailColor = RecipeUtil.color3FromTable(design.sailColor)

	local model = Instance.new("Model")
	model.Name = options.name or ("Ship_" .. self.nextShipId)
	model:SetAttribute("ShipId", self.nextShipId)
	model:SetAttribute("TeamKind", options.teamKind or "Player")
	model:SetAttribute("OwnerUserId", options.owner and options.owner.UserId or 0)
	model:SetAttribute("MaxHP", options.maxHP or RecipeUtil.maxHP(recipe))
	model:SetAttribute("HP", model:GetAttribute("MaxHP"))
	model:SetAttribute("Sunk", false)
	model:SetAttribute("BoardingLocked", false)
	model.Parent = options.parent

	local root = makePart("Root", Vector3.new(width, 4, length), options.cframe, hullColor, model)
	root.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.25, 0.1)
	root:SetNetworkOwner(nil)
	model.PrimaryPart = root

	local bow = makeWedge("Bow", Vector3.new(width * 0.8, 4, 8), root.CFrame * CFrame.new(0, 0, -length / 2 - 3), hullColor, model)
	local deck = makePart("Deck", Vector3.new(width * 0.9, 1, length * 0.74), root.CFrame * CFrame.new(0, 2.6, 1), Color3.fromRGB(132, 92, 52), model)
	local mast = makePart("Mast", Vector3.new(1.4, 24, 1.4), root.CFrame * CFrame.new(0, 15, -2), Color3.fromRGB(88, 57, 36), model)
	local sail = makePart("Sail", Vector3.new(0.8, 15, 13), root.CFrame * CFrame.new(0, 16, -2), sailColor, model)
	sail.Material = Enum.Material.Fabric

	weld(root, bow)
	weld(root, deck)
	weld(root, mast)
	weld(root, sail)

	local cannonFolder = Instance.new("Folder")
	cannonFolder.Name = "Cannons"
	cannonFolder.Parent = model

	local offsets = GameConfig.Balance.Cannons.SpawnForwardOffsets
	for _, z in ipairs(offsets) do
		for _, side in ipairs({ -1, 1 }) do
			local cannon = makePart("Cannon", Vector3.new(2, 2, 5), root.CFrame * CFrame.new(side * (width / 2 + 1.2), 3.2, z), Color3.fromRGB(32, 32, 36), cannonFolder)
			cannon.Material = Enum.Material.Metal
			weld(root, cannon)
		end
	end

	local bodyVelocity = Instance.new("BodyVelocity")
	bodyVelocity.Name = "ShipBodyVelocity"
	bodyVelocity.MaxForce = Vector3.new(GameConfig.Balance.Ship.LinearForce, 0, GameConfig.Balance.Ship.LinearForce)
	bodyVelocity.Velocity = Vector3.zero
	bodyVelocity.Parent = root

	local bodyGyro = Instance.new("BodyGyro")
	bodyGyro.Name = "ShipBodyGyro"
	bodyGyro.MaxTorque = Vector3.new(0, GameConfig.Balance.Ship.TurnTorque, 0)
	bodyGyro.P = 9000
	bodyGyro.D = 550
	bodyGyro.CFrame = root.CFrame
	bodyGyro.Parent = root

	return {
		id = self.nextShipId,
		model = model,
		root = root,
		owner = options.owner,
		recipe = recipe,
		input = {
			throttle = 0,
			turn = 0,
			last = os.clock(),
		},
		target = nil,
		lastFire = 0,
		isMerchant = options.teamKind == "Merchant",
		isPrize = options.teamKind == "Prize",
	}
end

return ShipFactory
