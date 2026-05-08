local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ShopConfig = require(ReplicatedStorage.Shared.ShopConfig)

local ShopService = {}
ShopService.__index = ShopService

function ShopService.new(profileService, shipService, remotes)
	return setmetatable({
		profileService = profileService,
		shipService = shipService,
		remotes = remotes,
	}, ShopService)
end

function ShopService:start()
	self.remotes.ShopPurchase.OnServerEvent:Connect(function(player, itemId)
		self:buyGoldItem(player, itemId)
	end)

	self.remotes.EquipCosmetic.OnServerEvent:Connect(function(player, cosmeticId)
		self:equipCosmetic(player, cosmeticId)
	end)

	self.remotes.EquipFlag.OnServerEvent:Connect(function(player, flagId)
		self:equipFlag(player, flagId)
	end)

	MarketplaceService.ProcessReceipt = function(receiptInfo)
		return self:processReceipt(receiptInfo)
	end
end

function ShopService:sendState(player)
	local snapshot = self.profileService:getSnapshot(player)
	if snapshot then
		self.remotes.ShopState:FireClient(player, snapshot)
	end
end

function ShopService:buyGoldItem(player, itemId)
	local item = ShopConfig.findGoldItem(itemId)
	if not item then
		return
	end

	if item.kind == "cosmetic" then
		local profile = self.profileService:get(player)
		if profile and profile.ownedCosmetics[item.cosmeticId] then
			self.profileService:equipCosmetic(player, item.cosmeticId)
			self.shipService:refreshPlayerShip(player)
			self.remotes.Notify:FireClient(player, "Already owned. Skin equipped.")
			self:sendState(player)
			return
		end
		if not self.profileService:spendGold(player, item.price) then
			self.remotes.Notify:FireClient(player, "Not enough gold.")
			return
		end
		self.profileService:grantCosmetic(player, item.cosmeticId)
		self.profileService:equipCosmetic(player, item.cosmeticId)
		self.shipService:refreshPlayerShip(player)
		self.remotes.Notify:FireClient(player, item.name .. " equipped.")
	elseif item.kind == "flag" then
		local profile = self.profileService:get(player)
		if profile and profile.ownedFlags[item.flagId] then
			self.profileService:equipFlag(player, item.flagId)
			self.shipService:refreshPlayerShip(player)
			self.remotes.Notify:FireClient(player, "Already owned. Flag raised.")
			self:sendState(player)
			return
		end
		if not self.profileService:spendGold(player, item.price) then
			self.remotes.Notify:FireClient(player, "Not enough gold.")
			return
		end
		self.profileService:grantFlag(player, item.flagId)
		self.profileService:equipFlag(player, item.flagId)
		self.shipService:refreshPlayerShip(player)
		self.remotes.Notify:FireClient(player, item.name .. " raised.")
	elseif item.kind == "upgrade" then
		if not self.profileService:spendGold(player, item.price) then
			self.remotes.Notify:FireClient(player, "Not enough gold.")
			return
		end
		local upgraded = self.profileService:upgradeActiveShip(player, item.upgradeKey, 1, item.maxLevel)
		if not upgraded then
			self.profileService:addGold(player, item.price, false)
			self.remotes.Notify:FireClient(player, "Upgrade already maxed.")
			self.shipService:sendHUD(player)
			self:sendState(player)
			return
		end
		self.shipService:refreshPlayerShip(player)
		self.remotes.Notify:FireClient(player, item.name .. " installed.")
	end

	self.shipService:sendHUD(player)
	self:sendState(player)
end

function ShopService:equipCosmetic(player, cosmeticId)
	if self.profileService:equipCosmetic(player, cosmeticId) then
		self.shipService:refreshPlayerShip(player)
		self.remotes.Notify:FireClient(player, "Ship skin equipped.")
		self:sendState(player)
	end
end

function ShopService:equipFlag(player, flagId)
	if self.profileService:equipFlag(player, flagId) then
		self.shipService:refreshPlayerShip(player)
		self.remotes.Notify:FireClient(player, "Flag raised.")
		self:sendState(player)
	end
end

function ShopService:grantProduct(player, product)
	local grant = product.grant or {}
	if grant.gold then
		self.profileService:addGold(player, grant.gold)
	end
	if grant.cosmetics then
		for _, cosmeticId in ipairs(grant.cosmetics) do
			self.profileService:grantCosmetic(player, cosmeticId)
			self.profileService:equipCosmetic(player, cosmeticId)
		end
	end
	if grant.upgrade then
		self.profileService:upgradeActiveShip(player, grant.upgrade.key, grant.upgrade.levels or 1, 5)
	end
	self.shipService:refreshPlayerShip(player)
	self.shipService:sendHUD(player)
	self:sendState(player)
	self.remotes.Notify:FireClient(player, product.name .. " granted.")
end

function ShopService:processReceipt(receiptInfo)
	local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local product = ShopConfig.findProductByProductId(receiptInfo.ProductId)
	if not product then
		warn("[ShopService] Unknown product id", receiptInfo.ProductId)
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	if self.profileService:markPurchase(player, receiptInfo.PurchaseId) then
		self:grantProduct(player, product)
	end
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

return ShopService
