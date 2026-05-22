# --- E2.1.Micro VM (Always Free Tier) ---
# Shape: VM.Standard.E2.1.Micro — Always Free eligible (x86_64).
# Specs: 1/8 OCPU, 1 GB RAM. Reliable availability vs A1.Flex.
# Boot volume: 50 GB (Always Free limit: 200 GB total).

resource "oci_core_instance" "app" {
  compartment_id      = var.oci_compartment_id
  availability_domain = var.oci_availability_domain
  display_name        = "dockguard-app"
  shape               = "VM.Standard.E2.1.Micro"
  freeform_tags       = var.project_tags


  source_details {
    source_type             = "image"
    source_id               = var.oci_instance_image_ocid
    boot_volume_size_in_gbs = 50
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "dockguard-vnic"
    freeform_tags    = var.project_tags
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml", {
      tunnel_token = nonsensitive(cloudflare_zero_trust_tunnel_cloudflared.main.tunnel_token)
    }))
  }
}
