"""Tests replay their own recorded replies: the shared reply folder (REBARTWIN_REPLIES_DIR in .env) is held empty so
`load_env` cannot fill it, and no test reads or writes a real project's replies."""
import pytest


@pytest.fixture(autouse=True)
def _no_shared_replies(monkeypatch):
    monkeypatch.setenv("REBARTWIN_REPLIES_DIR", "")
