local ShopConfig = {}

ShopConfig.Products = {
	GoldSmall = {
		id = "gold_small",
		name = "Coin Pouch",
		description = "Trial/dev product gold bundle.",
		kind = "currency",
		currency = "robux",
		productId = 0,
		grant = { gold = 750 },
	},
	GoldLarge = {
		id = "gold_large",
		name = "Treasure Chest",
		description = "Trial/dev product gold bundle.",
		kind = "currency",
		currency = "robux",
		productId = 0,
		grant = { gold = 3000 },
	},
}

ShopConfig.GoldItems = {
	Cutlass = { id = "gear_cutlass", name = "Cutlass", description = "Close-range pirate dueling weapon. No blood.", kind = "gear", price = 125, gearId = "cutlass" },
	Pistol = { id = "gear_pistol", name = "Flintlock Pistol", description = "Short cooldown island sidearm. No blood.", kind = "gear", price = 240, gearId = "pistol" },

	PirateFlag = { id = "flag_pirate", name = "Pirate Flag", description = "Classic black pirate flag.", kind = "flag", price = 275, flagId = "pirate" },
	UsaFlag = { id = "flag_usa", name = "USA Flag", description = "Stars and stripes for your mast.", kind = "flag", price = 275, flagId = "usa" },
	UnitedKingdomFlag = { id = "flag_uk", name = "United Kingdom Flag", description = "Union flag for your ship.", kind = "flag", price = 275, flagId = "uk" },
	FranceFlag = { id = "flag_france", name = "France Flag", description = "Blue, white, and red tricolor.", kind = "flag", price = 275, flagId = "france" },
	SpainFlag = { id = "flag_spain", name = "Spain Flag", description = "Red and gold naval colors.", kind = "flag", price = 275, flagId = "spain" },
	Flag67 = { id = "flag_67", name = "67 Flag", description = "Bold 67 battle flag.", kind = "flag", price = 350, flagId = "flag67" },
	Flag41 = { id = "flag_41", name = "41 Flag", description = "Bold 41 battle flag.", kind = "flag", price = 350, flagId = "flag41" },

	CrimsonHull = { id = "crimson_hull", name = "Crimson Corsair Skin", description = "Red hull, black sails, gold trim.", kind = "cosmetic", price = 500, cosmeticId = "crimson" },
	RoyalHull = { id = "royal_hull", name = "Royal Navy Skin", description = "Blue hull and bright white sails.", kind = "cosmetic", price = 650, cosmeticId = "royal" },

	CannonSlots = { id = "upgrade_cannon_slots", name = "Add Cannon Pair", description = "Adds one cannon per side. Max 6 per side.", kind = "upgrade", price = 350, priceGrowth = 1.55, upgradeKey = "cannonSlots", maxLevel = 6 },
	CannonPower = { id = "upgrade_cannons", name = "Heavier Cannons", description = "More cannon damage. Cost rises each level.", kind = "upgrade", price = 525, priceGrowth = 1.6, upgradeKey = "cannons", maxLevel = 5 },
	SailUpgrade = { id = "upgrade_speed", name = "Fast Sails", description = "More ship speed. Cost rises each level.", kind = "upgrade", price = 550, priceGrowth = 1.55, upgradeKey = "speed", maxLevel = 5 },
	CrewUpgrade = { id = "upgrade_crew", name = "Hire Cannon Crew", description = "Crew helps reload/fire faster. Cost rises each level.", kind = "upgrade", price = 400, priceGrowth = 1.5, upgradeKey = "crew", maxLevel = 5 },
	HullUpgrade = { id = "upgrade_hull", name = "Reinforced Hull", description = "More ship HP. Cost rises each level.", kind = "upgrade", price = 450, priceGrowth = 1.5, upgradeKey = "hull", maxLevel = 5 },
}

