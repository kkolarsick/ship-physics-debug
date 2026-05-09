local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Net = require(ReplicatedStorage.Shared.Net)
local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local ShopConfig = require(ReplicatedStorage.Shared.ShopConfig)

local player = Players.LocalPlayer
local remotes = Net.bootstrap()
local playerModule = player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule")
local controls = require(playerModule):GetControls()

local state = {
	throttle = 0,
	turn = 0,
	touchThrottle = 0,
	touchTurn = 0,
	target = nil,
	hud = nil,
	hpFill = nil,
	notice = nil,
	reticle = nil,
	board = nil,
	shopPanel = nil,
	modPanel = nil,
	eventBanner = nil,
	portPanel = nil,
	shopSnapshot = nil,
	controlMode = if UserInputService.TouchEnabled then "Touch" else "Keyboard",
	inBoarding = false,
	avatarControlsEnabled = true,
	onFoot = false,
	cameraYaw = 0,
	cameraPitch = 0,
	cameraDragging = false,
	lastPointer = nil,
}

local findTargetFromMouse
local findTargetFromScreenPoint
local showNotice

local UI = {
	bg = Color3.fromRGB(9, 14, 20),
	panel = Color3.fromRGB(18, 27, 35),
	panelSoft = Color3.fromRGB(29, 41, 51),
	button = Color3.fromRGB(35, 50, 61),
	buttonHot = Color3.fromRGB(52, 74, 86),
	gold = Color3.fromRGB(245, 187, 74),
	cream = Color3.fromRGB(255, 246, 220),
	muted = Color3.fromRGB(169, 186, 196),
	blue = Color3.fromRGB(76, 169, 214),
	green = Color3.fromRGB(92, 210, 141),
	danger = Color3.fromRGB(230, 91, 74),
}

local function addCorner(instance, radius)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, radius or 8)
	corner.Parent = instance
	return corner
end

local function addStroke(instance, color, thickness, transparency)
	local stroke = Instance.new("UIStroke")
	stroke.Color = color or UI.gold
	stroke.Thickness = thickness or 1
	stroke.Transparency = transparency or 0.35
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Parent = instance
	return stroke
end

local function addGradient(instance, top, bottom, rotation)
	local gradient = Instance.new("UIGradient")
	gradient.Color = ColorSequence.new(top, bottom)
	gradient.Rotation = rotation or 90
	gradient.Parent = instance
	return gradient
end

local function addTextConstraint(instance, minSize, maxSize)
	local constraint = Instance.new("UITextSizeConstraint")
	constraint.MinTextSize = minSize or 12
	constraint.MaxTextSize = maxSize or 22
	constraint.Parent = instance
	return constraint
end

local function addShadow(parent, target)
	local shadow = Instance.new("Frame")
	shadow.Name = target.Name .. "Shadow"
	shadow.AnchorPoint = target.AnchorPoint
	shadow.Position = UDim2.new(target.Position.X.Scale, target.Position.X.Offset, target.Position.Y.Scale, target.Position.Y.Offset + 4)
	shadow.Size = target.Size
	shadow.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
	shadow.BackgroundTransparency = 0.78
	shadow.BorderSizePixel = 0
	shadow.ZIndex = math.max(0, target.ZIndex - 1)
	shadow.Parent = parent
	addCorner(shadow, 8)
	return shadow
end

local function tween(instance, goal, seconds)
	TweenService:Create(instance, TweenInfo.new(seconds or 0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), goal):Play()
end

local function makeLabel(parent, name, position, size)
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 0.08
	label.BackgroundColor3 = UI.panel
	label.BorderSizePixel = 0
	label.Position = position
	label.Size = size
	label.Font = Enum.Font.GothamMedium
	label.TextColor3 = UI.cream
	label.TextScaled = true
	label.TextWrapped = true
	label.RichText = true
	label.ZIndex = 5
	label.Parent = parent
	addCorner(label, 8)
	addStroke(label, UI.gold, 1, 0.55)
	addGradient(label, UI.panelSoft, UI.panel, 90)
	addTextConstraint(label, 11, 23)
	return label
