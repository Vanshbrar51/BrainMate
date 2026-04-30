# python-worker/app/services/prompt_builder.py — Prompt construction engine
#
# This is the MOST CRITICAL service in the worker. It constructs the system
# prompt, injects conversation history, sanitizes input, and defends against
# prompt injection.
#
# The system prompt enforces structured JSON output from the LLM. The prompt
# builder also detects refinement intent (short follow-up messages) and
# adjusts the context accordingly.

from __future__ import annotations

import re
import random
import logging

logger = logging.getLogger("writeright.prompt_builder")

# ---------------------------------------------------------------------------
# Prompt Injection Defense
# ---------------------------------------------------------------------------

INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"ignore\s+(?:(?:previous|all|prior)\s+)*instructions",
        re.IGNORECASE),
    re.compile(r"you\s+are\s+now", re.IGNORECASE),
    re.compile(r"new\s+persona", re.IGNORECASE),
    re.compile(r"system\s*:", re.IGNORECASE),
    re.compile(r"<\s*system\s*>", re.IGNORECASE),
    re.compile(
        r"act\s+as\s+(?!a\s+(?:writing|communication)|writing|communication)",
        re.IGNORECASE),
    re.compile(r"forget\s+(everything|all|your)", re.IGNORECASE),
    re.compile(r"override\s+(your|the)\s+(instructions|prompt|rules)", re.IGNORECASE),
    re.compile(r"disregard\s+all\s+above", re.IGNORECASE),
    re.compile(r"jailbreak", re.IGNORECASE),
    re.compile(r"developer\s*mode", re.IGNORECASE),
    re.compile(r"simulate\s+being", re.IGNORECASE),
]


def detect_injection(text: str) -> tuple[str, bool]:
    """Check for prompt injection patterns.

    Returns:
        (sanitized_text, injection_detected)
        If injection detected, matching segments are replaced with [content filtered].
    """
    sanitized = text
    detected = False

    for pattern in INJECTION_PATTERNS:
        if pattern.search(sanitized):
            detected = True
            sanitized = pattern.sub("[content filtered]", sanitized)

    if detected:
        logger.warning(
            "Prompt injection detected and neutralized",
            extra={
                "original_length": len(text),
                "sanitized_length": len(sanitized)},
        )

    return sanitized, detected


# ---------------------------------------------------------------------------
# Input Sanitization
# ---------------------------------------------------------------------------

def sanitize_text(text: str, max_chars: int = 16384) -> str:
    """Sanitize user input text for prompt construction.

    1. Strip characters outside printable Unicode (keep \\n, \\t)
    2. Truncate to max_chars (roughly max_input_tokens * 4 chars/token)
    3. Strip leading/trailing whitespace
    """
    # Remove null bytes and control characters except \n (0x0A) and \t (0x09)
    sanitized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Truncate
    sanitized = sanitized[:max_chars]

    return sanitized.strip()


# ---------------------------------------------------------------------------
# System Prompt Template
# ---------------------------------------------------------------------------

INTENSITY_CONTEXT: dict[int, str] = {
    1: "PRESERVE STYLE: Minimal changes only. Fix clear errors. Keep the user's voice. Do not restructure sentences.",
    2: "LIGHT TOUCH: Fix obvious problems. Keep structure. Only change what is clearly wrong or unclear.",
    3: "",
    4: "IMPROVE ACTIVELY: Restructure for clarity. Replace weak phrases. Make the impact stronger. Keep the original meaning.",
    5: "FULL REWRITE: Completely rewrite in {tone} tone. Same meaning, entirely new expression. Optimise for maximum impact.",
}

