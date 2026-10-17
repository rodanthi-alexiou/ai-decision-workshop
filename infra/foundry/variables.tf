variable "project_name" {
  description = "Base name for the workshop Foundry resources."
  type        = string
  default     = "decision-room-dev"
}

variable "location" {
  description = "Azure region for the public development environment."
  type        = string
  default     = "swedencentral"
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default = {
    application = "decision-room"
    environment = "development"
    managed_by  = "terraform"
  }
}

variable "enable_telemetry" {
  description = "Controls Azure Verified Module telemetry."
  type        = bool
  default     = true
}
