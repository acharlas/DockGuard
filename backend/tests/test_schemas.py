import pytest
from pydantic import ValidationError

from app.schemas.scan import ScanCreate


@pytest.mark.parametrize("image", [
    "nginx:latest",
    "python:3.12-slim",
    "ghcr.io/owner/repo:v1.0.0",
    "registry.example.com/my-app/backend:sha-abc123",
    "ubuntu",
    "library/postgres:16",
    "node:18",
    "myimage@sha256:" + "a" * 64,
])
def test_valid_image_names(image):
    scan = ScanCreate(image=image)
    assert scan.image == image


@pytest.mark.parametrize("image", [
    "; rm -rf /",
    "$(whoami)",
    "`cat /etc/passwd`",
    "nginx; echo pwned",
    "image && curl evil.com",
    "nginx | cat /etc/shadow",
    "image\nnewline",
    "",
    " ",
    "a" * 300,
])
def test_malicious_image_names_rejected(image):
    with pytest.raises(ValidationError):
        ScanCreate(image=image)
