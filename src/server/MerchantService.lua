local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local MerchantService = {}
MerchantService.__index = MerchantService

function MerchantService.new(shipService)
	return setmetatable({
		shipService = shipService,
		merchants = {},
	}, MerchantService)
end

function MerchantService:merchantRecipe(index)
	local recipe = RecipeUtil.defaultRecipe()
	recipe.id = "merchant_" .. index
	recipe.displayName = "Merchant Brig"
	recipe.design.hullColor = { r = 111, g = 76, b = 42 }
	recipe.design.sailColor = { r = 232, g = 220, b = 174 }
	recipe.upgrades.hull = 1
	recipe.upgrades.speed = 1
	recipe.upgrades.cannons = 1
	return recipe
end

function MerchantService:spawn(index)
	local route = GameConfig.World.MerchantRoutes[((index - 1) % #GameConfig.World.MerchantRoutes) + 1]
	local ship = self.shipService:spawnMerchant("Merchant_" .. index, self:merchantRecipe(index), CFrame.new(route[1], route[2]))
	self.merchants[ship.id] = {
		ship = ship,
		route = route,
		waypoint = 2,
		index = index,
	}
	return ship
end

function MerchantService:spawnConvoy(count)
	local start = GameConfig.Balance.Merchants.Count + 1
	for index = start, start + count - 1 do
		self:spawn(index)
	end
end

function MerchantService:start()
	for index = 1, GameConfig.Balance.Merchants.Count do
		self:spawn(index)
	end

	self.shipService:onShipSunk(function(ship)
		local merchant = self.merchants[ship.id]
		if merchant then
			self.merchants[ship.id] = nil
			task.delay(GameConfig.Balance.Merchants.RespawnDelay, function()
				self:spawn(merchant.index)
			end)
		end
	end)

	task.spawn(function()
		while true do
			task.wait(0.25)
			for _, merchant in pairs(self.merchants) do
				local ship = merchant.ship
				if ship.root.Parent and not ship.model:GetAttribute("Sunk") then
					local goal = merchant.route[merchant.waypoint]
					local offset = goal - ship.root.Position
					local flat = Vector3.new(offset.X, 0, offset.Z)
					if flat.Magnitude < GameConfig.Balance.Merchants.RouteArriveDistance then
						merchant.waypoint = (merchant.waypoint % #merchant.route) + 1
					else
						ship.aiTargetPosition = goal
						ship.input.throttle = 1
						ship.input.turn = 0
						ship.input.last = os.clock()
					end
				end
			end
		end
	end)
end

return MerchantService
