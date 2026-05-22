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
      tunnel_token = cloudflare_zero_trust_tunnel_cloudflared.main.tunnel_token
    }))
  }
}