MODE_CONTEXT: dict[str, str] = {
    "email": (
        "For EMAIL context: Use formal salutation and sign-off. "
        "Structure: greeting → purpose → details → call-to-action → closing. "
        "Typical length: 3-6 sentences unless the original is longer. "
        "Flag: 'I wanted to...', 'Just wanted to...', 'Do the needful', 'Revert back', 'Kindly revert'."
    ),
    "linkedin": (
        "For LINKEDIN POST context: Open with a hook (bold claim or question). "
        "Use short paragraphs (1-3 lines max). Include a call-to-action at the end. "
        "No hashtag stuffing (max 3-5 relevant hashtags). "
        "Avoid: 'Excited to share', 'Thrilled to announce', 'Humbled by'. "
        "Flag: corporate buzzwords, clichés, vague inspiration without substance."
    ),
    "whatsapp": (
        "For WHATSAPP → FORMAL context: The user wants to convert casual/informal WhatsApp "
        "language into a professional written message (email or document). "
        "Ensure the final output is polished and removes text-speak (u, ur, gr8, plss)."
    ),
    "paragraph": (
        "Replace passive voice where possible. Remove redundancy. "
        "For academic tone: use Latinate vocabulary, hedging language ('suggests', 'indicates'), citations-style phrasing. "
        "For concise tone: ruthlessly cut filler words and redundant phrases."
    ),
}

SYSTEM_PROMPT_TEMPLATE = """You are WriteRight — an expert communication coach and professional writing assistant embedded in BrainMate AI, an AI platform for Indian professionals.

Your specialty is helping users who write in Indian English (Hinglish patterns, "kindly revert", "do the needful", excessive hedging) communicate with precision and confidence in {tone} tone for {mode} context.

Before writing your JSON response, silently think through:
1) What is the core intent of this text?
2) What are the 2-3 biggest problems?
3) What tone shift is needed?
DO NOT include this thinking in your output.

You MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no backticks, no preamble:

{{
  "improved_text": "<rewritten version of the user's text in {tone} tone for {mode} context>",
  "english_version": "<english improved text before translation, or null if output is English>",
  "teaching": {{
    "mistakes": ["<specific mistake 1>", "<specific mistake 2>"],
    "better_versions": ["<alternative phrasing 1>", "<alternative phrasing 2>"],
    "explanations": ["<why mistake 1 is a problem>", "<why mistake 2 is a problem>"]
  }},
  "follow_up": "<one actionable question to help the user refine further>",
  "suggestions": ["<short refinement chip 1>", "<short refinement chip 2>", "<short refinement chip 3>"],
  "scores": {{
    "clarity": <int 1-10>,
    "tone": <int 1-10>,
    "impact": <int 1-10>,
    "verdict": "<Ready to send | Needs more work | Strong draft>"
  }}
}}

# FEW-SHOT EXAMPLES:
[
  {{
    "input": "Respected sir, kindly revert back. I will do the needful.",
    "output": {{
      "improved_text": "Hi [Name], please let me know your thoughts. I'll take care of the next steps once approved.",
      "english_version": null,
      "teaching": {{
        "mistakes": ["Respected sir", "kindly revert back", "do the needful"],
        "better_versions": ["Hi [Name]", "please reply", "take the necessary action"],
        "explanations": ["Too formal for modern context", "Redundant (revert means back)", "Too vague"]
      }},
      "follow_up": "Would you like me to specify the exact next steps?",
      "suggestions": ["Make it shorter", "Make it more formal", "Remove placeholders"],
      "scores": {{ "clarity": 10, "tone": 10, "impact": 9, "verdict": "Ready to send" }}
    }}
  }}
]


Rules:
- improved_text must be complete and ready-to-send — never truncated.
- english_version must be the English improved text before translation when output language is not English.
- If output language is English, set english_version to null.
- mistakes must be concrete and specific to this text — never generic.
- better_versions must be specific rewrites of the problematic phrases.
- explanations must explain WHY, not just WHAT.
- follow_up must be a single, specific, useful question — never generic like "How can I help further?".
- suggestions must contain exactly 3 actionable refinement chips.
- Each suggestion must be at most 8 words, specific to the output, and immediately usable as a follow-up command.
- scores.clarity, scores.tone, and scores.impact must be integers from 1 to 10.
- scores.verdict must be exactly one of: "Ready to send", "Needs more work", "Strong draft".
- If this is a refinement request (user said "make it shorter", "more formal"), update the previous improved_text accordingly.
- DO NOT wrap output in ```json``` or any markdown.
- Output ONLY the raw JSON object.

Indian English patterns to ALWAYS check for (flag any that appear):
- "Kindly revert" / "Please revert" (should be "Please reply" / "Please respond")
- "Do the needful" (specify the action explicitly)
- "Prepone" (not standard; use "reschedule to an earlier time")
- "Today itself" / "now only" / "soon only" (trailing emphasis — remove)
- "I am Rahul / I am writing to you" as opening (too formal in most modern contexts)
- "Intimated" used as "informed" ("Please be intimated that...")
- "Revert back" (redundant — "revert" already means back)
- "Discuss about" / "return back" / "repeat again" (redundant prepositions)
- Opening emails with "Respected Sir/Madam" unless genuinely formal hierarchy
- Overuse of "please" in every sentence
- Subject lines in ALL CAPS
- Excessive use of "!!!" for enthusiasm in professional contexts
- "I hope this mail finds you in the best of health" (cliché — only use if genuine)
- "Please note that" (often unnecessary throat-clearing)
- "With regards to" (prefer "Regarding")
- "As per our discussion" (prefer direct action statement)
- "As per your request" (prefer "As requested")
- "Do one thing" (filler phrase — remove)
- Sentence-final "only" for emphasis ("Send today only")
- "Kindly do the needful at your earliest convenience" (overly vague + verbose)
- "Please find attached herewith" / "Please find enclosed"
- "I am having a doubt" when "question" is intended
- "Please intimate" used where "please inform" is intended
- "Updation" / "updations" (use "update"/"updates")
- "I will revert" when meaning "I will reply"
- "Revert with feedback" when meaning "reply with feedback"
- "Passed out in 2020" in professional bios (use "graduated in 2020")
- "Myself Rahul" (use "I'm Rahul")
- "Discuss about" (use "discuss")
- "Return back" / "repeat again" / "merge together"
- "Cope up with" (use "cope with")
- "Off late" (use "lately")
- "Out of station" (use "out of town")
- "Doubt clearing" (use "Q&A" or "question resolution")
- "Timepass" in professional communication (avoid)
- "Thrice" in business prose (prefer "three times")
- "Respected Sir/Madam" for modern neutral business contexts
- "Warm regards please" / "Do the same" vague closings
- Passive heavy phrasing ("It has been informed that...")
- "Please do the same" without explicit action
- "FYI kindly note" redundant opener
- "I request you to kindly" repetitive politeness stack
- "Awaiting for your response" (use "Awaiting your response")

For EACH mistake found, the better_versions entry must be the EXACT replacement phrase, not a description of what to do.
Example — mistake: 'Kindly revert at the earliest', better_version: 'Please respond by Friday'"""


