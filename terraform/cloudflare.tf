resource "random_id" "tunnel_secret" {
  byte_length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "main" {
  account_id = var.cloudflare_account_id
  name       = "dockguard"
  secret     = random_id.tunnel_secret.b64_std
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "main" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.main.id
  config {
    ingress_rule {
      hostname = "dockguard.${var.domain}"
      service  = "http://localhost:3000"
    }
    ingress_rule {
      hostname = "grafana.${var.domain}"
      service  = "http://localhost:3001"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "dockguard"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.main.id}.cfargotunnel.com"
  proxied = true
  type    = "CNAME"
}

resource "cloudflare_record" "grafana" {
  zone_id = var.cloudflare_zone_id
  name    = "grafana"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.main.id}.cfargotunnel.com"
  proxied = true
  type    = "CNAME"
}
