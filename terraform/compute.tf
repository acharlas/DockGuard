# --- Data: Latest Oracle Linux 9 ARM Image (Always Free) ---

data "oci_core_images" "oracle_linux" {
  compartment_id           = var.oci_compartment_id
  operating_system         = "Oracle Linux"
  operating_system_version = "9"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# --- ARM VM (Always Free: up to 4 OCPU, 24GB RAM) ---

resource "oci_core_instance" "app" {
  compartment_id      = var.oci_compartment_id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "dockguard-app"
  shape               = "VM.Standard.A1.Flex"

  # Always Free limits: 4 OCPU, 24GB RAM total for all A1 instances
  shape_config {
    ocpus         = 4
    memory_in_gbs = 24
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.oracle_linux.images[0].id
    boot_volume_size_in_gbs = 47 # Always Free (up to 200GB total)
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "dockguard-vnic"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yml.tftpl", {
      cloudflare_tunnel_token = cloudflare_zero_trust_tunnel_cloudflared.main.tunnel_token
      backend_image           = var.ghcr_image_backend
      frontend_image          = var.ghcr_image_frontend
      db_password             = var.db_password
      domain                  = var.domain
    }))
  }

  # Prevent recreation when image updates
  lifecycle {
    ignore_changes = [source_details[0].source_id]
  }
}

# --- Availability Domains (data source) ---

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.oci_tenancy_ocid
}
