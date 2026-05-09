local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
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
}

local findTargetFromMouse
local findTargetFromScreenPoint
local showNotice

local function makeLabel(parent, name, position, size)
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 0.25
	label.BackgroundColor3 = Color3.fromRGB(15, 18, 22)
	label.BorderSizePixel = 0
	label.Position = position
	label.Size = size
	label.Font = Enum.Font.GothamBold
	label.TextColor3 = Color3.fromRGB(245, 242, 232)
	label.TextScaled = true
	label.Parent = parent
	return label
end

local function makeButton(parent, name, text, position, size)
	local button = Instance.new("TextButton")
	button.Name = name
	button.Text = text
	button.AnchorPoint = Vector2.new(0.5, 0.5)
	button.Position = position
	button.Size = size
	button.BackgroundColor3 = Color3.fromRGB(22, 29, 36)
	button.BackgroundTransparency = 0.12
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBlack
	button.TextColor3 = Color3.fromRGB(255, 244, 216)
	button.TextScaled = true
	button.AutoButtonColor = true
	button.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(1, 0)
	corner.Parent = button

	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(255, 190, 90)
	stroke.Thickness = 2
	stroke.Transparency = 0.25
	stroke.Parent = button

	return button
end

local function clearChildren(parent)
	for _, child in ipairs(parent:GetChildren()) do
		if not child:IsA("UIListLayout") and not child:IsA("UIPadding") and not child:IsA("UICorner") and not child:IsA("UIStroke") then
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
	panel.BackgroundColor3 = Color3.fromRGB(13, 18, 24)
	panel.BackgroundTransparency = 0.08
	panel.BorderSizePixel = 0
	panel.Visible = false
	panel.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = panel

	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(255, 190, 90)
	stroke.Thickness = 2
	stroke.Transparency = 0.35
	stroke.Parent = panel

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
	button.Size = UDim2.new(1, 0, 0, 42)
	button.BackgroundColor3 = Color3.fromRGB(33, 43, 52)
	button.BackgroundTransparency = 0.05
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBold
	button.TextColor3 = Color3.fromRGB(255, 244, 216)
	button.TextScaled = true
	button.TextWrapped = true
	button.Text = text
	button.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent = button

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
	makePanelText(state.shopPanel, ("SHOP  Gold: %d"):format(snapshot.gold or 0), 34)
	makePanelButton(state.shopPanel, "Close Trading Post", function()
		state.shopPanel.Visible = false
	end)

	for _, item in ipairs(snapshot.goldItems or {}) do
		local upgradeText = ""
		local displayPrice = item.price
		if item.kind == "upgrade" then
			local current = snapshot.activeUpgrades and snapshot.activeUpgrades[item.upgradeKey] or 1
			displayPrice = ShopConfig.upgradePrice(item, current)
			upgradeText = (" L%d/%d"):format(current or 1, item.maxLevel or 5)
		elseif item.kind == "cosmetic" and snapshot.ownedCosmetics and snapshot.ownedCosmetics[item.cosmeticId] then
			upgradeText = " OWNED"
		elseif item.kind == "flag" and snapshot.ownedFlags and snapshot.ownedFlags[item.flagId] then
			upgradeText = " OWNED"
		elseif item.kind == "gear" and snapshot.ownedGear and snapshot.ownedGear[item.gearId] then
			upgradeText = " OWNED"
		end
		makePanelButton(state.shopPanel, ("%s%s - %d gold"):format(item.name, upgradeText, displayPrice), function()
			remotes.ShopPurchase:FireServer(item.id)
		end)
	end

	makePanelText(state.shopPanel, "ROBUX PRODUCTS", 28)
	for _, product in ipairs(snapshot.products or {}) do
		makePanelButton(state.shopPanel, product.name .. " - Robux", function()
			if product.productId and product.productId > 0 then
				MarketplaceService:PromptProductPurchase(player, product.productId)
			else
				showNotice("Set this productId in ShopConfig before publishing.")
			end
		end)
	end

	makePanelText(state.shopPanel, "OWNED SKINS", 28)
	for cosmeticId in pairs(snapshot.ownedCosmetics or {}) do
		local cosmetic = ShopConfig.Cosmetics[cosmeticId]
		if cosmetic then
			local suffix = if snapshot.equippedCosmetic == cosmeticId then " EQUIPPED" else ""
			makePanelButton(state.shopPanel, cosmetic.name .. suffix, function()
				remotes.EquipCosmetic:FireServer(cosmeticId)
			end)
		end
	end

	makePanelText(state.shopPanel, "OWNED FLAGS", 28)
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
	gui.Parent = player:WaitForChild("PlayerGui")

	state.hud = makeLabel(gui, "HUD", UDim2.fromOffset(18, 34), UDim2.fromOffset(320, 78))
	state.notice = makeLabel(gui, "Notice", UDim2.new(0.5, -220, 0, 32), UDim2.fromOffset(440, 42))
	state.notice.Text = ""
	state.notice.Visible = false

	state.board = makeLabel(gui, "Boarding", UDim2.new(0.5, -170, 0.82, 0), UDim2.fromOffset(340, 48))
	state.board.Text = ""
	state.board.Visible = false

	state.eventBanner = makeLabel(gui, "EventBanner", UDim2.new(0.5, -220, 0, 80), UDim2.fromOffset(440, 38))
	state.eventBanner.Text = ""
	state.eventBanner.Visible = false

	state.portPanel = makePanel(gui, "PortPanel", UDim2.new(0, 18, 1, -184), UDim2.fromOffset(260, 150))
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

	local modToggle = makeButton(gui, "ModToggle", "MOD", UDim2.new(1, -82, 0, 72), UDim2.fromOffset(108, 52))
	modToggle.Visible = false
	modToggle.Activated:Connect(function()
		state.modPanel.Visible = not state.modPanel.Visible
	end)

	state.shopPanel = makePanel(gui, "ShopPanel", UDim2.new(1, -390, 0, 164), UDim2.fromOffset(360, 510))
	state.modPanel = makePanel(gui, "ModeratorPanel", UDim2.new(0, 18, 0, 128), UDim2.fromOffset(300, 250))
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
	task.delay(3, function()
		if state.notice.Text == text then
			state.notice.Visible = false
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

	if input.KeyCode == Enum.KeyCode.Q then
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
	state.hud.Text = ("%s\nGold: %d  HP: %d/%d"):format(data.shipName or "Ship", data.gold or 0, data.hp or 0, data.maxHP or 0)
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
		state.eventBanner.Text = ("LIVE EVENT: %s"):format(activeEvent.kind)
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
		local look = shipRoot.CFrame.LookVector
		local desiredPosition = shipRoot.Position - look * GameConfig.Balance.Camera.FollowDistance + Vector3.new(0, GameConfig.Balance.Camera.FollowHeight, 0)
		local lookAt = shipRoot.Position + look * GameConfig.Balance.Camera.LookAhead
		local desired = CFrame.new(desiredPosition, lookAt)
		camera.CFrame = camera.CFrame:Lerp(desired, math.clamp(dt / GameConfig.Balance.Camera.Smoothing, 0, 1))
	elseif (state.inBoarding or state.onFoot) and camera then
		setAvatarControlsEnabled(true)
		camera.CameraType = Enum.CameraType.Custom
	elseif camera then
		setAvatarControlsEnabled(true)
	end
end)
