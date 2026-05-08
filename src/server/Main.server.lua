local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = require(ReplicatedStorage.Shared.Net)

local ProfileService = require(script.Parent.ProfileService)
local WorldService = require(script.Parent.WorldService)
local ShipFactory = require(script.Parent.ShipFactory)
local ShipService = require(script.Parent.ShipService)
local CannonService = require(script.Parent.CannonService)
local MerchantService = require(script.Parent.MerchantService)
local CaptureService = require(script.Parent.CaptureService)
local BoardingService = require(script.Parent.BoardingService)

local remotes = Net.bootstrap()
local profiles = ProfileService.new()
local world = WorldService.new()
local shipFactory = ShipFactory.new(world)
local ships = ShipService.new(shipFactory, world, profiles, remotes)
local cannons = CannonService.new(ships, world, remotes)
local merchants = MerchantService.new(ships)
local capture = CaptureService.new(profiles, ships)
local boarding = BoardingService.new(ships, capture, world, remotes)

world:setup()
profiles:startAutosave()
ships:start()
cannons:start()
merchants:start()
boarding:start()

remotes.ShipInput.OnServerEvent:Connect(function(player, throttle, turn)
	ships:setInput(player, throttle, turn)
end)

remotes.TargetLock.OnServerEvent:Connect(function(player, targetModel)
	ships:setTarget(player, targetModel)
end)

Players.PlayerAdded:Connect(function(player)
	local profile = profiles:load(player)
	local spawnCFrame = world:portSpawnCFrame(Vector3.zero)
	ships:spawnPlayerShip(player, profile.ships[profile.activeShipIndex], spawnCFrame)

	player.CharacterAdded:Connect(function(character)
		local root = character:WaitForChild("HumanoidRootPart", 10)
		local ship = ships:getPlayerShip(player)
		if root and ship then
			root.CFrame = ship.root.CFrame + Vector3.new(0, 8, 0)
		end
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	ships:removePlayer(player)
	profiles:release(player)
end)

game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do
		profiles:save(player)
	end
end)
