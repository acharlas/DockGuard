output "vm_public_ip" {
  value = oci_core_instance.app.public_ip
}

output "domain" {
  value = var.domain
}

output "cloudflare_tunnel_token" {
  value     = cloudflare_zero_trust_tunnel_cloudflared.main.tunnel_token
  sensitive = true
}