end

local function makeButton(parent, name, text, position, size)
	local button = Instance.new("TextButton")
	button.Name = name
	button.Text = text
	button.AnchorPoint = Vector2.new(0.5, 0.5)
	button.Position = position
	button.Size = size
	button.BackgroundColor3 = UI.button
	button.BackgroundTransparency = 0.03
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBlack
	button.TextColor3 = UI.cream
	button.TextScaled = true
	button.TextWrapped = true
	button.RichText = true
	button.AutoButtonColor = true
	button.ZIndex = 8
	button.Parent = parent
	addShadow(parent, button)

	addCorner(button, 12)
	addStroke(button, UI.gold, 2, 0.25)
	addGradient(button, UI.buttonHot, UI.button, 90)
	addTextConstraint(button, 10, 20)
	button.MouseEnter:Connect(function()
		tween(button, { BackgroundColor3 = UI.buttonHot }, 0.12)
	end)
	button.MouseLeave:Connect(function()
		tween(button, { BackgroundColor3 = UI.button }, 0.12)
	end)
	button.MouseButton1Down:Connect(function()
		tween(button, { Size = UDim2.new(size.X.Scale, size.X.Offset - 3, size.Y.Scale, size.Y.Offset - 3) }, 0.06)
	end)
	button.MouseButton1Up:Connect(function()
		tween(button, { Size = size }, 0.08)
	end)

	return button
end

local function clearChildren(parent)
	for _, child in ipairs(parent:GetChildren()) do
		if not child:IsA("UIListLayout") and not child:IsA("UIPadding") and not child:IsA("UICorner") and not child:IsA("UIStroke") and not child:IsA("UIGradient") then
			child:Destroy()
		end
	end
end

local function makePanel(parent, name, position, size)
	local panel = Instance.new("ScrollingFrame")
	panel.Name = name
	panel.Position = position
	panel.Size = size
	panel.CanvasSize = UDim2.fromScale(0, 0)
	panel.AutomaticCanvasSize = Enum.AutomaticSize.Y
	panel.ScrollBarThickness = 6
	panel.ScrollBarImageColor3 = UI.gold
	panel.BackgroundColor3 = UI.panel
	panel.BackgroundTransparency = 0.03
	panel.BorderSizePixel = 0
	panel.Visible = false
	panel.ClipsDescendants = true
	panel.ZIndex = 4
	panel.Parent = parent

	addShadow(parent, panel)
	addCorner(panel, 10)
	addStroke(panel, UI.gold, 1.5, 0.38)
	addGradient(panel, UI.panelSoft, UI.bg, 90)

	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0, 10)
	padding.PaddingBottom = UDim.new(0, 10)
	padding.PaddingLeft = UDim.new(0, 10)
	padding.PaddingRight = UDim.new(0, 10)
	padding.Parent = panel

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 8)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = panel

	return panel
end

local function makePanelButton(parent, text, callback)
	local button = Instance.new("TextButton")
	button.Size = UDim2.new(1, 0, 0, 46)
	button.BackgroundColor3 = UI.button
	button.BackgroundTransparency = 0.02
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamMedium
	button.TextColor3 = UI.cream
	button.TextScaled = true
	button.TextWrapped = true
	button.RichText = true
	button.Text = text
	button.TextXAlignment = Enum.TextXAlignment.Left
	button.ZIndex = 6
	button.Parent = parent

	addCorner(button, 8)
	addStroke(button, UI.gold, 1, 0.68)
	addGradient(button, UI.buttonHot, UI.button, 90)
	addTextConstraint(button, 11, 18)

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 12)
	padding.PaddingRight = UDim.new(0, 12)
	padding.Parent = button

	button.MouseEnter:Connect(function()
		tween(button, { BackgroundColor3 = UI.buttonHot }, 0.12)
	end)
	button.MouseLeave:Connect(function()
		tween(button, { BackgroundColor3 = UI.button }, 0.12)
	end)

	button.Activated:Connect(callback)
	return button