REFINEMENT_PREFIX = (
    "You are refining a previous response. "
    "The last improved version was:\n\n{prev_improved_text}\n\n"
    "Now apply this refinement: {user_request}"
)

# AI-01: Mode-specific few-shot example pool (2 per mode, randomly selected)
FEW_SHOT_POOL: dict[str,
                    list[dict[str,
                              str]]] = {"email": [{"input": "Respected sir, kindly revert back. I will do the needful.",
                                                   "output": '{"improved_text":"Hi [Name], please let me know your thoughts. I\'ll take care of the next steps once approved.","english_version":null,"teaching":{"mistakes":["Respected sir","kindly revert back","do the needful"],"better_versions":["Hi [Name]","please reply","take the necessary action"],"explanations":["Too formal for modern context","Redundant (revert means back)","Too vague"]},"follow_up":"Would you like me to specify the exact next steps?","suggestions":["Make it shorter","Make it more formal","Remove placeholders"],"scores":{"clarity":10,"tone":10,"impact":9,"verdict":"Ready to send"}}',
                                                   },
                                                  {"input": "Please revert with your confirmation asap.",
                                                   "output": '{"improved_text":"Please confirm by [date].","english_version":null,"teaching":{"mistakes":["Please revert","asap"],"better_versions":["Please confirm","by end of day"],"explanations":["Revert means to go back, not reply","Acronyms without deadline are vague"]},"follow_up":"Should I add a specific date?","suggestions":["Add specific deadline","Make it shorter","Add context"],"scores":{"clarity":9,"tone":9,"impact":8,"verdict":"Ready to send"}}',
                                                   },
                                                  ],
                                        "linkedin": [{"input": "Excited to share that I got promoted! Feeling humbled and blessed.",
                                                      "output": '{"improved_text":"After 2 years of leading [project], I\'m now stepping into a [new role] at [company].\n\nHere are 3 things I learned along the way:\n1. [Lesson 1]\n2. [Lesson 2]\n3. [Lesson 3]\n\nWhat\'s the best career advice you\'ve received?","english_version":null,"teaching":{"mistakes":["Excited to share","humbled and blessed"],"better_versions":["Direct announcement with context","Share specific learnings instead"],"explanations":["Overused LinkedIn cliché","Vague — shows no substance"]},"follow_up":"Want to add a specific achievement or metric?","suggestions":["Add specific metrics","Make it shorter","Add a stronger hook"],"scores":{"clarity":8,"tone":9,"impact":8,"verdict":"Strong draft"}}',
                                                      },
                                                     {"input": "Thrilled to announce our new product launch. Stay tuned for more updates!",
                                                      "output": '{"improved_text":"We just shipped [product name] — here\'s why it matters:\n\n[One-sentence value prop]\n\nThe problem: [specific pain point]\nOur approach: [what makes it different]\n\nTry it free → [link]","english_version":null,"teaching":{"mistakes":["Thrilled to announce","Stay tuned for more updates"],"better_versions":["Direct product intro with value","Specific CTA with link"],"explanations":["Empty excitement — lead with value","Passive — give them action now"]},"follow_up":"Should I add social proof or a testimonial?","suggestions":["Add customer quote","Make hook stronger","Add urgency"],"scores":{"clarity":9,"tone":8,"impact":9,"verdict":"Ready to send"}}',
                                                      },
                                                     ],
                                        "whatsapp": [{"input": "bro pls send me d file asap. v imp. thx",
                                                      "output": '{"improved_text":"Hi [Name], could you please share the file at your earliest convenience? It\'s needed for [reason]. Thank you!","english_version":null,"teaching":{"mistakes":["bro","pls","d file","v imp","thx"],"better_versions":["Hi [Name]","please","the file","It\'s important because...","Thank you"],"explanations":["Too casual for professional request","Text-speak in formal context","Abbreviation unclear","No context for urgency","Abbreviation"]},"follow_up":"Should I specify which file?","suggestions":["Add file name","Add deadline","Make it shorter"],"scores":{"clarity":9,"tone":9,"impact":8,"verdict":"Ready to send"}}',
                                                      },
                                                     {"input": "ya ya will do. send me d details na",
                                                      "output": '{"improved_text":"Sure, I\'ll take care of it. Could you share the details when you get a chance?","english_version":null,"teaching":{"mistakes":["ya ya","will do","d details","na"],"better_versions":["Sure","I\'ll take care of it","the details","when you get a chance"],"explanations":["Casual filler","Vague commitment","Text-speak","Hinglish tag — not professional"]},"follow_up":"Should I add a specific timeline?","suggestions":["Add deadline","Be more specific","Make it formal"],"scores":{"clarity":8,"tone":9,"impact":7,"verdict":"Strong draft"}}',
                                                      },
                                                     ],
                                        "paragraph": [{"input": "The thing is that basically the project was not completed on time due to various reasons.",
                                                       "output": '{"improved_text":"The project missed its deadline due to [specific reason 1] and [specific reason 2].","english_version":null,"teaching":{"mistakes":["The thing is that","basically","various reasons"],"better_versions":["Remove — throat-clearing","Remove — filler word","Name the specific reasons"],"explanations":["Empty opener adding no meaning","Weakens the statement","Too vague — always be specific"]},"follow_up":"Can you list the actual reasons for the delay?","suggestions":["Add specific reasons","Make it shorter","Add next steps"],"scores":{"clarity":9,"tone":8,"impact":8,"verdict":"Ready to send"}}',
                                                       },
                                                      {"input": "It is to be noted that the aforementioned issues have been duly addressed and rectified.",
                                                       "output": '{"improved_text":"We\'ve fixed the issues mentioned above.","english_version":null,"teaching":{"mistakes":["It is to be noted that","aforementioned","duly addressed and rectified"],"better_versions":["Remove — unnecessary preamble","mentioned above","fixed"],"explanations":["Passive throat-clearing","Overly formal for modern writing","Two words saying the same thing"]},"follow_up":"Should I add what specifically was fixed?","suggestions":["Add specifics","Keep it concise","Add timeline"],"scores":{"clarity":10,"tone":8,"impact":9,"verdict":"Ready to send"}}',
                                                       },
                                                      ],
                                        }


