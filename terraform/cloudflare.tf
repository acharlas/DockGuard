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
      hostname = "ssh.dockguard.${var.domain}"
      service  = "ssh://localhost:22"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_zero_trust_access_application" "ssh" {
  account_id       = var.cloudflare_account_id
  domain           = "ssh.dockguard.${var.domain}"
  session_duration = "24h"
}

resource "cloudflare_zero_trust_access_policy" "ssh" {
  application_id = cloudflare_zero_trust_access_application.ssh.id
  account_id     = var.cloudflare_account_id
  name           = "Allow CI"
  precedence     = 1
  decision       = "allow"
  include {
    service_token = [var.cloudflare_ssh_service_token_id]
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

resource "cloudflare_record" "ssh" {
  zone_id = var.cloudflare_zone_id
  name    = "ssh.dockguard"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.main.id}.cfargotunnel.com"
  proxied = true
  type    = "CNAME"
}
