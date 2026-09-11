param(
    [Parameter(Mandatory = $true)]
    [string]$ServerHost,

    [Parameter(Mandatory = $true)]
    [string]$Domain,

    [Parameter(Mandatory = $true)]
    [string]$Email,

    [Parameter(Mandatory = $false)]
    [string]$ServerUser = "root",

    [Parameter(Mandatory = $false)]
    [string]$SshKeyPath = ""
)

$ErrorActionPreference = "Stop"

$useKeyAuth = $false
if ($SshKeyPath -and $SshKeyPath.Trim() -ne "") {
    if (!(Test-Path "$SshKeyPath")) {
        throw "SSH key not found: $SshKeyPath"
    }
    $useKeyAuth = $true
}

$SshTarget = "$ServerUser@$ServerHost"

function Invoke-SshCommand {
    param([string]$Command)
    if ($useKeyAuth) {
        & ssh -o StrictHostKeyChecking=no -i "$SshKeyPath" "$SshTarget" "$Command"
    } else {
        & ssh -o StrictHostKeyChecking=no "$SshTarget" "$Command"
    }
}

function Invoke-ScpUpload {
    param([string]$LocalPath, [string]$RemotePath)
    if ($useKeyAuth) {
        & scp -o StrictHostKeyChecking=no -i "$SshKeyPath" "$LocalPath" "${SshTarget}:$RemotePath"
    } else {
        & scp -o StrictHostKeyChecking=no "$LocalPath" "${SshTarget}:$RemotePath"
    }
}

Write-Host ""
Write-Host "=================================================="
Write-Host "  Setup SSL Certificate"
Write-Host "  Domain: $Domain"
Write-Host "  Server: $ServerHost"
Write-Host "=================================================="
Write-Host ""

Write-Host "[1/3] Uploading SSL setup script to server..."
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sslScriptPath = Join-Path $scriptDir "setup-ssl.sh"

Invoke-SshCommand "mkdir -p /opt/melissa-ai/ssl-setup"
Invoke-ScpUpload "$sslScriptPath" "/opt/melissa-ai/ssl-setup/setup-ssl.sh"

Write-Host ""
Write-Host "[2/3] Making script executable..."
Invoke-SshCommand "chmod +x /opt/melissa-ai/ssl-setup/setup-ssl.sh"

Write-Host ""
Write-Host "[3/3] Running SSL setup on server..."
Invoke-SshCommand "bash /opt/melissa-ai/ssl-setup/setup-ssl.sh $Domain $Email"

Write-Host ""
Write-Host "=================================================="
Write-Host "  SSL DEPLOYMENT COMPLETE!"
Write-Host "=================================================="
Write-Host ""
Write-Host "  Live URL: https://$Domain"
Write-Host "  Admin:   https://$Domain/admin.html"
Write-Host "  Health:  https://$Domain/api/health"
Write-Host ""
