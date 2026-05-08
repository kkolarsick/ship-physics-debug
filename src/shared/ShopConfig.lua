local ShopConfig = {}

ShopConfig.Products = {
	GoldSmall = {
		id = "gold_small",
		name = "Coin Pouch",
		description = "Enough gold for early upgrades.",
		kind = "currency",
		currency = "robux",
		productId = 0,
		grant = { gold = 750 },
	},
	GoldLarge = {
		id = "gold_large",
		name = "Treasure Chest",
		description = "A bigger boost for ship building.",
		kind = "currency",
		currency = "robux",
		productId = 0,
		grant = { gold = 3000 },
	},
	StormSails = {
		id = "storm_sails",
		name = "Storm Sails",
		description = "Permanent sail cosmetic with a speed upgrade included.",
		kind = "bundle",
		currency = "robux",
		productId = 0,
		grant = {
			cosmetics = { "storm" },
			upgrade = { key = "speed", levels = 1 },
		},
	},
	CannonKit = {
		id = "cannon_kit",
		name = "Cannon Upgrade Kit",
		description = "One permanent cannon damage level for the active ship.",
		kind = "upgrade",
		currency = "robux",
		productId = 0,
		grant = {
			upgrade = { key = "cannons", levels = 1 },
		},
	},
	SailKit = {
		id = "sail_kit",
		name = "Sail Upgrade Kit",
		description = "One permanent sail speed level for the active ship.",
		kind = "upgrade",
		currency = "robux",
		productId = 0,
		grant = {
			upgrade = { key = "speed", levels = 1 },
		},
	},
}

ShopConfig.GoldItems = {
	PirateFlag = {
		id = "flag_pirate",
		name = "Pirate Flag",
		description = "Classic black pirate flag.",
		kind = "flag",
		price = 275,
		flagId = "pirate",
	},
	UsaFlag = {
		id = "flag_usa",
		name = "USA Flag",
		description = "Stars and stripes for your mast.",
		kind = "flag",
		price = 275,
		flagId = "usa",
	},
	UnitedKingdomFlag = {
		id = "flag_uk",
		name = "United Kingdom Flag",
		description = "Union flag for your ship.",
		kind = "flag",
		price = 275,
		flagId = "uk",
	},
	FranceFlag = {
		id = "flag_france",
		name = "France Flag",
		description = "Blue, white, and red tricolor.",
		kind = "flag",
		price = 275,
		flagId = "france",
	},
	SpainFlag = {
		id = "flag_spain",
		name = "Spain Flag",
		description = "Red and gold naval colors.",
		kind = "flag",
		price = 275,
		flagId = "spain",
	},
	Flag67 = {
		id = "flag_67",
		name = "67 Flag",
		description = "Bold 67 battle flag.",
		kind = "flag",
		price = 350,
		flagId = "flag67",
	},
	Flag41 = {
		id = "flag_41",
		name = "41 Flag",
		description = "Bold 41 battle flag.",
		kind = "flag",
		price = 350,
		flagId = "flag41",
	},
	CrimsonHull = {
		id = "crimson_hull",
		name = "Crimson Corsair Skin",
		description = "Red hull, black sails, gold trim.",
		kind = "cosmetic",
		price = 500,
		cosmeticId = "crimson",
	},
	RoyalHull = {
		id = "royal_hull",
		name = "Royal Navy Skin",
		description = "Blue hull and bright white sails.",
		kind = "cosmetic",
		price = 650,
		cosmeticId = "royal",
	},
	HullUpgrade = {
		id = "upgrade_hull",
		name = "Reinforced Hull",
		description = "More ship HP. Max level 5.",
		kind = "upgrade",
		price = 450,
		upgradeKey = "hull",
		maxLevel = 5,
	},
	CannonUpgrade = {
		id = "upgrade_cannons",
		name = "Heavier Cannons",
		description = "More cannon damage. Max level 5.",
		kind = "upgrade",
		price = 525,
		upgradeKey = "cannons",
		maxLevel = 5,
	},
	SailUpgrade = {
		id = "upgrade_speed",
		name = "Fast Sails",
		description = "More ship speed. Max level 5.",
		kind = "upgrade",
		price = 550,
		upgradeKey = "speed",
		maxLevel = 5,
	},
	CrewUpgrade = {
		id = "upgrade_crew",
		name = "Veteran Crew",
		description = "More defenders during boarding. Max level 5.",
		kind = "upgrade",
		price = 400,
		upgradeKey = "crew",
		maxLevel = 5,
	},
}

ShopConfig.Flags = {
	default = {
		id = "default",
		name = "Plain Pennant",
		background = { r = 236, g = 232, b = 214 },
		accent = { r = 93, g = 54, b = 31 },
		text = "",
	},
	pirate = {
		id = "pirate",
		name = "Pirate Flag",
		background = { r = 8, g = 8, b = 10 },
		accent = { r = 245, g = 245, b = 235 },
		text = "JOLLY",
	},
	usa = {
		id = "usa",
		name = "USA Flag",
		background = { r = 178, g = 34, b = 52 },
		accent = { r = 60, g = 59, b = 110 },
		text = "USA",
	},
	uk = {
		id = "uk",
		name = "United Kingdom Flag",
		background = { r = 1, g = 33, b = 105 },
		accent = { r = 200, g = 16, b = 46 },
		text = "UK",
	},
	france = {
		id = "france",
		name = "France Flag",
		background = { r = 0, g = 85, b = 164 },
		accent = { r = 239, g = 65, b = 53 },
		text = "FR",
	},
	spain = {
		id = "spain",
		name = "Spain Flag",
		background = { r = 198, g = 11, b = 30 },
		accent = { r = 255, g = 196, b = 0 },
		text = "ES",
	},
	flag67 = {
		id = "flag67",
		name = "67 Flag",
		background = { r = 20, g = 20, b = 24 },
		accent = { r = 255, g = 209, b = 83 },
		text = "67",
	},
	flag41 = {
		id = "flag41",
		name = "41 Flag",
		background = { r = 20, g = 20, b = 24 },
		accent = { r = 113, g = 207, b = 222 },
		text = "41",
	},
}

ShopConfig.Cosmetics = {
	default = {
		id = "default",
		name = "Classic Sloop",
		hullColor = { r = 93, g = 54, b = 31 },
		sailColor = { r = 236, g = 232, b = 214 },
		trimColor = { r = 214, g = 156, b = 62 },
	},
	crimson = {
		id = "crimson",
		name = "Crimson Corsair",
		hullColor = { r = 126, g = 28, b = 34 },
		sailColor = { r = 28, g = 26, b = 31 },
		trimColor = { r = 235, g = 184, b = 85 },
	},
	royal = {
		id = "royal",
		name = "Royal Navy",
		hullColor = { r = 35, g = 72, b = 132 },
		sailColor = { r = 245, g = 245, b = 232 },
		trimColor = { r = 239, g = 209, b = 119 },
	},
	storm = {
		id = "storm",
		name = "Storm Sails",
		hullColor = { r = 45, g = 49, b = 61 },
		sailColor = { r = 76, g = 96, b = 124 },
		trimColor = { r = 113, g = 207, b = 222 },
	},
}

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

function ShopConfig.findProductByProductId(productId)
	for _, item in pairs(ShopConfig.Products) do
		if item.productId == productId then
			return item
		end
	end
	return nil
end

function ShopConfig.findProduct(itemId)
	for _, item in pairs(ShopConfig.Products) do
		if item.id == itemId then
			return item
		end
	end
	return nil
end

return ShopConfig
