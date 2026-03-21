# --- ARM VM (Always Free: up to 4 OCPU, 24GB RAM) ---

resource "oci_core_instance" "app" {
  compartment_id      = var.oci_compartment_id
  availability_domain = var.oci_availability_domain
  display_name        = "dockguard-app"
  shape               = "VM.Standard.A1.Flex"
  freeform_tags       = var.project_tags

  # Always Free limits: 4 OCPU, 24GB RAM total for all A1 instances
  shape_config {
    ocpus         = 4
    memory_in_gbs = 24
  }

  source_details {
    source_type             = "image"
    source_id               = var.oci_instance_image_ocid
    boot_volume_size_in_gbs = 47 # Always Free (up to 200GB total)
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "dockguard-vnic"
    freeform_tags    = var.project_tags
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(<<-CLOUDINIT
#cloud-config
package_update: true
packages:
  - python3
  - python3-pip
  - dnf-utils
runcmd:
  - dnf config-manager --add-repo=https://download.docker.com/linux/rhel/docker-ce.repo
  - dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  - systemctl enable --now docker
  - usermod -aG docker opc
CLOUDINIT
    )
  }
}
