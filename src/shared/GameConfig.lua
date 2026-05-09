local GameConfig = {}

GameConfig.DataStore = {
	ProfileName = "PirateShipPvP_Profile_v1",
	SaveInterval = 60,
}

GameConfig.Moderation = {
	ModeratorUserIds = {
		-- Add Roblox user ids here, for example: [123456789] = true
	},
	CruiseSpeed = 95,
	EventDuration = 300,
}

GameConfig.World = {
	WaterY = 0,
	SpawnHeight = 6,
	Ports = {
		{ name = "Port Royal", position = Vector3.new(0, 4, 0), spawnPosition = Vector3.new(0, 6, 150), theme = "capital" },
		{ name = "Tortuga", position = Vector3.new(650, 4, -320), spawnPosition = Vector3.new(560, 6, -205), theme = "pirate" },
		{ name = "Kingston", position = Vector3.new(-540, 4, 420), spawnPosition = Vector3.new(-430, 6, 520), theme = "navy" },
		{ name = "Emerald Cay", position = Vector3.new(360, 4, 520), spawnPosition = Vector3.new(470, 6, 610), theme = "jungle" },
		{ name = "Skull Reef", position = Vector3.new(-720, 4, -220), spawnPosition = Vector3.new(-610, 6, -115), theme = "pirate" },
		{ name = "Sunspire Atoll", position = Vector3.new(110, 4, -700), spawnPosition = Vector3.new(230, 6, -610), theme = "temple" },
		{ name = "Frosthook Harbor", position = Vector3.new(820, 4, 210), spawnPosition = Vector3.new(700, 6, 305), theme = "navy" },
		{ name = "Ruby Lagoon", position = Vector3.new(-230, 4, 790), spawnPosition = Vector3.new(-100, 6, 700), theme = "market" },
	},
	MerchantRoutes = {
		{
			Vector3.new(-460, 6, -260),
			Vector3.new(120, 6, -420),
			Vector3.new(520, 6, -120),
			Vector3.new(180, 6, 260),
		},
		{
			Vector3.new(420, 6, 380),
			Vector3.new(-160, 6, 300),
			Vector3.new(-520, 6, -80),
			Vector3.new(-120, 6, -360),
		},
	},
}

GameConfig.Ships = {
	DefaultRecipe = {
		id = "sloop_basic",
		displayName = "Basic Sloop",
		design = {
			hullColor = { r = 93, g = 54, b = 31 },
			sailColor = { r = 236, g = 232, b = 214 },
			length = 32,
			width = 12,
			mastCount = 1,
			cannonPairs = 2,
		},
		upgrades = {
			hull = 1,
			speed = 1,
			cannons = 1,
			cannonSlots = 1,
			crew = 1,
		},
	},
	PrizePrefix = "Prize",
}

GameConfig.Balance = {
	Progression = {
		MerchantMilestoneEvery = 5,
		MerchantMilestoneBonusGold = 350,
		CaptureRewardGold = 500,
	},
	Camera = {
		FollowDistance = 58,
		FollowHeight = 31,
		LookAhead = 42,
		Smoothing = 0.08,
	},
	Ship = {
		BaseHP = 300,
		HullHPPerLevel = 70,
		BaseSpeed = 58,
		SpeedPerLevel = 8,
		TurnTorque = 85000,
		LinearForce = 250000,
		MaxInputAge = 0.45,
		SinkDelay = 5,
		RespawnDelay = 4,
	},
	Cannons = {
		Cooldown = 1.7,
		BallSpeed = 180,
		BallLifetime = 4,
		Damage = 34,
		DamagePerLevel = 10,
		PoolSize = 48,
		Range = 620,
		SpawnSideOffset = 8,
		MaxPairsPerSide = 6,
		HitDebounce = 0.2,
		MuzzleFlashSeconds = 0.16,
		HitBurstSeconds = 0.45,
	},
	Targeting = {
		LockRange = 420,
		ReticleRange = 720,
	},
	Merchants = {
		Count = 3,
		HP = 180,
		Speed = 32,
		GoldReward = 120,
		EventGoldMultiplier = 2,
		RouteArriveDistance = 28,
		RespawnDelay = 10,
	},
	PortControl = {
		CaptureRadius = 95,
		CaptureSeconds = 12,
		CaptureRewardGold = 300,
		PvpSinkRewardGold = 250,
	},
	GhostShip = {
		SpawnInterval = 150,
		SpawnChance = 0.22,
		ActiveSeconds = 90,
		HP = 999999,
		Speed = 82,
		AttackRange = 80,
		GoldLossPercent = 0.1,
	},
	IslandActivities = {
		TreasureCooldown = 120,
		TreasureMinGold = 80,
		TreasureMaxGold = 220,
		VillagerHP = 100,
		VillagerReturnDamage = 12,
		VillagerReturnRange = 60,
	},
	Gear = {
		CutlassDamage = 22,
		PistolDamage = 28,
		PistolCooldown = 1.25,
		MeleeRange = 9,
		PistolRange = 80,
		PlayerPvpDamageScale = 0.65,
	},
	Boarding = {
		DefenderHpPercentThreshold = 0.5,
		GrappleRange = 70,
		ChannelSeconds = 5,
		ArenaSpacing = 900,
		CrewBase = 4,
		CrewPerLevel = 1,
		CrewHP = 80,
		CrewDamage = 10,
		CrewAttackCooldown = 1.25,
		PlayerArenaHP = 160,
		ResolveTimeout = 90,
	},
}

GameConfig.Input = {
	ThrottleStep = 1,
	MaxThrottle = 1,
	MinThrottle = -0.35,
	MaxTurn = 1,
}

return GameConfig
