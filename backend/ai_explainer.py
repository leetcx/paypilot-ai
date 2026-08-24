import json
import os
from typing import Any, Dict, Optional

try:
    from openai import OpenAI

    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class AIExplanationEngine:

  def __init__(
      self, api_key: Optional[str] = None, model: str = "gpt-4o-mini"
  ):
    self.api_key = (
        api_key or os.getenv("OPENAI_API_KEY") or os.getenv("GROQ_API_KEY")
    )
    self.model = model
    self.client = None
    if OPENAI_AVAILABLE and self.api_key:
      base_url = os.getenv("LLM_BASE_URL", None)
      self.client = OpenAI(api_key=self.api_key, base_url=base_url)

  def generate_explanation(
      self, risk_result: Dict[str, Any], tx_data: Dict[str, Any]
  ) -> Dict[str, Any]:
    prompt = f"""
        Analyze this payment risk evaluation and return strict JSON:
        TRANSACTION: Amount: INR {tx_data.get('amount_inr')}, Method: {tx_data.get('payment_method')}, IP: {tx_data.get('ip_address')}, Device: {tx_data.get('device_id')}
        EVALUATION: Score: {risk_result.get('risk_score')}/100, Tier: {risk_result.get('risk_tier')}, Action: {risk_result.get('recommended_action')}, Signals: {risk_result.get('detected_signals', [])}

        Return JSON format:
        {{
            "headline": "Short verdict",
            "plain_english_rationale": "Clear root-cause explanation for the merchant",
            "primary_risk_drivers": ["Top risk factors"],
            "chargeback_probability": "LOW / MODERATE / HIGH / SEVERE",
            "recommended_checkout_action": "e.g. Enforce 3DS OTP, Allow, Block",
            "merchant_recovery_tip": "Revenue recovery recommendation"
        }}
        """
    if self.client:
      try:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are PayPilot AI, an expert payment risk analyst"
                        " for Razorpay. Return valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(response.choices[0].message.content)
      except Exception:
        return self._local_fallback(risk_result, tx_data)
    return self._local_fallback(risk_result, tx_data)

  def _local_fallback(
      self, risk_result: Dict[str, Any], tx_data: Dict[str, Any]
  ) -> Dict[str, Any]:
    tier = risk_result.get("risk_tier", "LOW")
    signals = risk_result.get("detected_signals", [])
    amount = tx_data.get("amount_inr", 0)

    if tier in ["CRITICAL", "HIGH"]:
      return {
          "headline": (
              f"Elevated fraud exposure detected on ₹{amount:,.2f}"
              " transaction."
          ),
          "plain_english_rationale": (
              "Transaction triggered critical risk rules: "
              + (", ".join(signals) if signals else "High velocity/anomaly")
          ),
          "primary_risk_drivers": (
              signals if signals else ["Anomalous transaction velocity"]
          ),
          "chargeback_probability": "HIGH",
          "recommended_checkout_action": (
              risk_result.get("recommended_action") or "REQUIRE_STEP_UP_AUTH"
          ),
          "merchant_recovery_tip": (
              "Enforce biometric or SMS OTP verification before processing."
          ),
      }
    return {
        "headline": f"Low risk profile verified for ₹{amount:,.2f}.",
        "plain_english_rationale": (
            "Behavior and network checks match established legitimate patterns."
        ),
        "primary_risk_drivers": ["Standard baseline check"],
        "chargeback_probability": "LOW",
        "recommended_checkout_action": "ALLOW",
        "merchant_recovery_tip": (
            "Enable 1-click checkout to minimize cart abandonment."
        ),
    }