output "vm_public_ip" {
  description = "Public IP of the Oracle ARM VM (SSH access only)"
  value       = oci_core_instance.app.public_ip
}

output "app_url" {
  description = "DockGuard frontend URL"
  value       = "https://dockguard.${var.domain}"
}

output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = "https://grafana.${var.domain}"
}

output "tunnel_id" {
  description = "Cloudflare Tunnel ID"
  value       = cloudflare_zero_trust_tunnel_cloudflared.main.id
}
