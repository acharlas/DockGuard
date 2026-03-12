variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "eu-west-3"
}

variable "project" {
  description = "Project name, used as a prefix for all resource names"
  type        = string
  default     = "dockguard"
}

variable "environment" {
  description = "Deployment environment (dev / prod)"
  type        = string
  default     = "prod"
}

variable "instance_type" {
  description = "EC2 instance type for the application server"
  type        = string
  default     = "t3.small"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_password" {
  description = "Password for the RDS PostgreSQL master user"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key material for the EC2 key pair"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR block allowed to SSH into the EC2 instance (restrict to your IP in production)"
  type        = string
  default     = "0.0.0.0/0"
}

variable "ghcr_image_backend" {
  description = "Full GHCR image reference for the backend (e.g. ghcr.io/user/dockguard-backend:latest)"
  type        = string
}

variable "ghcr_image_frontend" {
  description = "Full GHCR image reference for the frontend (e.g. ghcr.io/user/dockguard-frontend:latest)"
  type        = string
}

variable "cors_origins" {
  description = "Allowed CORS origins for the backend API (JSON array string)"
  type        = string
  default     = "[\"*\"]"
}
