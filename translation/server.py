"""
IndicTrans2 / Bhashini Translation Inference Server
====================================================
Exposes a simple HTTP API for English ↔ Indic translation.

Provider selection:
    TRANSLATION_PROVIDER=local     Use on-premise IndicTrans2 models (default)
    TRANSLATION_PROVIDER=bhashini  Use Bhashini cloud NMT API (no GPU needed)

Start:
    uvicorn server:app --host 0.0.0.0 --port 8765

Environment variables — see .env.example for the full list.
"""

import logging
import os
import re
from contextlib import asynccontextmanager
from typing import Callable, Optional

import requests as _http
import torch
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Compatibility shim for transformers >= 4.40
# ai4bharat/indictrans2 configuration_indictrans.py references
# OnnxSeq2SeqConfigWithPast which was removed in transformers 4.40.
# The model file does a silent try/except around the import then still uses
# the name at class-definition time, causing a NameError on fresh downloads.
# Injecting a stub into sys.modules before from_pretrained is called fixes it.
# ---------------------------------------------------------------------------

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger("translation_server")

# ---------------------------------------------------------------------------
# Provider selection
# ---------------------------------------------------------------------------
TRANSLATION_PROVIDER: str = os.getenv("TRANSLATION_PROVIDER", "local").lower().strip()

# ---------------------------------------------------------------------------
# Local IndicTrans2 config
# ---------------------------------------------------------------------------
EN_INDIC_MODEL_DIR: str = (
    os.getenv("INDICTRANS2_EN_INDIC_MODEL_DIR")
    or os.getenv("INDICTRANS2_MODEL_DIR", "./models/indictrans2-en-indic-1B")
)
INDIC_EN_MODEL_DIR: str = (
    os.getenv("INDICTRANS2_INDIC_EN_MODEL_DIR")
    or os.path.join(os.path.dirname(EN_INDIC_MODEL_DIR), "indictrans2-indic-en-1B")
)
HF_EN_INDIC_MODEL_ID: str = "ai4bharat/indictrans2-en-indic-1B"
HF_INDIC_EN_MODEL_ID: str = "ai4bharat/indictrans2-indic-en-1B"
API_KEY: Optional[str] = os.getenv("TRANSLATION_API_KEY") or None

# ---------------------------------------------------------------------------
# Bhashini config
# ---------------------------------------------------------------------------
BHASHINI_USER_ID: str = os.getenv("BHASHINI_USER_ID", "")
BHASHINI_API_KEY: str = os.getenv("BHASHINI_API_KEY", "")
BHASHINI_PIPELINE_ID: str = os.getenv("BHASHINI_PIPELINE_ID", "64392f96daac500b55c543cd")
BHASHINI_AUTH_TOKEN: str = os.getenv("BHASHINI_AUTH_TOKEN", "")
BHASHINI_INFERENCE_URL: str = os.getenv(
    "BHASHINI_INFERENCE_URL",
    "https://dhruva-api.bhashini.gov.in/services/inference/pipeline",
)
BHASHINI_PIPELINE_CONFIG_URL: str = os.getenv(
    "BHASHINI_PIPELINE_CONFIG_URL",
    "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline",
)

# ---------------------------------------------------------------------------
# Language maps
# ---------------------------------------------------------------------------
# FLORES-200 codes used by local IndicTrans2
LANGUAGE_TO_FLORES: dict[str, str] = {
    "English":   "eng_Latn",
    "Hindi":     "hin_Deva",
    "Gom":       "gom_Deva",
    "Kannada":   "kan_Knda",
    "Dogri":     "doi_Deva",
    "Bodo":      "brx_Deva",
    "Urdu":      "urd_Arab",
    "Tamil":     "tam_Taml",
    "Kashmiri":  "kas_Arab",
    "Assamese":  "asm_Beng",
    "Bengali":   "ben_Beng",
    "Marathi":   "mar_Deva",
    "Sindhi":    "snd_Arab",
    "Maithili":  "mai_Deva",
    "Punjabi":   "pan_Guru",
    "Malayalam": "mal_Mlym",
    "Manipuri":  "mni_Beng",
    "Telugu":    "tel_Telu",
    "Sanskrit":  "san_Deva",
    "Nepali":    "npi_Deva",
    "Santali":   "sat_Olck",
    "Gujarati":  "guj_Gujr",
    "Odia":      "ory_Orya",
}