end

local function makePanelText(parent, text, height)
	local label = makeLabel(parent, "PanelText", UDim2.fromScale(0, 0), UDim2.new(1, 0, 0, height or 32))
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextWrapped = true
	return label
end

local function renderShop()
	if not state.shopPanel or not state.shopSnapshot then
		return
	end

	clearChildren(state.shopPanel)
	local snapshot = state.shopSnapshot
	makePanelText(state.shopPanel, ("<font color=\"#F5BB4A\"><b>TRADING POST</b></font>   Gold: %d"):format(snapshot.gold or 0), 38)
	makePanelButton(state.shopPanel, "Close Trading Post", function()
		state.shopPanel.Visible = false
	end)

	local sections = {
		{ title = "SHIP CLASSES", kind = "shipClass" },
		{ title = "SHIP UPGRADES", kind = "upgrade" },
		{ title = "PIRATE GEAR", kind = "gear" },
		{ title = "FLAGS", kind = "flag" },
		{ title = "SHIP SKINS", kind = "cosmetic" },
	}

	for _, section in ipairs(sections) do
		local wroteHeader = false
		for _, item in ipairs(snapshot.goldItems or {}) do
			if item.kind == section.kind then
				if not wroteHeader then
					makePanelText(state.shopPanel, ("<font color=\"#A9BAC4\"><b>%s</b></font>"):format(section.title), 28)
					wroteHeader = true
				end
				local upgradeText = ""
				local displayPrice = item.price
				if item.kind == "upgrade" then
					local current = snapshot.activeUpgrades and snapshot.activeUpgrades[item.upgradeKey] or 1
					displayPrice = ShopConfig.upgradePrice(item, current)
					upgradeText = ("  L%d/%d"):format(current or 1, item.maxLevel or 5)
				elseif item.kind == "cosmetic" and snapshot.ownedCosmetics and snapshot.ownedCosmetics[item.cosmeticId] then
					upgradeText = "  OWNED"
				elseif item.kind == "flag" and snapshot.ownedFlags and snapshot.ownedFlags[item.flagId] then
					upgradeText = "  OWNED"
				elseif item.kind == "gear" and snapshot.ownedGear and snapshot.ownedGear[item.gearId] then
					upgradeText = "  OWNED"
				elseif item.kind == "shipClass" and snapshot.ownedShipClasses and snapshot.ownedShipClasses[item.classId] then
					upgradeText = if snapshot.activeShipClassId == item.classId then "  LAUNCHED" else "  OWNED"
				end
				makePanelButton(state.shopPanel, ("%s%s    %d gold"):format(item.name, upgradeText, displayPrice), function()
					remotes.ShopPurchase:FireServer(item.id)
				end)
			end
		end
	end

	makePanelText(state.shopPanel, "<font color=\"#A9BAC4\"><b>ROBUX PRODUCTS</b></font>", 28)
	for _, product in ipairs(snapshot.products or {}) do
		makePanelButton(state.shopPanel, product.name .. " - Robux", function()
			if product.productId and product.productId > 0 then
				MarketplaceService:PromptProductPurchase(player, product.productId)
			else
				showNotice("Set this productId in ShopConfig before publishing.")
			end
		end)
	end

	makePanelText(state.shopPanel, "<font color=\"#A9BAC4\"><b>OWNED SKINS</b></font>", 28)
	for cosmeticId in pairs(snapshot.ownedCosmetics or {}) do
		local cosmetic = ShopConfig.Cosmetics[cosmeticId]
		if cosmetic then
			local suffix = if snapshot.equippedCosmetic == cosmeticId then " EQUIPPED" else ""
			makePanelButton(state.shopPanel, cosmetic.name .. suffix, function()
				remotes.EquipCosmetic:FireServer(cosmeticId)
			end)
		end
	end

	makePanelText(state.shopPanel, "<font color=\"#A9BAC4\"><b>OWNED FLAGS</b></font>", 28)
	for flagId in pairs(snapshot.ownedFlags or {}) do
		local flag = ShopConfig.Flags[flagId]
		if flag then
			local suffix = if snapshot.equippedFlag == flagId then " RAISED" else ""
			makePanelButton(state.shopPanel, flag.name .. suffix, function()
				remotes.EquipFlag:FireServer(flagId)
			end)
		end
	end
