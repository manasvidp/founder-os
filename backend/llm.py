"""Thin wrapper around Anthropic's API. Replaces the Emergent universal-key integration.

Set ANTHROPIC_API_KEY (from console.anthropic.com). ANTHROPIC_MODEL is optional.
"""
import os

from anthropic import AsyncAnthropic

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
MAX_TOKENS = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "4096"))

_client = None


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _get():
    global _client
    if not configured():
        raise RuntimeError("AI is not configured: add ANTHROPIC_API_KEY to the server environment")
    if _client is None:
        _client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


async def complete(system: str, prompt: str, max_tokens: int = MAX_TOKENS) -> str:
    msg = await _get().messages.create(model=MODEL, max_tokens=max_tokens, system=system,
                                       messages=[{"role": "user", "content": prompt}])
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


async def stream(system: str, prompt: str, max_tokens: int = MAX_TOKENS):
    """Yields text chunks as they arrive."""
    async with _get().messages.stream(model=MODEL, max_tokens=max_tokens, system=system,
                                      messages=[{"role": "user", "content": prompt}]) as s:
        async for text in s.text_stream:
            yield text
