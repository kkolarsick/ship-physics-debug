local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)

local PortControlService = {}
PortControlService.__index = PortControlService

function PortControlService.new(shipService, profileService, worldService, remotes)
	return setmetatable({
		shipService = shipService,
		profileService = profileService,
		worldService = worldService,
		remotes = remotes,
		portState = {},
		captureProgress = {},
	}, PortControlService)
end

function PortControlService:start()
	for _, port in ipairs(GameConfig.World.Ports) do
		self.portState[port.name] = {
			name = port.name,
			ownerUserId = 0,
			ownerName = "Neutral",
		}
		self:addCaptureRing(port)
	end

	self.shipService:onShipSunk(function(ship, attacker)
		if ship.owner and attacker and attacker.owner and ship.owner ~= attacker.owner then
			local port = self.worldService:nearestPort(ship.root.Position)
			self:capturePort(port.name, attacker.owner, "PvP sink")
			self.profileService:addGold(attacker.owner, GameConfig.Balance.PortControl.PvpSinkRewardGold)
			self.shipService:sendHUD(attacker.owner)
			self.remotes.Notify:FireClient(attacker.owner, ("PvP sink near %s: port pressure +%d gold"):format(port.name, GameConfig.Balance.PortControl.PvpSinkRewardGold))
		end
	end)

	task.spawn(function()
		while true do
			task.wait(1)
			self:updateCapture()
		end
	end)
end

function PortControlService:addCaptureRing(port)
	local model = workspace:FindFirstChild(port.name)
	if not model then
		return
	end

	local ring = Instance.new("Part")
	ring.Name = "CaptureZone"
	ring.Anchored = true
	ring.CanCollide = false
	ring.Shape = Enum.PartType.Cylinder
	ring.Size = Vector3.new(1, GameConfig.Balance.PortControl.CaptureRadius * 2, GameConfig.Balance.PortControl.CaptureRadius * 2)
	ring.CFrame = CFrame.new(port.position + Vector3.new(0, 0.15, 0)) * CFrame.Angles(0, 0, math.rad(90))
	ring.Material = Enum.Material.Neon
	ring.Color = Color3.fromRGB(255, 207, 92)
	ring.Transparency = 0.88
	ring.Parent = model
end

function PortControlService:capturePort(portName, player, reason)
	local state = self.portState[portName]
	if not state or state.ownerUserId == player.UserId then
		return
	end

	state.ownerUserId = player.UserId
	state.ownerName = player.Name
	self.profileService:addGold(player, GameConfig.Balance.PortControl.CaptureRewardGold)
	self.shipService:sendHUD(player)
	self:broadcast()
	self.remotes.Notify:FireAllClients(("%s captured %s%s."):format(player.Name, portName, reason and (" by " .. reason) or ""))
end

function PortControlService:updateCapture()
	for _, port in ipairs(GameConfig.World.Ports) do
		local contenders = {}
		for _, player in ipairs(Players:GetPlayers()) do
			local ship = self.shipService:getPlayerShip(player)
			if ship and not ship.model:GetAttribute("Sunk") then
				local distance = (ship.root.Position - port.position).Magnitude
				if distance <= GameConfig.Balance.PortControl.CaptureRadius then
					table.insert(contenders, player)
				end
			end
		end

		if #contenders == 1 then
			local player = contenders[1]
			local key = port.name .. ":" .. player.UserId
			self.captureProgress[key] = (self.captureProgress[key] or 0) + 1
			if self.captureProgress[key] >= GameConfig.Balance.PortControl.CaptureSeconds then
				self.captureProgress = {}
				self:capturePort(port.name, player, "holding the harbor")
			end
		elseif #contenders ~= 1 then
			for key in pairs(self.captureProgress) do
				if string.find(key, port.name .. ":", 1, true) == 1 then
					self.captureProgress[key] = nil
				end
			end
		end
	end
end

function PortControlService:broadcast()
	local snapshot = {}
	for name, state in pairs(self.portState) do
		snapshot[name] = state
	end
	self.remotes.PortState:FireAllClients(snapshot)
end

return PortControlService