end

local function renderModeratorPanel(isModerator)
	if not state.modPanel then
		return
	end
	state.modPanel.Visible = isModerator and state.modPanel.Visible
	clearChildren(state.modPanel)
	makePanelText(state.modPanel, "MODERATOR", 34)
	makePanelButton(state.modPanel, "Toggle Cruise Ship", function()
		remotes.ModeratorCommand:FireServer("toggleCruise")
	end)
	makePanelButton(state.modPanel, "Start Gold Rush", function()
		remotes.ModeratorCommand:FireServer("goldRush")
	end)
	makePanelButton(state.modPanel, "Spawn Merchant Convoy", function()
		remotes.ModeratorCommand:FireServer("merchantConvoy")
	end)
	makePanelButton(state.modPanel, "End Event", function()
		remotes.ModeratorCommand:FireServer("endEvent")
	end)
end

local function buildHUD()
	local gui = Instance.new("ScreenGui")
	gui.Name = "PirateHUD"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.Parent = player:WaitForChild("PlayerGui")

	local uiScale = Instance.new("UIScale")
	uiScale.Scale = if UserInputService.TouchEnabled then 0.94 else 1
	uiScale.Parent = gui

	state.hud = makeLabel(gui, "HUD", UDim2.fromOffset(18, 34), UDim2.fromOffset(338, 94))
	state.hud.TextXAlignment = Enum.TextXAlignment.Left
	state.hud.TextYAlignment = Enum.TextYAlignment.Top
	local hudPadding = Instance.new("UIPadding")
	hudPadding.PaddingTop = UDim.new(0, 10)
	hudPadding.PaddingLeft = UDim.new(0, 14)
	hudPadding.PaddingRight = UDim.new(0, 14)
	hudPadding.Parent = state.hud

	local hpTrack = Instance.new("Frame")
	hpTrack.Name = "HPTrack"
	hpTrack.Position = UDim2.fromOffset(34, 102)
	hpTrack.Size = UDim2.fromOffset(306, 10)
	hpTrack.BackgroundColor3 = Color3.fromRGB(51, 26, 29)
	hpTrack.BorderSizePixel = 0
	hpTrack.ZIndex = 7
	hpTrack.Parent = gui
	addCorner(hpTrack, 5)
	addStroke(hpTrack, Color3.fromRGB(255, 255, 255), 1, 0.82)

	state.hpFill = Instance.new("Frame")
	state.hpFill.Name = "HPFill"
	state.hpFill.Size = UDim2.fromScale(1, 1)
	state.hpFill.BackgroundColor3 = UI.green
	state.hpFill.BorderSizePixel = 0
	state.hpFill.ZIndex = 8
	state.hpFill.Parent = hpTrack
	addCorner(state.hpFill, 5)
	addGradient(state.hpFill, Color3.fromRGB(115, 242, 161), UI.green, 0)

	state.notice = makeLabel(gui, "Notice", UDim2.new(0.5, -235, 0, 28), UDim2.fromOffset(470, 46))
	state.notice.Text = ""
	state.notice.Visible = false

	state.board = makeLabel(gui, "Boarding", UDim2.new(0.5, -190, 0.82, 0), UDim2.fromOffset(380, 52))
	state.board.Text = ""
	state.board.Visible = false

	state.eventBanner = makeLabel(gui, "EventBanner", UDim2.new(0.5, -220, 0, 82), UDim2.fromOffset(440, 40))
	state.eventBanner.Text = ""
	state.eventBanner.Visible = false

	state.portPanel = makePanel(gui, "PortPanel", UDim2.new(0, 18, 1, -198), UDim2.fromOffset(282, 164))
	state.portPanel.Visible = true
	makePanelText(state.portPanel, "PORTS\nLoading...", 80)

	state.reticle = Instance.new("Frame")
	state.reticle.Name = "Reticle"
	state.reticle.AnchorPoint = Vector2.new(0.5, 0.5)
	state.reticle.Size = UDim2.fromOffset(34, 34)
	state.reticle.BackgroundTransparency = 1
	state.reticle.Visible = false
	state.reticle.Parent = gui

	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(255, 219, 96)
	stroke.Thickness = 3
	stroke.Parent = state.reticle

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(1, 0)
	corner.Parent = state.reticle

	local modToggle = makeButton(gui, "ModToggle", "MOD", UDim2.new(1, -84, 0, 72), UDim2.fromOffset(104, 50))
	modToggle.Visible = false
	modToggle.Activated:Connect(function()
		state.modPanel.Visible = not state.modPanel.Visible
	end)

	state.shopPanel = makePanel(gui, "ShopPanel", UDim2.new(1, -438, 0, 150), UDim2.fromOffset(408, 548))
	state.modPanel = makePanel(gui, "ModeratorPanel", UDim2.new(0, 18, 0, 140), UDim2.fromOffset(318, 270))
	state.modToggle = modToggle

	if UserInputService.TouchEnabled then
		local controls = Instance.new("Frame")
		controls.Name = "TouchControls"
		controls.BackgroundTransparency = 1
		controls.Size = UDim2.fromScale(1, 1)
		controls.Parent = gui

		local forward = makeButton(controls, "Forward", "SAIL", UDim2.new(0.17, 0, 0.78, 0), UDim2.fromOffset(92, 92))
		local reverse = makeButton(controls, "Reverse", "BACK", UDim2.new(0.17, 0, 0.91, 0), UDim2.fromOffset(78, 78))
		local left = makeButton(controls, "Left", "<", UDim2.new(0.07, 0, 0.86, 0), UDim2.fromOffset(78, 78))
		local right = makeButton(controls, "Right", ">", UDim2.new(0.27, 0, 0.86, 0), UDim2.fromOffset(78, 78))
		local fireLeft = makeButton(controls, "FireLeft", "L", UDim2.new(0.73, 0, 0.84, 0), UDim2.fromOffset(82, 82))
		local fireRight = makeButton(controls, "FireRight", "R", UDim2.new(0.88, 0, 0.84, 0), UDim2.fromOffset(82, 82))
		local lock = makeButton(controls, "Lock", "LOCK", UDim2.new(0.805, 0, 0.69, 0), UDim2.fromOffset(92, 64))
		local board = makeButton(controls, "Board", "BOARD", UDim2.new(0.805, 0, 0.94, 0), UDim2.fromOffset(138, 58))
		local walk = makeButton(controls, "WalkToggle", "WALK", UDim2.new(0.5, 0, 0.94, 0), UDim2.fromOffset(120, 58))

		local function hold(button, onDown, onUp)
			button.InputBegan:Connect(function(input)
				if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
					onDown()
				end
			end)
			button.InputEnded:Connect(function(input)
				if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then
					onUp()
				end
			end)
		end

		hold(forward, function()
			state.touchThrottle = 1
		end, function()
			if state.touchThrottle > 0 then
				state.touchThrottle = 0
			end
		end)
		hold(reverse, function()
			state.touchThrottle = -0.35
		end, function()
			if state.touchThrottle < 0 then
				state.touchThrottle = 0
			end
		end)
		hold(left, function()
			state.touchTurn = 1
		end, function()
			if state.touchTurn > 0 then
				state.touchTurn = 0
			end
		end)
		hold(right, function()
			state.touchTurn = -1
		end, function()
			if state.touchTurn < 0 then
				state.touchTurn = 0
			end
		end)

		fireLeft.Activated:Connect(function()
			remotes.FireCannons:FireServer("left")
		end)
		fireRight.Activated:Connect(function()
			remotes.FireCannons:FireServer("right")
		end)
		lock.Activated:Connect(function()
			local target = findTargetFromMouse()
			state.target = target
			remotes.TargetLock:FireServer(target)
		end)
		board.Activated:Connect(function()
			local target = state.target or findTargetFromMouse()
			remotes.BoardRequest:FireServer(target)
		end)
		walk.Activated:Connect(function()
			state.onFoot = not state.onFoot
			remotes.ShoreMode:FireServer(state.onFoot)
			showNotice(if state.onFoot then "Shore leave: avatar controls on." else "Captain mode: ship controls on.")
		end)
	end