# BCP-47 / ISO 639-3 codes used by Bhashini NMT API
LANGUAGE_TO_BHASHINI: dict[str, str] = {
    "Hindi":     "hi",
    "Gom":       "gom",
    "Kannada":   "kn",
    "Dogri":     "doi",
    "Bodo":      "brx",
    "Urdu":      "ur",
    "Tamil":     "ta",
    "Kashmiri":  "ks",
    "Assamese":  "as",
    "Bengali":   "bn",
    "Marathi":   "mr",
    "Sindhi":    "sd",
    "Maithili":  "mai",
    "Punjabi":   "pa",
    "Malayalam": "ml",
    "Manipuri":  "mni",
    "Telugu":    "te",
    "Sanskrit":  "sa",
    "Nepali":    "ne",
    "Santali":   "sat",
    "Gujarati":  "gu",
    "Odia":      "or",
}

# ---------------------------------------------------------------------------
# Model globals (local provider only — None when using Bhashini)
# ---------------------------------------------------------------------------
_model_en_indic = None
_tokenizer_en_indic = None
_model_indic_en = None
_tokenizer_indic_en = None
_processor = None
_device: str = "cpu"

# Bhashini NMT service ID — fetched once at startup via pipeline config API
_bhashini_nmt_service_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Local model loader
# ---------------------------------------------------------------------------
def _load_models() -> None:
    global _model_en_indic, _tokenizer_en_indic, _model_indic_en, _tokenizer_indic_en, _processor, _device

    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    from IndicTransToolkit.processor import IndicProcessor

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Loading models on device=%s", _device)

    logger.info("Loading en-indic model from %s (cache: %s)", HF_EN_INDIC_MODEL_ID, EN_INDIC_MODEL_DIR)
    os.makedirs(EN_INDIC_MODEL_DIR, exist_ok=True)
    _tokenizer_en_indic = AutoTokenizer.from_pretrained(
        HF_EN_INDIC_MODEL_ID, trust_remote_code=True, cache_dir=EN_INDIC_MODEL_DIR
    )
    torch_dtype = torch.float16 if _device == "cuda" else torch.float32
    _model_en_indic = AutoModelForSeq2SeqLM.from_pretrained(
        HF_EN_INDIC_MODEL_ID,
        trust_remote_code=True,
        torch_dtype=torch_dtype,
        cache_dir=EN_INDIC_MODEL_DIR,
    ).to(_device)
    _model_en_indic.eval()

    logger.info("Loading indic-en model from %s (cache: %s)", HF_INDIC_EN_MODEL_ID, INDIC_EN_MODEL_DIR)
    os.makedirs(INDIC_EN_MODEL_DIR, exist_ok=True)
    _tokenizer_indic_en = AutoTokenizer.from_pretrained(
        HF_INDIC_EN_MODEL_ID, trust_remote_code=True, cache_dir=INDIC_EN_MODEL_DIR
    )
    _model_indic_en = AutoModelForSeq2SeqLM.from_pretrained(
        HF_INDIC_EN_MODEL_ID,
        trust_remote_code=True,
        torch_dtype=torch_dtype,
        cache_dir=INDIC_EN_MODEL_DIR,
    ).to(_device)
    _model_indic_en.eval()

    _processor = IndicProcessor(inference=True)
    logger.info("Both models loaded successfully.")


