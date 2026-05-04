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
        extra="ignore", # Allow extra env vars, common in shared test/dev environments
    )

    # Redis
    redis_url: str = "redis://127.0.0.1:6379"

    # Supabase (service role — bypasses RLS)
    supabase_url: str
    supabase_service_key: str

    # Google AI Studio (LLM API)
    google_ai_studio_api_key: str
    google_ai_studio_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    anthropic_api_key: str = ""
    anthropic_base_url: str = "https://api.anthropic.com/v1"
    anthropic_fallback_model: str = "claude-haiku-4-5-20251001"
    enable_anthropic_fallback: bool = False
    default_model: str = "gemini-2.5-flash"
    embedding_model: str = "text-embedding-004"

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
    max_output_tokens: int = 2048

    # Observability
    otel_endpoint: str = ""
    otel_service_name: str = "writeright-worker"

    # Rate limiting (for worker-side safety)
    max_concurrent_llm_calls: int = 4
    enable_critique_pipeline: bool = False  # env: ENABLE_CRITIQUE_PIPELINE

    # BUG-03 FIX: critique pipeline toggle (was a hardcoded False constant in ai_worker.py)
    enable_critique_pipeline: bool = Field(
        default=False,
        description="env: ENABLE_CRITIQUE_PIPELINE",
    )

    # F-BE-13: Anthropic fallback provider
    anthropic_api_key: str = Field(default="", description="env: ANTHROPIC_API_KEY")
    anthropic_base_url: str = "https://api.anthropic.com/v1"
    anthropic_fallback_model: str = "claude-haiku-4-5-20251001"
    enable_anthropic_fallback: bool = Field(
        default=False,
        description="env: ENABLE_ANTHROPIC_FALLBACK",
    )


_settings_instance: Settings | None = None

def get_settings() -> Settings:
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance

settings = get_settings()