end

showNotice = function(text)
	state.notice.Text = text
	state.notice.Visible = true
	state.notice.TextTransparency = 1
	state.notice.BackgroundTransparency = 1
	tween(state.notice, { TextTransparency = 0, BackgroundTransparency = 0.08 }, 0.16)
	task.delay(3, function()
		if state.notice.Text == text then
			tween(state.notice, { TextTransparency = 1, BackgroundTransparency = 1 }, 0.18)
			task.wait(0.18)
			if state.notice.Text == text then
				state.notice.Visible = false
			end
		end
	end)
end

local function updateInputFromKeys()
	if state.onFoot then
		state.throttle = 0
		state.turn = 0
		return
	end

	local throttle = 0
	local turn = 0
	if UserInputService:IsKeyDown(Enum.KeyCode.W) then
		throttle += 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.S) then
		throttle -= 0.35
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.A) then
		turn += 1
	end
	if UserInputService:IsKeyDown(Enum.KeyCode.D) then
		turn -= 1
	end

	state.throttle = math.clamp(throttle + state.touchThrottle, GameConfig.Input.MinThrottle, GameConfig.Input.MaxThrottle)
	state.turn = math.clamp(turn + state.touchTurn, -GameConfig.Input.MaxTurn, GameConfig.Input.MaxTurn)
