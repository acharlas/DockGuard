# --- Cloudflare Tunnel (Free) ---

resource "cloudflare_tunnel" "main" {
  account_id = var.cloudflare_account_id
  name       = "dockguard-tunnel"
  secret     = random_id.tunnel_secret.b64_std
}

resource "random_id" "tunnel_secret" {
  byte_length = 32
}

# --- Tunnel Configuration ---

resource "cloudflare_tunnel_config" "main" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_tunnel.main.id

  config {
    ingress_rule {
      hostname = "dockguard.${var.domain}"
      service  = "http://localhost:3000"
    }

    ingress_rule {
      hostname = "grafana.${var.domain}"
      service  = "http://localhost:3001"
    }

    # Catch-all rule (required by Cloudflare)
    ingress_rule {
      service = "http_status:404"
    }
  }
}

# --- DNS Records (Free) ---

resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "dockguard"
  content = "${cloudflare_tunnel.main.id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
}

resource "cloudflare_record" "grafana" {
  zone_id = var.cloudflare_zone_id
  name    = "grafana"
  content = "${cloudflare_tunnel.main.id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
}
