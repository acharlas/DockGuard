from app.config import Settings


def test_build_analysis_enabled_by_default(monkeypatch):
    monkeypatch.delenv("ENABLE_BUILD_ANALYSIS", raising=False)

    assert Settings(_env_file=None).enable_build_analysis is True


def test_build_analysis_can_be_disabled_via_env(monkeypatch):
    monkeypatch.setenv("ENABLE_BUILD_ANALYSIS", "false")

    assert Settings(_env_file=None).enable_build_analysis is False