end

findTargetFromMouse = function()
	local mouse = player:GetMouse()
	local target = mouse.Target
	while target and not target:GetAttribute("ShipId") do
		target = target.Parent
	end
	return target
end

findTargetFromScreenPoint = function(screenPosition)
	local camera = Workspace.CurrentCamera
	if not camera then
		return nil
	end

	local ray = camera:ViewportPointToRay(screenPosition.X, screenPosition.Y)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { player.Character }

	local result = Workspace:Raycast(ray.Origin, ray.Direction * GameConfig.Balance.Targeting.ReticleRange, params)
	local target = result and result.Instance
	while target and not target:GetAttribute("ShipId") do
		target = target.Parent
	end
	return target
end

local function findOwnedShipRoot()
	local folders = { Workspace:FindFirstChild("Ships"), Workspace:FindFirstChild("Merchants") }
	for _, folder in ipairs(folders) do
		if folder then
			for _, model in ipairs(folder:GetChildren()) do
				if model:GetAttribute("OwnerUserId") == player.UserId and model:GetAttribute("TeamKind") == "Player" then
					return model.PrimaryPart or model:FindFirstChild("Root")
				end
			end
		end
	end
	return nil
end

local function setAvatarControlsEnabled(enabled)
	if state.avatarControlsEnabled == enabled then
		return
	end
	state.avatarControlsEnabled = enabled
	if enabled then
		controls:Enable()
	else
		controls:Disable()
	end
end

local function burstPart(name, position, color, size, lifetime)
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.CanCollide = false
	part.Shape = Enum.PartType.Ball
	part.Material = Enum.Material.Neon
	part.Color = color
	part.Transparency = 0.18
	part.Size = Vector3.new(size, size, size)
	part.Position = position
	part.Parent = Workspace
	task.delay(lifetime, function()
		if part.Parent then
			part:Destroy()
		end
	end)
	return part
end