# ---------------------------------------------------------------------------
# Bhashini initializer
# ---------------------------------------------------------------------------
def _init_bhashini() -> None:
    """Fetch and cache the Bhashini NMT service ID via the pipeline config API."""
    global _bhashini_nmt_service_id

    if not BHASHINI_USER_ID or not BHASHINI_API_KEY:
        logger.error(
            "BHASHINI_USER_ID or BHASHINI_API_KEY not set — "
            "Bhashini translation will not work."
        )
        return

    logger.info("Fetching Bhashini NMT service ID from pipeline config API...")
    try:
        resp = _http.post(
            BHASHINI_PIPELINE_CONFIG_URL,
            headers={
                "userID": BHASHINI_USER_ID,
                "ulcaApiKey": BHASHINI_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "pipelineTasks": [{
                    "taskType": "translation",
                    "config": {
                        "language": {
                            "sourceLanguage": "en",
                            "targetLanguage": "hi",
                        }
                    },
                }],
                "pipelineRequestConfig": {
                    "pipelineId": BHASHINI_PIPELINE_ID,
                },
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        pipeline_resp = data.get("pipelineResponseConfig", [])
        if pipeline_resp:
            configs = pipeline_resp[0].get("config", [])
            all_ids = [c.get("serviceId", "") for c in configs]
            logger.info("Bhashini NMT available service IDs: %s", all_ids)
            _bhashini_nmt_service_id = next(
                (sid for sid in all_ids if "ai4bharat" in sid), all_ids[0] if all_ids else ""
            )

        if _bhashini_nmt_service_id:
            logger.info("Bhashini NMT selected service ID: %s", _bhashini_nmt_service_id)
        else:
            logger.error(
                "Could not extract NMT service ID from Bhashini response. "
                "Full response: %s", data
            )
    except Exception as exc:
        logger.error("Bhashini pipeline config call failed: %s", exc)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    if TRANSLATION_PROVIDER == "bhashini":
        logger.info("TRANSLATION_PROVIDER=bhashini — skipping local model load")
        _init_bhashini()
    else:
        if TRANSLATION_PROVIDER != "local":
            logger.warning(
                "Unknown TRANSLATION_PROVIDER='%s', defaulting to 'local'",
                TRANSLATION_PROVIDER,
            )
        _load_models()
    yield


app = FastAPI(title="Translation Server", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Auth (optional)
# ---------------------------------------------------------------------------
_bearer = HTTPBearer(auto_error=False)


def verify_key(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)):
    if API_KEY is None:
        return
    if credentials is None or credentials.credentials != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------
class TranslateRequest(BaseModel):
    text: str
    language: str
    batch_size: int = 4


class TranslateResponse(BaseModel):
    translated: str
    language: str
    flores_code: str


class TranslateToEnglishRequest(BaseModel):
    text: str
    language: str
    batch_size: int = 4


class TranslateToEnglishResponse(BaseModel):
    translated: str
    language: str
    flores_code: str


# ---------------------------------------------------------------------------
# Markdown helpers
# ---------------------------------------------------------------------------

def _extract_leading_marker(line: str) -> tuple[str, str]:
    """Split a line into its leading markdown structural marker and the content."""
    m = re.match(r'^(#{1,6} +)', line)
    if m:
        return m.group(1), line[m.end():]

    m = re.match(r'^(\s*[-*+] +)', line)
    if m:
        return m.group(1), line[m.end():]

    m = re.match(r'^(\s*\d+\. +)', line)
    if m:
        return m.group(1), line[m.end():]

    m = re.match(r'^(>+ *)', line)
    if m:
        return m.group(1), line[m.end():]

    return '', line


def _strip_inline_markdown(text: str) -> str:
    """Strip bold/italic/code/strikethrough markers, keeping only the text."""
    text = re.sub(r'\*{3}(.+?)\*{3}', r'\1', text)
    text = re.sub(r'_{3}(.+?)_{3}', r'\1', text)
    text = re.sub(r'\*{2}(.+?)\*{2}', r'\1', text)
    text = re.sub(r'_{2}(.+?)_{2}', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'_(.+?)_', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    text = re.sub(r'~~(.+?)~~', r'\1', text)
    return text


def _is_non_translatable(stripped: str) -> bool:
    """Return True for lines that carry no translatable text (rules, table separators)."""
    if re.match(r'^[-_*=]{3,}$', stripped):
        return True
    if '|' in stripped and re.match(r'^[\|\-\s:]+$', stripped):
        return True
    return False


# ---------------------------------------------------------------------------
# Markdown-aware translation dispatcher
# ---------------------------------------------------------------------------

def _translate_markdown(
    text: str,
    translate_batch_fn: Callable[[list[str]], list[str]],
    batch_size: int,
) -> str:
    """
    Apply translate_batch_fn to all translatable lines in text while preserving
    markdown structure (headers, lists, blockquotes, fenced code blocks).

    translate_batch_fn receives a list of plain strings and returns translated
    strings in the same order.
    """
    lines = text.split('\n')
    output: list[str] = list(lines)
    translatable: list[tuple[int, str, str]] = []
    in_code_block = False

    for idx, line in enumerate(lines):
        stripped = line.strip()

        if stripped.startswith('```'):
            in_code_block = not in_code_block
            continue
        if in_code_block or not stripped:
            continue
        if _is_non_translatable(stripped):
            continue

        marker, content = _extract_leading_marker(line)
        clean = _strip_inline_markdown(content).strip()
        if not clean:
            output[idx] = marker.rstrip()
            continue

        translatable.append((idx, marker, clean))

    if not translatable:
        return text

    texts_to_translate = [item[2] for item in translatable]
    translated_texts: list[str] = []

    for i in range(0, len(texts_to_translate), batch_size):
        batch = texts_to_translate[i : i + batch_size]
        translated_texts.extend(translate_batch_fn(batch))

    for (line_idx, marker, _), translated in zip(translatable, translated_texts):
        output[line_idx] = marker + translated

    return '\n'.join(output)


# ---------------------------------------------------------------------------
# Local IndicTrans2 translation
# ---------------------------------------------------------------------------

def _local_en_to_indic_batch(batch: list[str], tgt_flores: str) -> list[str]:
    if _model_en_indic is None:
        raise RuntimeError("Local en-indic model not loaded")
    preprocessed = _processor.preprocess_batch(batch, src_lang="eng_Latn", tgt_lang=tgt_flores)
    inputs = _tokenizer_en_indic(
        preprocessed,
        truncation=True,
        padding="longest",
        return_tensors="pt",
        return_attention_mask=True,
    ).to(_device)
    with torch.no_grad():
        generated = _model_en_indic.generate(
            **inputs, use_cache=True, min_length=0, max_length=512, num_beams=5, num_return_sequences=1,
        )
    decoded = _tokenizer_en_indic.batch_decode(generated, skip_special_tokens=True, clean_up_tokenization_spaces=True)
    return _processor.postprocess_batch(decoded, lang=tgt_flores)


def _local_indic_to_en_batch(batch: list[str], src_flores: str) -> list[str]:
    if _model_indic_en is None:
        raise RuntimeError("Local indic-en model not loaded")
    preprocessed = _processor.preprocess_batch(batch, src_lang=src_flores, tgt_lang="eng_Latn")
    inputs = _tokenizer_indic_en(
        preprocessed,
        truncation=True,
        padding="longest",
        return_tensors="pt",
        return_attention_mask=True,
    ).to(_device)
    with torch.no_grad():
        generated = _model_indic_en.generate(
            **inputs, use_cache=True, min_length=0, max_length=512, num_beams=5, num_return_sequences=1,
        )
    decoded = _tokenizer_indic_en.batch_decode(generated, skip_special_tokens=True, clean_up_tokenization_spaces=True)
    return _processor.postprocess_batch(decoded, lang="eng_Latn")


def _run_translation(text: str, tgt_flores: str, batch_size: int) -> str:
    return _translate_markdown(
        text,
        lambda batch: _local_en_to_indic_batch(batch, tgt_flores),
        batch_size,
    )


def _run_translation_to_english(text: str, src_flores: str, batch_size: int) -> str:
    return _translate_markdown(
        text,
        lambda batch: _local_indic_to_en_batch(batch, src_flores),
        batch_size,
    )


# ---------------------------------------------------------------------------
# Bhashini NMT translation
# ---------------------------------------------------------------------------

def _bhashini_call_batch(texts: list[str], src_lang: str, tgt_lang: str) -> list[str]:
    """Single Bhashini inference call translating a batch of strings."""
    if not _bhashini_nmt_service_id:
        raise RuntimeError(
            "Bhashini NMT service ID not initialized. "
            "Check startup logs for pipeline config errors."
        )
    payload = {
        "pipelineTasks": [{
            "taskType": "translation",
            "config": {
                "language": {
                    "sourceLanguage": src_lang,
                    "targetLanguage": tgt_lang,
                },
                "serviceId": _bhashini_nmt_service_id,
            },
        }],
        "inputData": {
            "input": [{"source": t} for t in texts],
        },
    }
    resp = _http.post(
        BHASHINI_INFERENCE_URL,
        headers={
            "Authorization": BHASHINI_AUTH_TOKEN,
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    outputs = data["pipelineResponse"][0]["output"]
    return [item["target"] for item in outputs]


def _bhashini_translate(text: str, tgt_lang: str, batch_size: int) -> str:
    return _translate_markdown(
        text,
        lambda batch: _bhashini_call_batch(batch, "en", tgt_lang),
        batch_size,
    )


def _bhashini_translate_to_english(text: str, src_lang: str, batch_size: int) -> str:
    return _translate_markdown(
        text,
        lambda batch: _bhashini_call_batch(batch, src_lang, "en"),
        batch_size,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "provider": TRANSLATION_PROVIDER,
        "device": _device if TRANSLATION_PROVIDER == "local" else "cloud",
        "models": {
            "en_indic": HF_EN_INDIC_MODEL_ID if TRANSLATION_PROVIDER == "local" else "bhashini-nmt",
            "indic_en": HF_INDIC_EN_MODEL_ID if TRANSLATION_PROVIDER == "local" else "bhashini-nmt",
        },
        "bhashini_service_id": _bhashini_nmt_service_id if TRANSLATION_PROVIDER == "bhashini" else None,
    }


@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest, _=Depends(verify_key)):
    if not req.text or not req.text.strip():
        return TranslateResponse(translated=req.text, language=req.language, flores_code="")

    language_key = req.language.strip().title()

    if language_key == "English":
        return TranslateResponse(translated=req.text, language=req.language, flores_code="eng_Latn")

    if TRANSLATION_PROVIDER == "bhashini":
        tgt_lang = LANGUAGE_TO_BHASHINI.get(language_key)
        if tgt_lang is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported language: '{req.language}'. "
                       f"Supported: {sorted(LANGUAGE_TO_BHASHINI.keys())}",
            )
        try:
            translated = _bhashini_translate(req.text, tgt_lang, req.batch_size)
        except Exception as exc:
            logger.error("Bhashini translation failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Translation error: {exc}",
            )
        return TranslateResponse(
            translated=translated,
            language=req.language,
            flores_code=LANGUAGE_TO_FLORES.get(language_key, ""),
        )
    else:
        tgt_flores = LANGUAGE_TO_FLORES.get(language_key)
        if tgt_flores is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported language: '{req.language}'. "
                       f"Supported: {sorted(LANGUAGE_TO_FLORES.keys())}",
            )
        try:
            translated = _run_translation(req.text, tgt_flores, req.batch_size)
        except Exception as exc:
            logger.error("Translation failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Translation error: {exc}",
            )
        return TranslateResponse(translated=translated, language=req.language, flores_code=tgt_flores)


@app.post("/translate-to-english", response_model=TranslateToEnglishResponse)
def translate_to_english(req: TranslateToEnglishRequest, _=Depends(verify_key)):
    if not req.text or not req.text.strip():
        return TranslateToEnglishResponse(translated=req.text, language=req.language, flores_code="")

    language_key = req.language.strip().title()

    if language_key == "English":
        return TranslateToEnglishResponse(
            translated=req.text, language=req.language, flores_code="eng_Latn"
        )

    if TRANSLATION_PROVIDER == "bhashini":
        src_lang = LANGUAGE_TO_BHASHINI.get(language_key)
        if src_lang is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported language: '{req.language}'. "
                       f"Supported: {sorted(LANGUAGE_TO_BHASHINI.keys())}",
            )
        try:
            translated = _bhashini_translate_to_english(req.text, src_lang, req.batch_size)
        except Exception as exc:
            logger.error("Bhashini translation to English failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Translation error: {exc}",
            )
        return TranslateToEnglishResponse(
            translated=translated,
            language=req.language,
            flores_code=LANGUAGE_TO_FLORES.get(language_key, ""),
        )
    else:
        src_flores = LANGUAGE_TO_FLORES.get(language_key)
        if src_flores is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unsupported language: '{req.language}'. "
                       f"Supported: {sorted(LANGUAGE_TO_FLORES.keys())}",
            )
        try:
            translated = _run_translation_to_english(req.text, src_flores, req.batch_size)
        except Exception as exc:
            logger.error("Translation to English failed: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Translation error: {exc}",
            )
        return TranslateToEnglishResponse(
            translated=translated, language=req.language, flores_code=src_flores
        )