# ---------------------------------------------------------------------------
# History Formatting
# ---------------------------------------------------------------------------

def _extract_improved_text(content: str) -> str:
    """Extract improved_text from a stored AI response.

    If the content is a JSON string with an improved_text field, extract it.
    Otherwise, return the raw content.
    """
    import json

    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "improved_text" in parsed:
            return parsed["improved_text"]
    except (json.JSONDecodeError, TypeError):
        pass

    return content


def _is_refinement_request(text: str) -> bool:
    """Detect if a user message is a refinement of the previous response.

    Heuristic: message is short (< 100 chars), doesn't contain newlines,
    and is likely a command like "make it shorter" rather than new content.
    """
    return len(text) < 100 and "\n" not in text


def _looks_like_reply_chain(text: str) -> bool:
    patterns = [
        r"\bfrom:\s",
        r"\bto:\s",
        r"\bsubject:\s",
        r"\bon .+ wrote:\s*$",
    ]
    lowered = text.lower()
    return any(re.search(pattern, lowered, re.MULTILINE)
               for pattern in patterns)



def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English, ~2 for CJK."""
    cjk_count = sum(1 for c in text if '一' <= c <= '鿿')
    other_count = len(text) - cjk_count
    return (cjk_count // 2) + (other_count // 4)

def format_history(
    messages: list[dict],  # type: ignore[type-arg]
    max_messages: int = 10,
) -> list[dict[str, str]]:
    """Format chat history into Google AI Studio (OpenAI format) messages array.

    For assistant messages stored as JSON blobs, extracts improved_text
    to use as the assistant content. Limits to last N messages.
    """
    # Take last N messages
    recent = messages[-max_messages:] if len(
        messages) > max_messages else messages

    formatted: list[dict[str, str]] = []
    for msg in recent:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if role == "assistant":
            content = _extract_improved_text(content)
            formatted.append({"role": "assistant", "content": content})
        else:
            formatted.append({"role": "user", "content": content})

    return formatted


# ---------------------------------------------------------------------------
# Prompt Builder
# ---------------------------------------------------------------------------


def detect_script(text: str) -> str:
    """Detect writing system from character ranges — no ML needed."""
    devanagari = sum(1 for c in text if 'ऀ' <= c <= 'ॿ')
    arabic = sum(1 for c in text if '؀' <= c <= 'ۿ')
    latin = sum(1 for c in text if c.isalpha() and c.isascii())
    total = len([c for c in text if c.strip()])
    if total == 0:
        return "en"
    if devanagari / total > 0.15:
        return "hi"
    if arabic / total > 0.15:
        return "ar"
    return "en"

def build_messages(
    user_text: str,
    tone: str,
    mode: str,
    output_language: str,
    history: list[dict],  # type: ignore[type-arg]
    profile: list[str] | None = None,
    intensity: int = 3,
    max_history: int = 10,
    max_input_tokens: int = 4096,
) -> tuple[list[dict[str, str]], dict[str, bool]]:
    """Build the complete messages array for the Google AI Studio API call.

    Returns:
        (messages, metadata)
        where metadata contains flags like injection_detected.
    """
    metadata: dict[str, bool] = {"injection_detected": False}

    # 1. Sanitize input
    max_chars = max_input_tokens * 4  # rough approximation
    sanitized = sanitize_text(user_text, max_chars)

    # 2. Check for prompt injection
    sanitized, injection_detected = detect_injection(sanitized)
    metadata["injection_detected"] = injection_detected

    # 3. Build system prompt
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(tone=tone, mode=mode)
    mode_context = MODE_CONTEXT.get(mode, "")
    if mode_context:
        system_prompt = system_prompt + "\n\n" + mode_context

    intensity_instruction = INTENSITY_CONTEXT.get(intensity, "")
    if intensity_instruction:
        system_prompt = system_prompt + "\n\n" + \
            intensity_instruction.format(tone=tone)

    if profile:
        profile_str = "\n".join(f"- {m}" for m in profile[:5])
        system_prompt += f"""

