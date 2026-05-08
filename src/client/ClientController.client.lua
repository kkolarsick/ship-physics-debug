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
	target = nil,
	hud = nil,
	notice = nil,
	reticle = nil,
	board = nil,
}

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

local function buildHUD()
	local gui = Instance.new("ScreenGui")
	gui.Name = "PirateHUD"
	gui.ResetOnSpawn = false
	gui.Parent = player:WaitForChild("PlayerGui")

	state.hud = makeLabel(gui, "HUD", UDim2.fromOffset(18, 18), UDim2.fromOffset(300, 72))
	state.notice = makeLabel(gui, "Notice", UDim2.new(0.5, -220, 0, 22), UDim2.fromOffset(440, 42))
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

	state.throttle = math.clamp(throttle, GameConfig.Input.MinThrottle, GameConfig.Input.MaxThrottle)
	state.turn = math.clamp(turn, -GameConfig.Input.MaxTurn, GameConfig.Input.MaxTurn)
end

local function findTargetFromMouse()
	local mouse = player:GetMouse()
	local target = mouse.Target
	while target and not target:GetAttribute("ShipId") do
		target = target.Parent
	end
	return target
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

remotes.HUDUpdate.OnClientEvent:Connect(function(data)
	state.hud.Text = ("%s\nGold: %d  HP: %d/%d"):format(data.shipName or "Ship", data.gold or 0, data.hp or 0, data.maxHP or 0)
end)

remotes.ReticleUpdate.OnClientEvent:Connect(function(target)
	state.target = target
end)

remotes.Notify.OnClientEvent:Connect(showNotice)

remotes.BoardingState.OnClientEvent:Connect(function(mode, value)
	if mode == "channel" then
		state.board.Visible = true
		state.board.Text = ("Grappling... %ds"):format(value)
	elseif mode == "fight" then
		state.board.Visible = true
		state.board.Text = "Boarding fight: defeat the crew"
	elseif mode == "won" then
		state.board.Visible = true
		state.board.Text = "Boarding won: blueprint captured"
		task.delay(4, function()
			state.board.Visible = false
		end)
	elseif mode == "lost" then
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
end)
