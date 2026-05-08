local GameConfig = {}

GameConfig.DataStore = {
	ProfileName = "PirateShipPvP_Profile_v1",
	SaveInterval = 60,
}

GameConfig.World = {
	WaterY = 0,
	SpawnHeight = 8,
	Ports = {
		{ name = "Port Royal", position = Vector3.new(0, 4, 0) },
		{ name = "Tortuga", position = Vector3.new(650, 4, -320) },
		{ name = "Kingston", position = Vector3.new(-540, 4, 420) },
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
			crew = 1,
		},
	},
	PrizePrefix = "Prize",
}

GameConfig.Balance = {
	Ship = {
		BaseHP = 300,
		HullHPPerLevel = 70,
		BaseSpeed = 58,
		SpeedPerLevel = 8,
		TurnTorque = 85000,
		LinearForce = 55000,
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
		SpawnForwardOffsets = { -9, 9 },
		HitDebounce = 0.2,
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
		RouteArriveDistance = 28,
		RespawnDelay = 10,
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