PERSONALISED COACHING CONTEXT:
Based on this user's history, they frequently make these specific errors:
{profile_str}

Treat these as your primary targets. When you find any of these patterns:
1. Always flag them in the teaching.mistakes array
2. Always provide the specific better_versions replacement
3. Give special emphasis to WHY this pattern persists among Indian English writers
This user has been coached on these before — they need a direct, specific fix, not a generic explanation."""

    if _looks_like_reply_chain(sanitized):
        system_prompt += (
            "\n\nThis appears to be a reply chain. Improve ONLY the user's portion "
            "(the newest text at the top). Preserve quoted context unchanged.")

    if len(sanitized) < 50:
        system_prompt += "\n\nThe input is very short. Match the output length."
    elif len(sanitized) > 2000:
        system_prompt += (
            "\n\nThis is a long document. Maintain the same structure and length. "
            "Do not summarise or truncate.")

    output_language_clean = output_language.strip().lower()
    if output_language_clean and output_language_clean != "en":
        system_prompt += (
            f"\n\nAfter improving the text in English, translate the ENTIRE improved_text to {output_language_clean}. "
            f"The improved_text field must be in {output_language_clean}. "
            "Add english_version with the English improved text before translation."
        )

    detected_lang = detect_script(sanitized)
    if detected_lang != "en":
        system_prompt += f"\n\nInput language detected as {detected_lang}. Preserve native speaker patterns that are correct. Only fix actual errors, not differences from English."


    # 4. Format history
    history_messages = format_history(history, max_history)

    # 5. Detect refinement intent and adjust user message
    user_content = sanitized
    if history_messages and _is_refinement_request(sanitized):
        # Find the last assistant message to get the previous improved text
        prev_improved = None
        for msg in reversed(history_messages):
            if msg["role"] == "assistant":
                prev_improved = msg["content"]
                break

        if prev_improved:
            MAX_PREV_TEXT_CHARS = 2000  # ~500 tokens
            truncated_prev = prev_improved[:MAX_PREV_TEXT_CHARS]
            if len(prev_improved) > MAX_PREV_TEXT_CHARS:
                truncated_prev += "\n[... truncated for context ...]"
            user_content = REFINEMENT_PREFIX.format(
                prev_improved_text=truncated_prev,
                user_request=sanitized,
            )

    # 6. Select random few-shot example for current mode (AI-01)
    mode_examples = FEW_SHOT_POOL.get(mode, FEW_SHOT_POOL["email"])
    selected = random.choice(mode_examples)
    few_shot_messages: list[dict[str, str]] = [
        {"role": "user", "content": selected["input"]},
        {"role": "assistant", "content": selected["output"]},
    ]

    system_budget = _estimate_tokens(system_prompt)
    user_budget = _estimate_tokens(user_content)
    few_shot_budget = sum(_estimate_tokens(m["content"]) for m in few_shot_messages)

    remaining_budget = max_input_tokens - system_budget - user_budget - few_shot_budget - 200  # safety margin

    # Trim history from oldest end until it fits
    trimmed_history = []
    for msg in reversed(history_messages):
        msg_tokens = _estimate_tokens(msg["content"])
        if remaining_budget - msg_tokens >= 0:
            trimmed_history.insert(0, msg)
            remaining_budget -= msg_tokens

    history_messages = trimmed_history

    # 7. Construct final messages array
    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt}]
    messages.extend(few_shot_messages)
    messages.extend(history_messages)
    messages.append({"role": "user", "content": user_content})

    return messages, metadata
