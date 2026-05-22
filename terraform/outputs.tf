output "vm_public_ip" {
  value = oci_core_instance.app.public_ip
}

output "tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.main.id
}

output "cloudflare_tunnel_token" {
  value     = cloudflare_zero_trust_tunnel_cloudflared.main.tunnel_token
  sensitive = true
}

output "domain" {
  value = var.domain
}
