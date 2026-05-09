local GameConfig = require(script.Parent.GameConfig)
local ShopConfig = require(script.Parent.ShopConfig)

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

function RecipeUtil.recipeFromShipClass(shipClass, cosmeticId, flagId)
	local recipe = RecipeUtil.defaultRecipe()
	recipe.id = "ship_class_" .. shipClass.id
	recipe.shipClassId = shipClass.id
	recipe.displayName = shipClass.name
	recipe.classTier = shipClass.tier
	recipe.classBonus = RecipeUtil.deepCopy(shipClass.bonus or {})
	recipe.design.length = shipClass.length or recipe.design.length
	recipe.design.width = shipClass.width or recipe.design.width
	recipe.design.mastCount = shipClass.mastCount or recipe.design.mastCount
	recipe.design.cannonPairs = shipClass.cannonSlots or recipe.design.cannonPairs
	recipe.design.hullColor = RecipeUtil.deepCopy(shipClass.colors and shipClass.colors.hull or recipe.design.hullColor)
	recipe.design.sailColor = RecipeUtil.deepCopy(shipClass.colors and shipClass.colors.sail or recipe.design.sailColor)
	recipe.design.trimColor = RecipeUtil.deepCopy(shipClass.colors and shipClass.colors.trim or recipe.design.trimColor)
	recipe.upgrades.cannonSlots = shipClass.cannonSlots or recipe.upgrades.cannonSlots
	recipe.cosmeticId = cosmeticId or "default"
	if recipe.cosmeticId ~= "default" then
		RecipeUtil.applyCosmetic(recipe, recipe.cosmeticId)
	end
	RecipeUtil.applyFlag(recipe, flagId or recipe.flagId or "default")
	return recipe
end

function RecipeUtil.applyCosmetic(recipe, cosmeticId)
	local cosmetic = ShopConfig.Cosmetics[cosmeticId or "default"] or ShopConfig.Cosmetics.default
	recipe.cosmeticId = cosmetic.id
	recipe.design = recipe.design or {}
	recipe.design.hullColor = RecipeUtil.deepCopy(cosmetic.hullColor)
	recipe.design.sailColor = RecipeUtil.deepCopy(cosmetic.sailColor)
	recipe.design.trimColor = RecipeUtil.deepCopy(cosmetic.trimColor)
	return recipe
end

function RecipeUtil.applyFlag(recipe, flagId)
	local flag = ShopConfig.Flags[flagId or "default"] or ShopConfig.Flags.default
	recipe.flagId = flag.id
	return recipe
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

function RecipeUtil.trimColor(recipe)
	local design = recipe.design or {}
	return RecipeUtil.color3FromTable(design.trimColor or { r = 214, g = 156, b = 62 })
end

function RecipeUtil.flagColors(recipe)
	local flag = ShopConfig.Flags[(recipe and recipe.flagId) or "default"] or ShopConfig.Flags.default
	return RecipeUtil.color3FromTable(flag.background), RecipeUtil.color3FromTable(flag.accent), flag.text or ""
end

function RecipeUtil.maxHP(recipe)
	local upgrades = recipe.upgrades or {}
	local classBonus = recipe.classBonus or {}
	return GameConfig.Balance.Ship.BaseHP + (classBonus.hp or 0) + ((upgrades.hull or 1) - 1) * GameConfig.Balance.Ship.HullHPPerLevel
end

function RecipeUtil.maxSpeed(recipe)
	local upgrades = recipe.upgrades or {}
	local classBonus = recipe.classBonus or {}
	return GameConfig.Balance.Ship.BaseSpeed + (classBonus.speed or 0) + ((upgrades.speed or 1) - 1) * GameConfig.Balance.Ship.SpeedPerLevel
end

function RecipeUtil.cannonDamage(recipe)
	local upgrades = recipe.upgrades or {}
	local classBonus = recipe.classBonus or {}
	return GameConfig.Balance.Cannons.Damage + (classBonus.cannonDamage or 0) + ((upgrades.cannons or 1) - 1) * GameConfig.Balance.Cannons.DamagePerLevel
end

function RecipeUtil.cannonPairs(recipe)
	local upgrades = recipe.upgrades or {}
	return math.clamp(tonumber(upgrades.cannonSlots) or 1, 1, GameConfig.Balance.Cannons.MaxPairsPerSide)
end

function RecipeUtil.cannonCooldown(recipe)
	local upgrades = recipe.upgrades or {}
	local crewLevel = tonumber(upgrades.crew) or 1
	return math.max(0.75, GameConfig.Balance.Cannons.Cooldown - (crewLevel - 1) * 0.12)
end

function RecipeUtil.crewCount(recipe)
	local upgrades = recipe.upgrades or {}
	return GameConfig.Balance.Boarding.CrewBase + ((upgrades.crew or 1) - 1) * GameConfig.Balance.Boarding.CrewPerLevel
end

return RecipeUtil
