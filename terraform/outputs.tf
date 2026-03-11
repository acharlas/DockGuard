output "app_public_ip" {
  description = "Public IP address of the EC2 application server"
  value       = aws_instance.app.public_ip
}

output "app_public_dns" {
  description = "Public DNS hostname of the EC2 application server"
  value       = aws_instance.app.public_dns
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = aws_db_instance.postgres.endpoint
}
