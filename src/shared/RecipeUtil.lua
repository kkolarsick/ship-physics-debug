local GameConfig = require(script.Parent.GameConfig)

local RecipeUtil = {}

local function copyValue(value)
	if typeof(value) ~= "table" then
		return value
	end

	local result = {}
	for key, child in pairs(value) do
		result[key] = copyValue(child)
	end
	return result
end

function RecipeUtil.deepCopy(recipe)
	return copyValue(recipe)
end

function RecipeUtil.defaultRecipe()
	return RecipeUtil.deepCopy(GameConfig.Ships.DefaultRecipe)
end

function RecipeUtil.prizeFromRecipe(recipe)
	local prize = RecipeUtil.deepCopy(recipe)
	prize.id = ("%s_%d"):format(recipe.id or "ship", os.time())
	prize.displayName = ("%s %s"):format(GameConfig.Ships.PrizePrefix, recipe.displayName or "Ship")
	prize.capturedAt = os.time()
	return prize
end

function RecipeUtil.color3FromTable(value)
	if typeof(value) == "Color3" then
		return value
	end

	value = value or { r = 255, g = 255, b = 255 }
	return Color3.fromRGB(value.r or 255, value.g or 255, value.b or 255)
end

function RecipeUtil.maxHP(recipe)
	local upgrades = recipe.upgrades or {}
	return GameConfig.Balance.Ship.BaseHP + ((upgrades.hull or 1) - 1) * GameConfig.Balance.Ship.HullHPPerLevel
end

function RecipeUtil.maxSpeed(recipe)
	local upgrades = recipe.upgrades or {}
	return GameConfig.Balance.Ship.BaseSpeed + ((upgrades.speed or 1) - 1) * GameConfig.Balance.Ship.SpeedPerLevel
end

function RecipeUtil.cannonDamage(recipe)
	local upgrades = recipe.upgrades or {}
	return GameConfig.Balance.Cannons.Damage + ((upgrades.cannons or 1) - 1) * GameConfig.Balance.Cannons.DamagePerLevel
end

function RecipeUtil.crewCount(recipe)
	local upgrades = recipe.upgrades or {}
	return GameConfig.Balance.Boarding.CrewBase + ((upgrades.crew or 1) - 1) * GameConfig.Balance.Boarding.CrewPerLevel
end

return RecipeUtil