local function cannonFlash(origin, direction)
	local flash = burstPart("MuzzleFlash", origin + direction * 2, Color3.fromRGB(255, 175, 64), 3.5, GameConfig.Balance.Cannons.MuzzleFlashSeconds)
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 148, 58)
	light.Brightness = 3.5
	light.Range = 32
	light.Parent = flash
end

local function hitBurst(position)
	local burst = burstPart("CannonHitBurst", position, Color3.fromRGB(255, 92, 58), 5.5, GameConfig.Balance.Cannons.HitBurstSeconds)
	local smoke = Instance.new("Smoke")
	smoke.Color = Color3.fromRGB(45, 43, 42)
	smoke.Opacity = 0.45
	smoke.RiseVelocity = 8
	smoke.Size = 5
	smoke.Parent = burst
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end

	if input.UserInputType == Enum.UserInputType.MouseButton2 then
		state.cameraDragging = true
		state.lastPointer = input.Position
	elseif input.KeyCode == Enum.KeyCode.Q then
		remotes.FireCannons:FireServer("left")
	elseif input.KeyCode == Enum.KeyCode.E then
		remotes.FireCannons:FireServer("right")
	elseif input.KeyCode == Enum.KeyCode.T then
		local target = findTargetFromMouse()
		state.target = target
		remotes.TargetLock:FireServer(target)
	elseif input.KeyCode == Enum.KeyCode.B then
		local target = state.target or findTargetFromMouse()
		remotes.BoardRequest:FireServer(target)
	elseif input.KeyCode == Enum.KeyCode.X then
		state.onFoot = not state.onFoot
		remotes.ShoreMode:FireServer(state.onFoot)
		showNotice(if state.onFoot then "Shore leave: avatar controls on." else "Captain mode: ship controls on.")
	end
end)

UserInputService.InputChanged:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseMovement and state.cameraDragging and state.lastPointer then
		local delta = input.Position - state.lastPointer
		state.cameraYaw -= delta.X * 0.006
		state.cameraPitch = math.clamp(state.cameraPitch - delta.Y * 0.004, -0.45, 0.55)
		state.lastPointer = input.Position
	elseif input.UserInputType == Enum.UserInputType.Touch and not state.onFoot and not state.inBoarding then
		local delta = input.Delta
		state.cameraYaw -= delta.X * 0.004
		state.cameraPitch = math.clamp(state.cameraPitch - delta.Y * 0.003, -0.45, 0.55)
	end
end)

UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton2 then
		state.cameraDragging = false
		state.lastPointer = nil
	end
end)

UserInputService.TouchTap:Connect(function(touchPositions, processed)
	if processed or not touchPositions[1] then
		return
	end
	local target = findTargetFromScreenPoint(touchPositions[1])
	if target then
		state.target = target
		remotes.TargetLock:FireServer(target)
	end
end)

remotes.HUDUpdate.OnClientEvent:Connect(function(data)
	local hp = data.hp or 0
	local maxHP = math.max(1, data.maxHP or 1)
	state.hud.Text = ("<font color=\"#FFF6DC\"><b>%s</b></font>\n<font color=\"#F5BB4A\">Gold</font> %d    <font color=\"#A9BAC4\">HP</font> %d/%d"):format(data.shipName or "Ship", data.gold or 0, hp, maxHP)
	if state.hpFill then
		local ratio = math.clamp(hp / maxHP, 0, 1)
		local fillColor = if ratio > 0.55 then UI.green elseif ratio > 0.25 then UI.gold else UI.danger
		tween(state.hpFill, {
			Size = UDim2.fromScale(ratio, 1),
			BackgroundColor3 = fillColor,
		}, 0.18)
	end
end)

remotes.ReticleUpdate.OnClientEvent:Connect(function(target)
	state.target = target
end)

