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

local function addLight(parent, color, brightness, range)
	local light = Instance.new("PointLight")
	light.Color = color
	light.Brightness = brightness
	light.Range = range
	light.Shadows = true
	light.Parent = parent
	return light
end

local function addFoamEmitter(parent)
	local emitter = Instance.new("ParticleEmitter")
	emitter.Name = "WakeMist"
	emitter.Color = ColorSequence.new(Color3.fromRGB(222, 249, 252), Color3.fromRGB(128, 200, 212))
	emitter.LightEmission = 0.2
	emitter.Rate = 18
	emitter.Lifetime = NumberRange.new(0.6, 1.2)
	emitter.Speed = NumberRange.new(1.5, 4)
	emitter.SpreadAngle = Vector2.new(18, 18)
	emitter.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.7),
		NumberSequenceKeypoint.new(1, 0),
	})
	emitter.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.25),
		NumberSequenceKeypoint.new(1, 1),
	})
	emitter.Parent = parent
	return emitter
end

local function makeRope(name, root, cframe, length, parent)
	local rope = makePart(name, Vector3.new(0.25, 0.25, length), cframe, Color3.fromRGB(58, 42, 28), parent)
	rope.Material = Enum.Material.Fabric
	weld(root, rope)
	return rope
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
	local trimColor = RecipeUtil.trimColor(recipe)
	local flagBackground, flagAccent, flagText = RecipeUtil.flagColors(recipe)
	local ghostVisual = options.teamKind == "Ghost"
	local deckColor = if ghostVisual then Color3.fromRGB(0, 0, 0) else trimColor:Lerp(Color3.fromRGB(132, 92, 52), 0.35)
	local railColor = if ghostVisual then Color3.fromRGB(0, 0, 0) else trimColor
	local cabinColor = if ghostVisual then Color3.fromRGB(0, 0, 0) else hullColor:Lerp(Color3.fromRGB(255, 255, 255), 0.12)

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
	root.Transparency = 0
	root.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.25, 0.1)
	root:SetNetworkOwner(nil)
	model.PrimaryPart = root

	local bow = makeWedge("Bow", Vector3.new(width * 0.8, 4, 8), root.CFrame * CFrame.new(0, 0, -length / 2 - 3), hullColor, model)
	local keel = makePart("KeelStripe", Vector3.new(width + 0.4, 0.7, length + 1), root.CFrame * CFrame.new(0, 2.15, 0), trimColor, model)
	local deck = makePart("Deck", Vector3.new(width * 0.9, 1, length * 0.74), root.CFrame * CFrame.new(0, 2.6, 1), deckColor, model)
	local mast = makePart("Mast", Vector3.new(1.4, 24, 1.4), root.CFrame * CFrame.new(0, 15, -2), if ghostVisual then Color3.fromRGB(0, 0, 0) else Color3.fromRGB(88, 57, 36), model)
	local sail = makePart("Sail", Vector3.new(0.8, 15, 13), root.CFrame * CFrame.new(0, 16, -2), sailColor, model)
	sail.Material = Enum.Material.Fabric
	local flag = makePart("MastFlag", Vector3.new(0.35, 5, 8), root.CFrame * CFrame.new(0.25, 25, -2), flagBackground, model)
	flag.Material = Enum.Material.Fabric
	local flagStripe = makePart("MastFlagAccent", Vector3.new(0.38, 1.4, 8.2), root.CFrame * CFrame.new(0.28, 25, -2), flagAccent, model)
	flagStripe.Material = Enum.Material.Fabric
	local stern = makePart("SternCabin", Vector3.new(width * 0.72, 6, 7), root.CFrame * CFrame.new(0, 6, length / 2 - 5), cabinColor, model)
	local railLeft = makePart("PortRail", Vector3.new(0.45, 2.1, length * 0.82), root.CFrame * CFrame.new(-width / 2 - 0.35, 4.15, 0), railColor, model)
	local railRight = makePart("StarboardRail", Vector3.new(0.45, 2.1, length * 0.82), root.CFrame * CFrame.new(width / 2 + 0.35, 4.15, 0), railColor, model)
	local figurehead = makeWedge("Figurehead", Vector3.new(3.5, 2.5, 4), root.CFrame * CFrame.new(0, 1.8, -length / 2 - 8), trimColor, model)

	weld(root, bow)
	weld(root, keel)
	weld(root, deck)
	weld(root, mast)
	weld(root, sail)
	weld(root, flag)
	weld(root, flagStripe)
	weld(root, stern)
	weld(root, railLeft)
	weld(root, railRight)
	weld(root, figurehead)

	makeRope("RiggingLeft", root, root.CFrame * CFrame.new(-3.8, 16, -2) * CFrame.Angles(0, 0, math.rad(23)), 26, model)
	makeRope("RiggingRight", root, root.CFrame * CFrame.new(3.8, 16, -2) * CFrame.Angles(0, 0, math.rad(-23)), 26, model)

	if flagText ~= "" then
		local gui = Instance.new("SurfaceGui")
		gui.Name = "FlagText"
		gui.Face = Enum.NormalId.Right
		gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		gui.PixelsPerStud = 35
		gui.Parent = flag

		local label = Instance.new("TextLabel")
		label.BackgroundTransparency = 1
		label.Size = UDim2.fromScale(1, 1)
		label.Font = Enum.Font.GothamBlack
		label.Text = flagText
		label.TextColor3 = flagAccent
		label.TextScaled = true
		label.Parent = gui
	end

	for _, side in ipairs({ -1, 1 }) do
		local lantern = makePart("Lantern", Vector3.new(1, 1, 1), root.CFrame * CFrame.new(side * (width / 2 - 2), 7, length / 2 - 1), Color3.fromRGB(255, 183, 83), model)
		lantern.Material = Enum.Material.Neon
		addLight(lantern, Color3.fromRGB(255, 174, 78), 0.9, 20)
		weld(root, lantern)
	end

	local cannonFolder = Instance.new("Folder")
	cannonFolder.Name = "Cannons"
	cannonFolder.Parent = model

	local cannonPairs = RecipeUtil.cannonPairs(recipe)
	for index = 1, cannonPairs do
		local z = -length / 2 + 6 + (index - 1) * ((length - 12) / math.max(1, cannonPairs - 1))
		for _, side in ipairs({ -1, 1 }) do
			local cannon = makePart("Cannon", Vector3.new(2, 2, 5), root.CFrame * CFrame.new(side * (width / 2 + 1.2), 3.2, z), Color3.fromRGB(32, 32, 36), cannonFolder)
			cannon.Material = Enum.Material.Metal
			weld(root, cannon)
		end
	end

	local wakeLeft = makePart("WakeFoamLeft", Vector3.new(2.4, 0.08, length * 0.8), root.CFrame * CFrame.new(-width / 2 - 2.8, -2.05, 2), Color3.fromRGB(196, 238, 242), model)
	wakeLeft.Material = Enum.Material.Neon
	wakeLeft.Transparency = 0.72
	wakeLeft.CanCollide = false
	addFoamEmitter(wakeLeft)
	local wakeRight = makePart("WakeFoamRight", Vector3.new(2.4, 0.08, length * 0.8), root.CFrame * CFrame.new(width / 2 + 2.8, -2.05, 2), Color3.fromRGB(196, 238, 242), model)
	wakeRight.Material = Enum.Material.Neon
	wakeRight.Transparency = 0.72
	wakeRight.CanCollide = false
	addFoamEmitter(wakeRight)
	weld(root, wakeLeft)
	weld(root, wakeRight)

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
		isGhost = options.teamKind == "Ghost",
	}
end

return ShipFactory