ShopConfig.ShipClasses = {
	{ id = "skiff", name = "Skiff", tier = 1, price = 650, length = 30, width = 11, mastCount = 1, cannonSlots = 1, bonus = { hp = 40, speed = 4, cannonDamage = 4 }, colors = { hull = { r = 112, g = 67, b = 36 }, sail = { r = 236, g = 232, b = 214 }, trim = { r = 202, g = 145, b = 68 } } },
	{ id = "schooner", name = "Schooner", tier = 2, price = 1450, length = 34, width = 12, mastCount = 2, cannonSlots = 2, bonus = { hp = 90, speed = 8, cannonDamage = 8 }, colors = { hull = { r = 88, g = 64, b = 43 }, sail = { r = 242, g = 238, b = 220 }, trim = { r = 206, g = 163, b = 83 } } },
	{ id = "cutter", name = "War Cutter", tier = 3, price = 3100, length = 38, width = 13, mastCount = 2, cannonSlots = 2, bonus = { hp = 150, speed = 12, cannonDamage = 13 }, colors = { hull = { r = 91, g = 47, b = 42 }, sail = { r = 226, g = 223, b = 211 }, trim = { r = 223, g = 172, b = 72 } } },
	{ id = "brigantine", name = "Brigantine", tier = 4, price = 6200, length = 44, width = 15, mastCount = 2, cannonSlots = 3, bonus = { hp = 230, speed = 16, cannonDamage = 19 }, colors = { hull = { r = 62, g = 84, b = 88 }, sail = { r = 236, g = 231, b = 205 }, trim = { r = 220, g = 183, b = 93 } } },
	{ id = "corvette", name = "Corsair Corvette", tier = 5, price = 11800, length = 50, width = 16, mastCount = 3, cannonSlots = 3, bonus = { hp = 330, speed = 20, cannonDamage = 26 }, colors = { hull = { r = 43, g = 72, b = 107 }, sail = { r = 240, g = 240, b = 228 }, trim = { r = 233, g = 198, b = 91 } } },
	{ id = "frigate", name = "Battle Frigate", tier = 6, price = 21500, length = 56, width = 18, mastCount = 3, cannonSlots = 4, bonus = { hp = 460, speed = 24, cannonDamage = 34 }, colors = { hull = { r = 47, g = 52, b = 66 }, sail = { r = 230, g = 229, b = 219 }, trim = { r = 229, g = 176, b = 66 } } },
	{ id = "galleon", name = "Treasure Galleon", tier = 7, price = 38000, length = 64, width = 21, mastCount = 3, cannonSlots = 4, bonus = { hp = 620, speed = 27, cannonDamage = 43 }, colors = { hull = { r = 101, g = 61, b = 39 }, sail = { r = 247, g = 239, b = 211 }, trim = { r = 238, g = 190, b = 76 } } },
	{ id = "manowar", name = "Man-of-War", tier = 8, price = 67000, length = 72, width = 23, mastCount = 4, cannonSlots = 5, bonus = { hp = 820, speed = 30, cannonDamage = 54 }, colors = { hull = { r = 28, g = 48, b = 82 }, sail = { r = 245, g = 245, b = 232 }, trim = { r = 236, g = 202, b = 97 } } },
	{ id = "dread_corsair", name = "Dread Corsair", tier = 9, price = 112000, length = 80, width = 25, mastCount = 4, cannonSlots = 6, bonus = { hp = 1060, speed = 34, cannonDamage = 67 }, colors = { hull = { r = 35, g = 31, b = 39 }, sail = { r = 96, g = 26, b = 32 }, trim = { r = 230, g = 176, b = 74 } } },
	{ id = "flagship", name = "Pirate Lord Flagship", tier = 10, price = 185000, length = 90, width = 28, mastCount = 4, cannonSlots = 6, bonus = { hp = 1350, speed = 38, cannonDamage = 82 }, colors = { hull = { r = 16, g = 20, b = 25 }, sail = { r = 20, g = 20, b = 24 }, trim = { r = 255, g = 210, b = 84 } } },
}