remotes.Notify.OnClientEvent:Connect(showNotice)
remotes.CannonFX.OnClientEvent:Connect(cannonFlash)
remotes.HitFX.OnClientEvent:Connect(hitBurst)
remotes.ShopState.OnClientEvent:Connect(function(snapshot)
	state.shopSnapshot = snapshot
	if snapshot.open then
		state.shopPanel.Visible = true
	end
	renderShop()
end)
remotes.ModeratorState.OnClientEvent:Connect(function(data)
	local isModerator = data and data.isModerator == true
	if state.modToggle then
		state.modToggle.Visible = isModerator
	end
	renderModeratorPanel(isModerator)
end)
remotes.EventState.OnClientEvent:Connect(function(activeEvent)
	if activeEvent then
		state.eventBanner.Text = ("<font color=\"#F5BB4A\"><b>LIVE EVENT</b></font>  %s"):format(activeEvent.kind)
		state.eventBanner.Visible = true
	else
		state.eventBanner.Visible = false
	end
end)
remotes.PortState.OnClientEvent:Connect(function(portState)
	if not state.portPanel then
		return
	end
	clearChildren(state.portPanel)
	makePanelText(state.portPanel, "PORT CONTROL", 30)
	for portName, data in pairs(portState or {}) do
		makePanelText(state.portPanel, ("%s: %s"):format(portName, data.ownerName or "Neutral"), 28)
	end
end)

remotes.BoardingState.OnClientEvent:Connect(function(mode, value)
	if mode == "channel" then
		state.inBoarding = false
		state.board.Visible = true
		state.board.Text = ("Grappling... %ds"):format(value)
	elseif mode == "fight" then
		state.inBoarding = true
		state.board.Visible = true
		state.board.Text = "Boarding fight: defeat the crew"
	elseif mode == "won" then
		state.inBoarding = false
		state.board.Visible = true
		state.board.Text = "Boarding won: blueprint captured"
		task.delay(4, function()
			state.board.Visible = false
		end)
	elseif mode == "lost" then
		state.inBoarding = false
		state.board.Visible = true
		state.board.Text = "Boarding lost"
		task.delay(4, function()
			state.board.Visible = false
		end)
	end
end)

buildHUD()

local inputAccumulator = 0
RunService.RenderStepped:Connect(function(dt)
	updateInputFromKeys()
	inputAccumulator += dt
	if inputAccumulator >= 0.08 then
		inputAccumulator = 0
		remotes.ShipInput:FireServer(state.throttle, state.turn)
	end

	local camera = Workspace.CurrentCamera
	local targetRoot = state.target and (state.target.PrimaryPart or state.target:FindFirstChild("Root"))
	if targetRoot and camera then
		local screenPoint, visible = camera:WorldToViewportPoint(targetRoot.Position)
		local distance = (camera.CFrame.Position - targetRoot.Position).Magnitude
		state.reticle.Visible = visible and distance <= GameConfig.Balance.Targeting.ReticleRange
		state.reticle.Position = UDim2.fromOffset(screenPoint.X, screenPoint.Y)
	else
		state.reticle.Visible = false
	end

	local shipRoot = if state.inBoarding or state.onFoot then nil else findOwnedShipRoot()
	if shipRoot and camera then
		setAvatarControlsEnabled(false)
		camera.CameraType = Enum.CameraType.Scriptable
		local orbit = CFrame.Angles(0, state.cameraYaw, 0)
		local look = (orbit * shipRoot.CFrame).LookVector
		local desiredPosition = shipRoot.Position - look * GameConfig.Balance.Camera.FollowDistance + Vector3.new(0, GameConfig.Balance.Camera.FollowHeight + state.cameraPitch * 40, 0)
		local lookAt = shipRoot.Position + shipRoot.CFrame.LookVector * GameConfig.Balance.Camera.LookAhead
		local desired = CFrame.new(desiredPosition, lookAt)
		camera.CFrame = camera.CFrame:Lerp(desired, math.clamp(dt / GameConfig.Balance.Camera.Smoothing, 0, 1))
	elseif (state.inBoarding or state.onFoot) and camera then
		setAvatarControlsEnabled(true)
		camera.CameraType = Enum.CameraType.Custom
	elseif camera then
		setAvatarControlsEnabled(true)
	end
end)
