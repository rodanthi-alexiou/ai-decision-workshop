output "resource_group_name" {
  value       = azurerm_resource_group.this.name
  description = "Resource group containing the Foundry environment."
}

output "foundry_account_name" {
  value       = module.foundry.ai_foundry_name
  description = "Foundry account name."
}

output "foundry_resource_endpoint" {
  value       = "https://${module.foundry.ai_foundry_name}.services.ai.azure.com"
  description = "Resource endpoint used by Microsoft-Decision-1."
}

output "foundry_project_name" {
  value       = module.foundry.ai_foundry_project_name["workshop"]
  description = "Foundry project name."
}

output "foundry_project_endpoint" {
  value       = "https://${module.foundry.ai_foundry_name}.services.ai.azure.com/api/projects/${module.foundry.ai_foundry_project_name["workshop"]}"
  description = "Foundry project endpoint used by the prompt agent SDK."
}

output "options_model_deployment" {
  value       = "gpt-5-mini"
  description = "Model deployment backing the options prompt agent."
}

output "decision_model_deployment" {
  value       = "decision-ranker"
  description = "Microsoft-Decision-1 deployment name."
}

output "application_insights_connection_string" {
  value       = azurerm_application_insights.this.connection_string
  description = "Application Insights connection string."
  sensitive   = true
}
