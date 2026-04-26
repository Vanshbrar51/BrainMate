# python-worker/app/config.py — Pydantic Settings for WriteRight AI Worker
#
# All configuration is loaded from environment variables.
# Use .env file for local development (pydantic-settings supports dotenv).

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """WriteRight AI Worker configuration.

    All fields are read from environment variables. Defaults are provided
    for non-sensitive values. Sensitive values (API keys, URLs) must be set.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Redis
    redis_url: str = "redis://127.0.0.1:6379"

    # Supabase (service role — bypasses RLS)
    supabase_url: str
    supabase_service_key: str

    # Google AI Studio (LLM API)
    google_ai_studio_api_key: str
    google_ai_studio_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    default_model: str = "gemini-2.5-flash"

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


# Module-level singleton
settings = Settings()  # type: ignore[call-arg]
