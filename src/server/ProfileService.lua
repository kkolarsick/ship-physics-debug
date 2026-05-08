local DataStoreService = game:GetService("DataStoreService")

local GameConfig = require(game:GetService("ReplicatedStorage").Shared.GameConfig)
local RecipeUtil = require(game:GetService("ReplicatedStorage").Shared.RecipeUtil)

local ProfileService = {}
ProfileService.__index = ProfileService

local store = DataStoreService:GetDataStore(GameConfig.DataStore.ProfileName)

local function newProfile()
	return {
		gold = 250,
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
	profile.gold = tonumber(profile.gold) or 0
	profile.activeShipIndex = math.clamp(tonumber(profile.activeShipIndex) or 1, 1, #profile.ships)

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

function ProfileService:addGold(player, amount)
	local profile = self:get(player)
	if not profile then
		return
	end
	profile.gold += amount
	self.dirty[player] = true
end

function ProfileService:addShipRecipe(player, recipe)
	local profile = self:get(player)
	if not profile then
		return
	end
	table.insert(profile.ships, RecipeUtil.deepCopy(recipe))
	self.dirty[player] = true
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
