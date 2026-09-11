param(
    [Parameter(Mandatory = $true)]
    [string]$ServerHost,

    [Parameter(Mandatory = $false)]
    [string]$ServerUser = "root",

    [Parameter(Mandatory = $false)]
    [string]$ServerPath = "/opt/melissa-ai",

    [Parameter(Mandatory = $false)]
    [string]$SshKeyPath = "",

    [Parameter(Mandatory = $false)]
    [string]$EnvFilePath = ".env.server"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $EnvFilePath)) {
    throw "Env file not found: $EnvFilePath. Create it from .env.server.example"
}

$useKeyAuth = $false
if ($SshKeyPath -and $SshKeyPath.Trim() -ne "") {
    if (!(Test-Path $SshKeyPath)) {
        throw "SSH key not found: $SshKeyPath"
    }
    $useKeyAuth = $true
}

$ArchiveName = "melissa-ai-deploy.tar.gz"
$RemoteArchive = "$ServerPath/$ArchiveName"
$SshTarget = "$ServerUser@$ServerHost"

function Invoke-SshCommand {
    param([string]$Command)
    if ($useKeyAuth) {
        & ssh -o StrictHostKeyChecking=no -i $SshKeyPath $SshTarget $Command
    } else {
        & ssh -o StrictHostKeyChecking=no $SshTarget $Command
    }
}

function Invoke-ScpUpload {
    param([string]$LocalPath, [string]$RemotePath)
    if ($useKeyAuth) {
        & scp -o StrictHostKeyChecking=no -i $SshKeyPath $LocalPath "${SshTarget}:$RemotePath"
    } else {
        & scp -o StrictHostKeyChecking=no $LocalPath "${SshTarget}:$RemotePath"
    }
}

Write-Host "[1/5] Creating deployment archive..."
if (Test-Path $ArchiveName) {
    Remove-Item $ArchiveName -Force
}

$excludeArgs = @(
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=dist",
    "--exclude=android/app/build",
    "--exclude=backend/uploads",
    "--exclude=$ArchiveName"
)

$tarArgs = @("-czf", $ArchiveName) + $excludeArgs + @(".")
& tar @tarArgs

Write-Host "[2/5] Preparing remote directory..."
Invoke-SshCommand "mkdir -p $ServerPath"

Write-Host "[3/5] Uploading archive and environment file..."
Invoke-ScpUpload $ArchiveName $RemoteArchive
Invoke-ScpUpload $EnvFilePath "$ServerPath/.env.server"

Write-Host "[4/5] Running remote deployment script..."
Invoke-ScpUpload "deploy.sh" "$ServerPath/deploy.sh"
Invoke-SshCommand "bash $ServerPath/deploy.sh"

Write-Host "[5/5] Cleaning local archive..."
Remove-Item $ArchiveName -Force

Write-Host "Deployment complete. Check: http://$ServerHost:3000/api/health"
