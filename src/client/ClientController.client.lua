local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Net = require(ReplicatedStorage.Shared.Net)
local GameConfig = require(ReplicatedStorage.Shared.GameConfig)

local player = Players.LocalPlayer
local remotes = Net.bootstrap()

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
	controlMode = if UserInputService.TouchEnabled then "Touch" else "Keyboard",
	inBoarding = false,
}

local findTargetFromMouse
local findTargetFromScreenPoint

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
	end
end

local function showNotice(text)
	state.notice.Text = text
	state.notice.Visible = true
	task.delay(3, function()
		if state.notice.Text == text then
			state.notice.Visible = false
		end
	end)
end

local function updateInputFromKeys()
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

	local shipRoot = if state.inBoarding then nil else findOwnedShipRoot()
	if shipRoot and camera then
		camera.CameraType = Enum.CameraType.Scriptable
		local look = shipRoot.CFrame.LookVector
		local desiredPosition = shipRoot.Position - look * GameConfig.Balance.Camera.FollowDistance + Vector3.new(0, GameConfig.Balance.Camera.FollowHeight, 0)
		local lookAt = shipRoot.Position + look * GameConfig.Balance.Camera.LookAhead
		local desired = CFrame.new(desiredPosition, lookAt)
		camera.CFrame = camera.CFrame:Lerp(desired, math.clamp(dt / GameConfig.Balance.Camera.Smoothing, 0, 1))
	elseif state.inBoarding and camera then
		camera.CameraType = Enum.CameraType.Custom
	end
end)
