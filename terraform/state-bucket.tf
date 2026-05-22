# OCI Object Storage namespace reference (useful for S3 backend URL construction).
# Not required when using local state.
data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.oci_compartment_id
}
