[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$Subscription = '04dbd670-839c-4a25-aad5-436f7215e881',
    [string]$ResourceGroup = 'rg-decision-room-dev',
    [string]$Location = 'swedencentral',
    [string]$AppName = 'app-decision-room-ralexiou-04dbd6',
    [string]$PlanName = 'asp-decision-workshop',
    [string]$StorageName = 'stdecisionroom04dbd6',
    [string]$VnetName = 'vnet-decision-workshop'
)
$ErrorActionPreference = 'Stop'
function Invoke-Az {
    $result = & az @args --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "Azure command failed: az $($args[0..1] -join ' ')" }
    return $result
}
$scope = "/subscriptions/$Subscription/resourceGroups/$ResourceGroup"
$account = "$scope/providers/Microsoft.CognitiveServices/accounts/aif-decision-room-dev"
Invoke-Az group show --subscription $Subscription --name $ResourceGroup --output none
Invoke-Az resource show --ids "$account/projects/decision-room" --output none
Write-Host "Target: $ResourceGroup ($Subscription), $Location"
Write-Host "Add only: Linux B1 plan $PlanName, Node 24 app $AppName, Standard LRS Table storage $StorageName."
Write-Host "Private storage path: $VnetName, app integration subnet, Table private endpoint and private DNS."
Write-Host 'Reuse existing Foundry agents/models. No Terraform changes. B1 bills while its plan exists.'
if (!$Apply) { Write-Host 'Preview only. Pass -Apply to create/configure dedicated hosting resources.'; return }

Invoke-Az appservice plan create --subscription $Subscription --resource-group $ResourceGroup --name $PlanName --location $Location --is-linux --sku B1 --number-of-workers 1 --output none
Invoke-Az storage account create --subscription $Subscription --resource-group $ResourceGroup --name $StorageName --location $Location --sku Standard_LRS --kind StorageV2 --allow-blob-public-access false --allow-shared-key-access false --https-only true --min-tls-version TLS1_2 --public-network-access Disabled --default-action Deny --output none
$storage = (Invoke-Az storage account show --subscription $Subscription --resource-group $ResourceGroup --name $StorageName --output json) | ConvertFrom-Json
Invoke-Az resource create --id "$($storage.id)/tableServices/default/tables/workshop" --api-version 2023-05-01 --properties '{}' --output none
Invoke-Az webapp create --subscription $Subscription --resource-group $ResourceGroup --plan $PlanName --name $AppName --runtime 'NODE:24-lts' --output none
$identity = (Invoke-Az webapp identity assign --subscription $Subscription --resource-group $ResourceGroup --name $AppName --output json) | ConvertFrom-Json
$app = (Invoke-Az webapp show --subscription $Subscription --resource-group $ResourceGroup --name $AppName --output json) | ConvertFrom-Json

$vnetExists = Invoke-Az network vnet list --subscription $Subscription -g $ResourceGroup --query "[?name=='$VnetName'].id" --output tsv
if (!$vnetExists) {
    Invoke-Az network vnet create --subscription $Subscription -g $ResourceGroup -n $VnetName -l $Location --address-prefixes 10.73.0.0/16 --subnet-name app-integration --subnet-prefixes 10.73.1.0/26 --output none
}
Invoke-Az network vnet subnet update --subscription $Subscription -g $ResourceGroup --vnet-name $VnetName -n app-integration --delegations Microsoft.Web/serverFarms --output none
Invoke-Az network vnet subnet create --subscription $Subscription -g $ResourceGroup --vnet-name $VnetName -n private-endpoints --address-prefixes 10.73.2.0/27 --private-endpoint-network-policies Disabled --output none
Invoke-Az network private-endpoint create --subscription $Subscription -g $ResourceGroup -n pe-decision-workshop-table -l $Location --vnet-name $VnetName --subnet private-endpoints --private-connection-resource-id $storage.id --group-id table --connection-name workshop-table --output none
$zoneName = 'privatelink.table.core.windows.net'
Invoke-Az network private-dns zone create --subscription $Subscription -g $ResourceGroup -n $zoneName --output none
Invoke-Az network private-dns link vnet create --subscription $Subscription -g $ResourceGroup -z $zoneName -n workshop-table-link --virtual-network "$scope/providers/Microsoft.Network/virtualNetworks/$VnetName" --registration-enabled false --output none
Invoke-Az network private-endpoint dns-zone-group create --subscription $Subscription -g $ResourceGroup --endpoint-name pe-decision-workshop-table -n workshop --private-dns-zone "$scope/providers/Microsoft.Network/privateDnsZones/$zoneName" --zone-name table --output none
Invoke-Az webapp vnet-integration add --subscription $Subscription -g $ResourceGroup -n $AppName --vnet $VnetName --subnet app-integration --output none

