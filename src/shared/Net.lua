local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Net = {}

Net.RemoteNames = {
	ShipInput = "ShipInput",
	FireCannons = "FireCannons",
	TargetLock = "TargetLock",
	BoardRequest = "BoardRequest",
	HUDUpdate = "HUDUpdate",
	ReticleUpdate = "ReticleUpdate",
	BoardingState = "BoardingState",
	CannonFX = "CannonFX",
	HitFX = "HitFX",
	Notify = "Notify",
}

function Net.getFolder()
	local folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	return folder
end

function Net.getRemote(name)
	local folder = Net.getFolder()
	local remote = folder:FindFirstChild(name)
	if not remote then
		remote = Instance.new("RemoteEvent")
		remote.Name = name
		remote.Parent = folder
	end
	return remote
end

function Net.bootstrap()
	local remotes = {}
	for key, name in pairs(Net.RemoteNames) do
		remotes[key] = Net.getRemote(name)
	end
	return remotes
end

return Net
