local ReplicatedStorage = game:GetService("ReplicatedStorage")

local GameConfig = require(ReplicatedStorage.Shared.GameConfig)
local RecipeUtil = require(ReplicatedStorage.Shared.RecipeUtil)

local CaptureService = {}
CaptureService.__index = CaptureService

function CaptureService.new(profileService, shipService)
	return setmetatable({
		profileService = profileService,
		shipService = shipService,
	}, CaptureService)
end

function CaptureService:capture(winnerPlayer, defenderShip)
	if not winnerPlayer or not defenderShip then
		return
	end

	local capturedRecipe = RecipeUtil.prizeFromRecipe(defenderShip.recipe)
	self.profileService:addShipRecipe(winnerPlayer, capturedRecipe)
	self.profileService:addCapture(winnerPlayer)
	self.profileService:addGold(winnerPlayer, GameConfig.Balance.Progression.CaptureRewardGold)
	self.shipService:spawnPrizeShip(winnerPlayer, capturedRecipe, defenderShip.root.Position)
end

return CaptureService
