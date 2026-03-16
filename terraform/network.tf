# --- VCN (Always Free) ---

resource "oci_core_vcn" "main" {
  compartment_id = var.oci_compartment_id
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "dockguard-vcn"
  dns_label      = "dockguard"
}

# --- Internet Gateway (Always Free) ---

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.oci_compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "dockguard-igw"
  enabled        = true
}

# --- Route Table (Always Free) ---

resource "oci_core_route_table" "public" {
  compartment_id = var.oci_compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "dockguard-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

# --- Security List (Always Free) ---
# Only SSH inbound from allowed CIDR. No HTTP — Cloudflare Tunnel handles ingress.

resource "oci_core_security_list" "main" {
  compartment_id = var.oci_compartment_id
  vcn_id         = oci_core_vcn.main.id
  display_name   = "dockguard-sl"

  # Allow all egress (needed for Docker pulls, Cloudflare Tunnel, apt)
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # SSH from allowed CIDR only (emergency access)
  ingress_security_rules {
    source   = var.ssh_allowed_cidr
    protocol = "6" # TCP
    tcp_options {
      min = 22
      max = 22
    }
  }
}

# --- Public Subnet (Always Free) ---

resource "oci_core_subnet" "public" {
  compartment_id             = var.oci_compartment_id
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = "10.0.1.0/24"
  display_name               = "dockguard-public"
  dns_label                  = "pub"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.main.id]
  prohibit_public_ip_on_vnic = false
}
