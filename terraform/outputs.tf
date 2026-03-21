output "vm_public_ip" {
  description = "Public IP of the Oracle ARM VM (SSH access only)"
  value       = oci_core_instance.app.public_ip
}

output "tunnel_id" {
  description = "Cloudflare Tunnel ID"
  value       = cloudflare_zero_trust_tunnel_cloudflared.main.id
}

output "cloudflare_tunnel_token" {
  description = "Cloudflare Tunnel token for cloudflared service install"
  value       = cloudflare_zero_trust_tunnel_cloudflared.main.tunnel_token
  sensitive   = true
}
