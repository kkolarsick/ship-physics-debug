local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)

local ModeratorService = {}
ModeratorService.__index = ModeratorService

function ModeratorService.new(shipService, merchantService, remotes)
	return setmetatable({
		shipService = shipService,
		merchantService = merchantService,
		remotes = remotes,
		activeEvent = nil,
	}, ModeratorService)
end

function ModeratorService:isModerator(player)
	return GameConfig.Moderation.ModeratorUserIds[player.UserId] == true
end

function ModeratorService:start()
	self.remotes.ModeratorCommand.OnServerEvent:Connect(function(player, command, payload)
		if not self:isModerator(player) then
			self.remotes.Notify:FireClient(player, "Moderator tools are locked.")
			return
		end
		self:runCommand(player, command, payload)
	end)

	Players.PlayerAdded:Connect(function(player)
		task.defer(function()
			self:sendState(player)
		end)
	end)
end

function ModeratorService:sendState(player)
	self.remotes.ModeratorState:FireClient(player, {
		isModerator = self:isModerator(player),
		activeEvent = self.activeEvent,
	})
end

function ModeratorService:broadcastEvent()
	self.shipService.activeEvent = self.activeEvent
	self.remotes.EventState:FireAllClients(self.activeEvent)
	for _, player in ipairs(Players:GetPlayers()) do
		self:sendState(player)
	end
end

function ModeratorService:startEvent(kind)
	self.activeEvent = {
		kind = kind,
		startedAt = os.time(),
		endsAt = os.time() + GameConfig.Moderation.EventDuration,
	}
	self:broadcastEvent()

	task.delay(GameConfig.Moderation.EventDuration, function()
		if self.activeEvent and self.activeEvent.kind == kind then
			self.activeEvent = nil
			self:broadcastEvent()
		end
	end)
end

function ModeratorService:toggleCruise(player)
	local ship = self.shipService:getPlayerShip(player)
	if not ship then
		return
	end
	local enabled = not ship.model:GetAttribute("ModeratorCruise")
	ship.model:SetAttribute("ModeratorCruise", enabled)
	if enabled then
		ship.model:SetAttribute("OriginalMaxHP", ship.model:GetAttribute("MaxHP"))
		ship.model:SetAttribute("MaxHP", 999999)
	else
		ship.model:SetAttribute("MaxHP", ship.model:GetAttribute("OriginalMaxHP") or ship.model:GetAttribute("MaxHP"))
	end
	ship.model:SetAttribute("HP", ship.model:GetAttribute("MaxHP"))
	self.shipService:sendHUD(player)
	self.remotes.Notify:FireClient(player, if enabled then "Moderator cruise enabled." else "Moderator cruise disabled.")
end

function ModeratorService:runCommand(player, command)
	if command == "toggleCruise" then
		self:toggleCruise(player)
	elseif command == "goldRush" then
		self:startEvent("GoldRush")
		self.remotes.Notify:FireAllClients("Gold Rush event started: merchants pay double gold.")
	elseif command == "merchantConvoy" then
		self:startEvent("MerchantConvoy")
		self.merchantService:spawnConvoy(3)
		self.remotes.Notify:FireAllClients("Merchant Convoy event started: extra ships on the water.")
	elseif command == "endEvent" then
		self.activeEvent = nil
		self:broadcastEvent()
		self.remotes.Notify:FireAllClients("The live event has ended.")
	end
end

return ModeratorService