Invoke-Az role assignment create --assignee-object-id $identity.principalId --assignee-principal-type ServicePrincipal --role 'Storage Table Data Contributor' --scope $storage.id --output none
# Account-level inference covers Decision-1 as well as the project-scoped prompt agents.
Invoke-Az role assignment create --assignee-object-id $identity.principalId --assignee-principal-type ServicePrincipal --role 'Foundry User' --scope $account --output none
Invoke-Az webapp update --subscription $Subscription --resource-group $ResourceGroup --name $AppName --https-only true --output none
Invoke-Az webapp config set --subscription $Subscription --resource-group $ResourceGroup --name $AppName --startup-file 'node server/dist/index.js' --always-on true --min-tls-version 1.2 --http20-enabled true --ftps-state Disabled --number-of-workers 1 --output none
foreach ($policy in @('scm', 'ftp')) {
    Invoke-Az resource update --ids "$($app.id)/basicPublishingCredentialsPolicies/$policy" --api-version 2023-12-01 --set properties.allow=false --output none
}

$existing = (Invoke-Az webapp config appsettings list --subscription $Subscription --resource-group $ResourceGroup --name $AppName --output json) | ConvertFrom-Json
$settings = @(
    'NODE_ENV=production', 'MODEL_PROVIDER=foundry', 'SCM_DO_BUILD_DURING_DEPLOYMENT=false', 'WEBSITE_RUN_FROM_PACKAGE=1',
    "CLIENT_ORIGIN=https://$($app.defaultHostName)", "TABLE_ENDPOINT=$($storage.primaryEndpoints.table)",
    'TABLE_NAME=workshop', 'JOURNEY_LIMIT=5', 'STARTS_PER_MINUTE=2', 'EVENT_REQUEST_LIMIT=1000',
    'MODEL_CONCURRENCY=5', 'FOUNDRY_PROJECT_ENDPOINT=https://aif-decision-room-dev.services.ai.azure.com/api/projects/decision-room',
    'FOUNDRY_RESOURCE_ENDPOINT=https://aif-decision-room-dev.services.ai.azure.com',
    'FOUNDRY_OPTIONS_AGENT_NAME=decision-options-agent', 'FOUNDRY_COMPARE_AGENT_NAME=decision-compare-agent',
    'FOUNDRY_DECISION_DEPLOYMENT=decision-ranker'
)
# Rerunning infrastructure setup must never reopen a closed/paused event or reset its allowance.
if (!($existing | Where-Object name -eq 'WORKSHOP_CLOSED')) { $settings += 'WORKSHOP_CLOSED=false' }
if (!($existing | Where-Object name -eq 'WORKSHOP_EVENT_ID')) { $settings += 'WORKSHOP_EVENT_ID=workshop-20261018' }
Invoke-Az webapp config appsettings set --subscription $Subscription --resource-group $ResourceGroup --name $AppName --settings @settings --output none
Invoke-Az webapp log config --subscription $Subscription --resource-group $ResourceGroup --name $AppName --docker-container-logging filesystem --output none
Write-Host "Application: https://$($app.defaultHostName)/"
Write-Host "App resource ID: $($app.id)"
Write-Host "Runtime identity: $($identity.principalId)"
Write-Host 'Hosting configured; a tested production ZIP must still be deployed.'
