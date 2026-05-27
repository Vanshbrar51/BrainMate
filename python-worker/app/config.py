# python-worker/app/config.py — Pydantic Settings for WriteRight AI Worker
#
# All configuration is loaded from environment variables.
# Use .env file for local development (pydantic-settings supports dotenv).

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """WriteRight AI Worker configuration.

    All fields are read from environment variables. Defaults are provided
    for non-sensitive values. Sensitive values (API keys, URLs) must be set.
    """

    def configure_mock(self, **kwargs):
        """Allows direct setting of attributes for testing purposes."""
        for key, value in kwargs.items():
            setattr(self, key, value)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Allow extra env vars, common in shared test/dev environments
    )

    # Security
    internal_api_token: str = Field(..., description="env: INTERNAL_API_TOKEN")
    auth_gateway_internal_url: str = Field(
        default="http://127.0.0.1:9091",
        description="env: AUTH_GATEWAY_INTERNAL_URL",
    )

    # Redis
    redis_url: str = "redis://127.0.0.1:6379"

    # Supabase (service role — bypasses RLS)
    supabase_url: str
    supabase_service_key: str

    # Google AI Studio (LLM API)
    google_ai_studio_api_key: str
    google_ai_studio_base_url: str = (
        "https://generativelanguage.googleapis.com/v1beta/openai"
    )
    anthropic_api_key: str = Field(default="", description="env: ANTHROPIC_API_KEY")
    anthropic_base_url: str = "https://api.anthropic.com/v1"
    anthropic_fallback_model: str = "claude-haiku-4-5-20251001"
    enable_anthropic_fallback: bool = Field(
        default=False,
        description="env: ENABLE_ANTHROPIC_FALLBACK",
    )
    default_model: str = "gemini-2.5-flash"
    embedding_model: str = "gemini-embedding-001"

    # Task-specific model overrides (JSON string: {"write_improvement":
    # "model-name"})
    task_model_map: str = "{}"

    # Worker settings
    worker_concurrency: int = 4
    worker_poll_interval_ms: int = 500
    job_max_retries: int = 3
    job_timeout_seconds: int = 30

    # Token limits
    max_input_tokens: int = 4096
    max_output_tokens: int = 8192

    # Observability
    otel_endpoint: str = ""
    otel_service_name: str = "writeright-worker"

    # Rate limiting (for worker-side safety)
    max_concurrent_llm_calls: int = 4
    enable_critique_pipeline: bool = Field(
        default=False,
        description="env: ENABLE_CRITIQUE_PIPELINE",
    )

    # Smart Suggestions / Session DNA / Rephrase feature flags
    enable_smart_suggestions: bool = Field(
        default=True,
        description="env: ENABLE_SMART_SUGGESTIONS",
    )
    smart_suggestions_max_per_session: int = Field(
        default=10,
        description="env: SMART_SUGGESTIONS_MAX_PER_SESSION",
    )
    session_dna_cache_hours: int = Field(
        default=24,
        description="env: SESSION_DNA_CACHE_HOURS",
    )
    rephrase_max_chars: int = Field(
        default=500,
        description="env: REPHRASE_MAX_CHARS",
    )


_settings_instance: Settings | None = None


def get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()  # type: ignore[call-arg]
    return _settings_instance


settings = get_settings()
