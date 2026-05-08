local DataStoreService = game:GetService("DataStoreService")

local GameConfig = require(game:GetService("ReplicatedStorage").Shared.GameConfig)
local RecipeUtil = require(game:GetService("ReplicatedStorage").Shared.RecipeUtil)
local ShopConfig = require(game:GetService("ReplicatedStorage").Shared.ShopConfig)

local ProfileService = {}
ProfileService.__index = ProfileService

local store = DataStoreService:GetDataStore(GameConfig.DataStore.ProfileName)

local function newProfile()
	return {
		gold = 250,
		totalGoldEarned = 250,
		merchantSinks = 0,
		captures = 0,
		equippedCosmetic = "default",
		equippedFlag = "default",
		ownedCosmetics = {
			default = true,
		},
		ownedFlags = {
			default = true,
		},
		purchaseHistory = {},
		activeShipIndex = 1,
		ships = {
			RecipeUtil.defaultRecipe(),
		},
	}
end

function ProfileService.new()
	return setmetatable({
		profiles = {},
		dirty = {},
	}, ProfileService)
end

function ProfileService:load(player)
	local key = "player_" .. player.UserId
	local ok, data = pcall(function()
		return store:GetAsync(key)
	end)

	local profile = if ok and typeof(data) == "table" then data else newProfile()
	if typeof(profile.ships) ~= "table" or #profile.ships == 0 then
		profile.ships = { RecipeUtil.defaultRecipe() }
	end
	profile.ownedCosmetics = if typeof(profile.ownedCosmetics) == "table" then profile.ownedCosmetics else { default = true }
	profile.ownedCosmetics.default = true
	profile.ownedFlags = if typeof(profile.ownedFlags) == "table" then profile.ownedFlags else { default = true }
	profile.ownedFlags.default = true
	profile.purchaseHistory = if typeof(profile.purchaseHistory) == "table" then profile.purchaseHistory else {}
	profile.equippedCosmetic = profile.equippedCosmetic or "default"
	profile.equippedFlag = profile.equippedFlag or "default"
	profile.gold = tonumber(profile.gold) or 0
	profile.totalGoldEarned = tonumber(profile.totalGoldEarned) or profile.gold
	profile.merchantSinks = tonumber(profile.merchantSinks) or 0
	profile.captures = tonumber(profile.captures) or 0
	profile.activeShipIndex = math.clamp(tonumber(profile.activeShipIndex) or 1, 1, #profile.ships)
	for _, recipe in ipairs(profile.ships) do
		recipe.upgrades = recipe.upgrades or {}
		recipe.upgrades.hull = tonumber(recipe.upgrades.hull) or 1
		recipe.upgrades.speed = tonumber(recipe.upgrades.speed) or 1
		recipe.upgrades.cannons = tonumber(recipe.upgrades.cannons) or 1
		recipe.upgrades.crew = tonumber(recipe.upgrades.crew) or 1
		if not recipe.cosmeticId then
			RecipeUtil.applyCosmetic(recipe, profile.equippedCosmetic)
		end
		if not recipe.flagId then
			RecipeUtil.applyFlag(recipe, profile.equippedFlag)
		end
	end

	self.profiles[player] = profile
	self.dirty[player] = false
	return profile
end

function ProfileService:get(player)
	return self.profiles[player]
end

function ProfileService:getActiveRecipe(player)
	local profile = self:get(player)
	if not profile then
		return RecipeUtil.defaultRecipe()
	end
	return profile.ships[profile.activeShipIndex] or profile.ships[1] or RecipeUtil.defaultRecipe()
end

function ProfileService:getSnapshot(player)
	local profile = self:get(player)
	if not profile then
		return nil
	end
	local recipe = self:getActiveRecipe(player)
	return {
		gold = profile.gold,
		totalGoldEarned = profile.totalGoldEarned,
		merchantSinks = profile.merchantSinks,
		captures = profile.captures,
		equippedCosmetic = profile.equippedCosmetic,
		equippedFlag = profile.equippedFlag,
		ownedCosmetics = profile.ownedCosmetics,
		ownedFlags = profile.ownedFlags,
		activeUpgrades = recipe.upgrades,
		products = ShopConfig.productsList(),
		goldItems = ShopConfig.goldItemsList(),
	}
end

function ProfileService:addGold(player, amount, countsAsEarned)
	local profile = self:get(player)
	if not profile then
		return
	end
	profile.gold += amount
	if amount > 0 and countsAsEarned ~= false then
		profile.totalGoldEarned += amount
	end
	self.dirty[player] = true
end

function ProfileService:spendGold(player, amount)
	local profile = self:get(player)
	if not profile or profile.gold < amount then
		return false
	end
	profile.gold -= amount
	self.dirty[player] = true
	return true
end

function ProfileService:removeGoldPercent(player, percent)
	local profile = self:get(player)
	if not profile then
		return 0
	end
	local loss = math.floor(profile.gold * percent)
	profile.gold = math.max(0, profile.gold - loss)
	self.dirty[player] = true
	return loss
end

function ProfileService:addShipRecipe(player, recipe)
	local profile = self:get(player)
	if not profile then
		return
	end
	table.insert(profile.ships, RecipeUtil.deepCopy(recipe))
	self.dirty[player] = true
end

function ProfileService:addMerchantSink(player)
	local profile = self:get(player)
	if not profile then
		return 0
	end
	profile.merchantSinks += 1
	self.dirty[player] = true
	return profile.merchantSinks
end

function ProfileService:addCapture(player)
	local profile = self:get(player)
	if not profile then
		return 0
	end
	profile.captures += 1
	self.dirty[player] = true
	return profile.captures
end

function ProfileService:grantCosmetic(player, cosmeticId)
	local profile = self:get(player)
	if not profile or not ShopConfig.Cosmetics[cosmeticId] then
		return false
	end
	profile.ownedCosmetics[cosmeticId] = true
	self.dirty[player] = true
	return true
end

function ProfileService:grantFlag(player, flagId)
	local profile = self:get(player)
	if not profile or not ShopConfig.Flags[flagId] then
		return false
	end
	profile.ownedFlags[flagId] = true
	self.dirty[player] = true
	return true
end

function ProfileService:equipCosmetic(player, cosmeticId)
	local profile = self:get(player)
	if not profile or not profile.ownedCosmetics[cosmeticId] then
		return false
	end
	profile.equippedCosmetic = cosmeticId
	local recipe = self:getActiveRecipe(player)
	RecipeUtil.applyCosmetic(recipe, cosmeticId)
	self.dirty[player] = true
	return true
end

function ProfileService:equipFlag(player, flagId)
	local profile = self:get(player)
	if not profile or not profile.ownedFlags[flagId] then
		return false
	end
	profile.equippedFlag = flagId
	local recipe = self:getActiveRecipe(player)
	RecipeUtil.applyFlag(recipe, flagId)
	self.dirty[player] = true
	return true
end

function ProfileService:upgradeActiveShip(player, upgradeKey, levels, maxLevel)
	local recipe = self:getActiveRecipe(player)
	recipe.upgrades = recipe.upgrades or {}
	local current = tonumber(recipe.upgrades[upgradeKey]) or 1
	local nextLevel = math.min(maxLevel or 5, current + (levels or 1))
	if nextLevel <= current then
		return false
	end
	recipe.upgrades[upgradeKey] = nextLevel
	self.dirty[player] = true
	return true
end

function ProfileService:markPurchase(player, purchaseId)
	local profile = self:get(player)
	if not profile then
		return false
	end
	if profile.purchaseHistory[purchaseId] then
		return false
	end
	profile.purchaseHistory[purchaseId] = os.time()
	self.dirty[player] = true
	return true
end

function ProfileService:save(player)
	local profile = self.profiles[player]
	if not profile then
		return
	end

	local key = "player_" .. player.UserId
	local ok, err = pcall(function()
		store:SetAsync(key, profile)
	end)
	if ok then
		self.dirty[player] = false
	else
		warn("[ProfileService] Save failed", player, err)
	end
end

function ProfileService:release(player)
	self:save(player)
	self.profiles[player] = nil
	self.dirty[player] = nil
end

function ProfileService:startAutosave()
	task.spawn(function()
		while true do
			task.wait(GameConfig.DataStore.SaveInterval)
			for player, isDirty in pairs(self.dirty) do
				if isDirty then
					self:save(player)
				end
			end
		end
	end)
end

return ProfileService