for _, shipClass in ipairs(ShopConfig.ShipClasses) do
	ShopConfig.GoldItems["ShipClass_" .. shipClass.id] = {
		id = "ship_class_" .. shipClass.id,
		name = shipClass.name,
		description = ("Tier %d ship class with stronger HP, speed, and cannon damage."):format(shipClass.tier),
		kind = "shipClass",
		price = shipClass.price,
		classId = shipClass.id,
	}
end

ShopConfig.Flags = {
	default = { id = "default", name = "Plain Pennant", background = { r = 236, g = 232, b = 214 }, accent = { r = 93, g = 54, b = 31 }, text = "" },
	pirate = { id = "pirate", name = "Pirate Flag", background = { r = 8, g = 8, b = 10 }, accent = { r = 245, g = 245, b = 235 }, text = "JOLLY" },
	usa = { id = "usa", name = "USA Flag", background = { r = 178, g = 34, b = 52 }, accent = { r = 60, g = 59, b = 110 }, text = "USA" },
	uk = { id = "uk", name = "United Kingdom Flag", background = { r = 1, g = 33, b = 105 }, accent = { r = 200, g = 16, b = 46 }, text = "UK" },
	france = { id = "france", name = "France Flag", background = { r = 0, g = 85, b = 164 }, accent = { r = 239, g = 65, b = 53 }, text = "FR" },
	spain = { id = "spain", name = "Spain Flag", background = { r = 198, g = 11, b = 30 }, accent = { r = 255, g = 196, b = 0 }, text = "ES" },
	flag67 = { id = "flag67", name = "67 Flag", background = { r = 20, g = 20, b = 24 }, accent = { r = 255, g = 209, b = 83 }, text = "67" },
	flag41 = { id = "flag41", name = "41 Flag", background = { r = 20, g = 20, b = 24 }, accent = { r = 113, g = 207, b = 222 }, text = "41" },
}

ShopConfig.Cosmetics = {
	default = { id = "default", name = "Classic Sloop", hullColor = { r = 93, g = 54, b = 31 }, sailColor = { r = 236, g = 232, b = 214 }, trimColor = { r = 214, g = 156, b = 62 } },
	crimson = { id = "crimson", name = "Crimson Corsair", hullColor = { r = 126, g = 28, b = 34 }, sailColor = { r = 28, g = 26, b = 31 }, trimColor = { r = 235, g = 184, b = 85 } },
	royal = { id = "royal", name = "Royal Navy", hullColor = { r = 35, g = 72, b = 132 }, sailColor = { r = 245, g = 245, b = 232 }, trimColor = { r = 239, g = 209, b = 119 } },
	storm = { id = "storm", name = "Storm Sails", hullColor = { r = 45, g = 49, b = 61 }, sailColor = { r = 76, g = 96, b = 124 }, trimColor = { r = 113, g = 207, b = 222 } },
}

function ShopConfig.upgradePrice(item, currentLevel)
	return math.floor(item.price * ((item.priceGrowth or 1) ^ math.max(0, (currentLevel or 1) - 1)))
end

function ShopConfig.goldItemsList()
	local list = {}
	for _, item in pairs(ShopConfig.GoldItems) do
		table.insert(list, item)
	end
	table.sort(list, function(a, b)
		return a.price < b.price
	end)
	return list
end

function ShopConfig.productsList()
	local list = {}
	for _, item in pairs(ShopConfig.Products) do
		table.insert(list, item)
	end
	table.sort(list, function(a, b)
		return a.name < b.name
	end)
	return list
end

function ShopConfig.findGoldItem(itemId)
	for _, item in pairs(ShopConfig.GoldItems) do
		if item.id == itemId then
			return item
		end
	end
	return nil
end

function ShopConfig.findShipClass(classId)
	for _, shipClass in ipairs(ShopConfig.ShipClasses) do
		if shipClass.id == classId then
			return shipClass
		end
	end
	return nil
end

function ShopConfig.findProductByProductId(productId)
	for _, item in pairs(ShopConfig.Products) do
		if item.productId == productId then
			return item
		end
	end
	return nil
end

return ShopConfig
