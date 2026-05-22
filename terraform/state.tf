data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.oci_compartment_id
}

resource "oci_objectstorage_bucket" "tf_state" {
  compartment_id = var.oci_compartment_id
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "dockguard-tfstate"
  storage_tier   = "Standard"
  access_type    = "NoPublicAccess"
}
