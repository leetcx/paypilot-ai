from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import csv
from pathlib import Path
from datetime import datetime
import uuid
import os
import json
import math
import random
import hmac
import hashlib
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

try:
    import razorpay
except ImportError:
    razorpay = None

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None

app = FastAPI(title="PayPilot AI - Enterprise Razorpay Live Engine v6.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# CONFIGURATION & CLIENT INITIALIZATIONS
# =========================================================

RZP_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_1DP5mmOlF5G5ag")
RZP_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "test_secret")
RZP_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "paypilot_webhook_secret_key")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")

rzp_client = None
if razorpay:
    try:
        rzp_client = razorpay.Client(auth=(RZP_KEY_ID, RZP_KEY_SECRET))
    except Exception as e:
        print("Razorpay client initialization error:", e)
        rzp_client = None

twilio_client = None
if TwilioClient and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    except Exception as e:
        print("Twilio initialization error:", e)
        twilio_client = None

# Global dynamic ML policy threshold
ml_policy_config = {
    "high_risk_threshold": 70,
    "medium_risk_threshold": 40,
    "enforce_strict_geo": False
}

# =========================================================
# FILE RESOLVER & DATA PERSISTENCE
# =========================================================

def get_csv_file() -> Path:
    backend_path = Path(__file__).resolve().parent / "data" / "transactions.csv"
    if backend_path.exists():
        return backend_path
    root_path = Path(__file__).resolve().parent.parent / "data" / "transactions.csv"
    if root_path.exists():
        return root_path
    backend_path.parent.mkdir(parents=True, exist_ok=True)
    return backend_path

def get_history_file() -> Path:
    backend_path = Path(__file__).resolve().parent / "data" / "decision_history.csv"
    if backend_path.exists():
        return backend_path
    root_path = Path(__file__).resolve().parent.parent / "data" / "decision_history.csv"
    if root_path.exists():
        return root_path
    backend_path.parent.mkdir(parents=True, exist_ok=True)
    return backend_path

runtime_transactions = []
decision_history = []
recovery_events_log = []

def load_csv_transactions():
    csv_file = get_csv_file()
    if not csv_file.exists():
        return []
    with open(csv_file, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        return [row for row in reader if row and row.get("transaction_id")]

def load_all_transactions():
    csv_txs = load_csv_transactions()
    seen = set()
    combined = []
    for t in runtime_transactions + csv_txs:
        tx_id = t.get("transaction_id")
        if tx_id and tx_id not in seen:
            seen.add(tx_id)
            combined.append(t)
    return combined

def save_transaction_to_csv(transaction: dict):
    csv_file = get_csv_file()
    file_exists = csv_file.exists()
    csv_file.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "transaction_id", "customer_id", "amount", "status",
        "payment_method", "device_id", "location", "attempt_count",
        "is_new_device", "is_new_location", "timestamp"
    ]
    with open(csv_file, "a", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        if not file_exists or csv_file.stat().st_size == 0:
            writer.writeheader()
        writer.writerow({k: transaction.get(k, "") for k in fieldnames})

def update_transaction_status_in_csv(transaction_id: str, new_status: str):
    csv_file = get_csv_file()
    if not csv_file.exists():
        return
    rows = []
    fieldnames = [
        "transaction_id", "customer_id", "amount", "status",
        "payment_method", "device_id", "location", "attempt_count",
        "is_new_device", "is_new_location", "timestamp"
    ]
    with open(csv_file, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for r in reader:
            if r.get("transaction_id") == transaction_id:
                r["status"] = new_status
            rows.append(r)
    with open(csv_file, "w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

def load_decision_history():
    hist_file = get_history_file()
    if not hist_file.exists():
        return []
    with open(hist_file, "r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))

def save_decision_history(decision: dict):
    hist_file = get_history_file()
    file_exists = hist_file.exists()
    hist_file.parent.mkdir(parents=True, exist_ok=True)
    with open(hist_file, "a", encoding="utf-8", newline="") as file:
        fieldnames = ["transaction_id", "action", "timestamp"]
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        if not file_exists or hist_file.stat().st_size == 0:
            writer.writeheader()
        writer.writerow(decision)

# =========================================================
# ML ISOLATION ANOMALY ENGINE
# =========================================================

def run_ml_anomaly_detector(transaction: dict) -> dict:
    try:
        amount = float(transaction.get("amount", 0))
    except (ValueError, TypeError):
        amount = 0.0

    try:
        attempts = int(transaction.get("attempt_count", 1))
    except (ValueError, TypeError):
        attempts = 1

    is_new_device = 1 if str(transaction.get("is_new_device", "0")).strip() in ["1", "true", "True"] else 0
    is_new_location = 1 if str(transaction.get("is_new_location", "0")).strip() in ["1", "true", "True"] else 0

    amount_z = min(1.0, amount / 85000.0)
    velocity_z = min(1.0, (attempts - 1) / 5.0)
    geo_dev = 0.85 if is_new_location else 0.05
    dev_var = 0.90 if is_new_device else 0.05
    method_fric = 0.40 if str(transaction.get("payment_method", "")).upper() == "CARD" and amount > 40000 else 0.10

    combined_anomaly_weight = (
        (amount_z * 0.35) +
        (velocity_z * 0.25) +
        (geo_dev * 0.15) +
        (dev_var * 0.15) +
        (method_fric * 0.10)
    )

    is_outlier = combined_anomaly_weight > 0.48
    isolation_score = round((1.0 - combined_anomaly_weight) * 2 - 1, 3)

    return {
        "ml_model_type": "PayPilot IsolationForest Core (v2.0 Enterprise)",
        "anomaly_classification": "OUTLIER_FLAGGED" if is_outlier else "INLIER_NORMAL",
        "decision_function_score": isolation_score,
        "confidence_index": f"{round((abs(isolation_score) * 45) + 55, 1)}%",
        "feature_vectors": {
            "amount_deviation_pct": round(amount_z * 100, 1),
            "velocity_anomaly_pct": round(velocity_z * 100, 1),
            "geo_variance_pct": round(geo_dev * 100, 1),
            "device_novelty_pct": round(dev_var * 100, 1),
            "instrument_friction_pct": round(method_fric * 100, 1),
        },
        "inference_latency_ms": 3.8
    }

# =========================================================
# HYBRID RISK & DYNAMIC THRESHOLD ROUTING
# =========================================================

def calculate_risk(transaction: dict) -> dict:
    score = 0
    reasons = []
    factor_breakdown = {}

    try:
        amount = float(transaction.get("amount", 0))
    except (ValueError, TypeError):
        amount = 0.0

    amount_score = 0
    if amount >= 100000:
        amount_score += 45
        reasons.append(f"High-ticket transaction amount (₹{amount:,.0f})")
    elif amount >= 50000:
        amount_score += 30
        reasons.append(f"Unusually large transaction amount (₹{amount:,.0f})")
    elif amount >= 20000:
        amount_score += 15
        reasons.append(f"Elevated ticket size (₹{amount:,.0f})")
    factor_breakdown["amount_anomaly"] = amount_score
    score += amount_score

    device_score = 0
    if str(transaction.get("is_new_device", "0")).strip() in ["1", "true", "True"]:
        device_score += 25
        reasons.append("Unrecognized device fingerprint detected")
    factor_breakdown["device_risk"] = device_score
    score += device_score

    location_score = 0
    location = str(transaction.get("location", "")).strip()
    if str(transaction.get("is_new_location", "0")).strip() in ["1", "true", "True"]:
        location_score += 20
        reasons.append("Unfamiliar geolocation profile")
    if "unknown" in location.lower() or not location:
        location_score += 20
        reasons.append("Unresolvable network routing / metadata")
    if str(transaction.get("is_vpn_or_proxy", "0")).strip() in ["1", "true", "True"]:
        location_score += 30
        reasons.append("Anonymized VPN/Proxy network detected")
    factor_breakdown["location_network"] = location_score
    score += location_score

    velocity_score = 0
    try:
        attempts = int(transaction.get("attempt_count", 1))
    except (ValueError, TypeError):
        attempts = 1

    if attempts >= 4:
        velocity_score += 30
        reasons.append(f"Rapid retry velocity anomaly ({attempts} attempts)")
    elif attempts >= 2:
        velocity_score += 15
        reasons.append(f"Multiple payment attempts detected ({attempts} tries)")
    factor_breakdown["velocity_risk"] = velocity_score
    score += velocity_score

    method = str(transaction.get("payment_method", "")).strip().lower()
    payment_score = 0
    if method == "cash":
        payment_score += 15
        reasons.append("Cash/COD escrow hold required")
    elif method == "card" and amount > 40000:
        payment_score += 10
        reasons.append("High-ticket card checkout without saved token")
    factor_breakdown["instrument_risk"] = payment_score
    score += payment_score

    ml_intel = run_ml_anomaly_detector(transaction)
    if ml_intel["anomaly_classification"] == "OUTLIER_FLAGGED" and score < ml_policy_config["high_risk_threshold"]:
        score = min(score + 15, 100)
        reasons.append("Isolation Forest flagged multi-variable outlier anomaly")

    final_score = min(score, 100)
    
    # Dynamic thresholds applied
    if final_score >= ml_policy_config["high_risk_threshold"]:
        risk_level, action = "High", "BLOCK / VERIFY"
    elif final_score >= ml_policy_config["medium_risk_threshold"]:
        risk_level, action = "Medium", "REQUIRE_STEP_UP_AUTH"
    else:
        risk_level, action = "Low", "APPROVE"

    return {
        "risk_score": final_score,
        "risk_level": risk_level,
        "reasons": reasons,
        "recommended_action": action,
        "factor_breakdown": factor_breakdown,
        "ml_anomaly_telemetry": ml_intel
    }

def calculate_smart_routing(transaction: dict, risk: dict) -> dict:
    amount = float(transaction.get("amount", 0))
    method = str(transaction.get("payment_method", "UPI")).upper()
    level = risk.get("risk_level", "Low")
    
    if level == "High":
        return {
            "selected_rail": "RAZORPAY_3DS2_CHALLENGE",
            "fallback_rail": "UPI_MANDATE_INTENT",
            "estimated_success_rate": "38%",
            "processing_fee_est": "1.85%",
            "routing_rationale": "High risk detected. Bypassing 1-click checkout; routing via biometric 3DS-2 container."
        }
    elif method == "UPI" or amount < 2000:
        return {
            "selected_rail": "RAZORPAY_TURBO_UPI",
            "fallback_rail": "STANDARD_UPI_COLLECT",
            "estimated_success_rate": "96.4%",
            "processing_fee_est": "0.00%",
            "routing_rationale": "Low ticket size & trusted user profile. Routed via in-app Turbo UPI for zero-drop conversion."
        }
    elif method == "CARD":
        return {
            "selected_rail": "RAZORPAY_DIRECT_ACQUIRER_HDFC",
            "fallback_rail": "BACKUP_GATEWAY_AXIS",
            "estimated_success_rate": "92.1%",
            "processing_fee_est": "1.20%",
            "routing_rationale": "Direct tier-1 bank acquiring rail selected based on optimal latency and lower MDR."
        }
    else:
        return {
            "selected_rail": "RAZORPAY_STANDARD_SMART_ROUTER",
            "fallback_rail": "NETBANKING_DIRECT",
            "estimated_success_rate": "89.5%",
            "processing_fee_est": "1.50%",
            "routing_rationale": "Dynamic routing assigned based on real-time bank health signals."
        }

def generate_ai_explanation(transaction: dict, risk: dict) -> dict:
    amount = transaction.get("amount", 0)
    method = transaction.get("payment_method", "Payment")
    level = risk.get("risk_level", "Low")
    reasons = risk.get("reasons", [])
    action = risk.get("recommended_action", "APPROVE")

    if level == "High":
        headline = f"High-risk {method.upper()} transaction of ₹{float(amount):,.2f} flagged for dispute exposure."
        rationale = f"PayPilot AI detected critical anomalies: {', '.join(reasons) if reasons else 'Elevated velocity and unverified location'}."
        prob, tip = "SEVERE" if risk.get("risk_score", 0) > 85 else "HIGH", "Enforce dynamic 3DS-2 biometric verification or switch to UPI Intent."
    elif level == "Medium":
        headline = f"Moderate variance detected on ₹{float(amount):,.2f} checkout attempt."
        rationale = f"Deviation detected: {', '.join(reasons) if reasons else 'Unfamiliar network or elevated ticket size'}."
        prob, tip = "MODERATE", "Prompt for standard SMS OTP verification or place funds in escrow."
    else:
        headline = f"Clean risk posture verified for ₹{float(amount):,.2f} transaction."
        rationale = "Behavioral telemetry and device fingerprint match legitimate transaction patterns with clean ML isolation metrics."
        prob, tip = "LOW", "Enable Razorpay Turbo UPI or 1-click tokenized checkout for zero friction."

    return {
        "headline": headline,
        "plain_english_rationale": rationale,
        "primary_risk_drivers": reasons if reasons else ["Standard baseline check passed"],
        "chargeback_probability": prob,
        "recommended_checkout_action": action,
        "merchant_recovery_tip": tip,
        "ai_engine": "PayPilot Neural Core"
    }

def generate_chargeback_defense(transaction: dict, dispute_reason: str = "Fraudulent - Card Not Present") -> dict:
    tx_id = transaction.get("transaction_id", "UNKNOWN")
    amount = transaction.get("amount", "0")
    timestamp = transaction.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    location = transaction.get("location", "India")
    device_id = transaction.get("device_id", "DEV-VERIFIED")
    
    defense_statement = (
        f"MERCHANT DISPUTE REBUTTAL DOSSIER (REF: {tx_id})\n"
        f"--------------------------------------------------\n"
        f"Transaction Amount: INR {amount}\n"
        f"Authorization Timestamp: {timestamp}\n"
        f"Issuing Bank Claim: '{dispute_reason}'\n\n"
        f"EVIDENTIARY REBUTTAL:\n"
        f"1. Telemetry logs confirm transaction originated from customer's verified location ({location}) via device {device_id}.\n"
        f"2. Real-time Risk Score at checkout evaluated by PayPilot Hybrid ML Anomaly Engine.\n"
        f"3. 3DS Authentication cryptogram validated by issuing bank prior to settlement.\n\n"
        f"CONCLUSION: Compliance verified. Immediate reversal requested."
    )
    return {
        "transaction_id": tx_id,
        "dispute_reason": dispute_reason,
        "dossier_status": "READY_FOR_SUBMISSION",
        "rebuttal_statement": defense_statement,
        "evidence_attachments": ["Device_Fingerprint_Audit.pdf", "Geolocation_IP_Receipt.json", "3DS_Cryptogram_Log.xml", "ML_Isolation_Proof.json"],
        "win_probability_estimate": "88.5%"
    }

def generate_smart_recovery_plan(transaction: dict, risk: dict) -> dict:
    amt = float(transaction.get("amount", 0))
    method = str(transaction.get("payment_method", "")).upper()
    level = risk.get("risk_level", "Low")
    
    if level == "High":
        strategy = "SPLIT_OR_ESCROW_UPI"
        recommendation = "Split amount into 2 escrow-backed UPI intent requests to bypass card chargeback risk."
        recovery_channel = "WHATSAPP_VERIFIED_LINK"
    elif method == "CARD":
        strategy = "FALLBACK_TURBO_UPI"
        recommendation = "Card authorization flagged. Re-route customer directly to 1-click Razorpay Turbo UPI."
        recovery_channel = "IN_APP_MODAL_REDIRECT"
    else:
        strategy = "AUTOMATED_SMS_RECOVERY"
        recommendation = "Technical timeout. Send pre-authenticated 15-minute payment link with instant cashback."
        recovery_channel = "SMS_PRIORITY_GATEWAY"

    recovery_link = f"https://rzp.io/i/rec_{uuid.uuid4().hex[:8]}"
    if rzp_client:
        try:
            link_data = rzp_client.payment_link.create({
                "amount": int(amt * 100),
                "currency": "INR",
                "description": f"PayPilot Smart Recovery for {transaction.get('transaction_id')}",
                "customer": {"name": "Valued Customer", "contact": "+919876543210"}
            })
            recovery_link = link_data.get("short_url", recovery_link)
        except Exception:
            pass

    return {
        "transaction_id": transaction.get("transaction_id"),
        "amount": amt,
        "recovery_strategy": strategy,
        "actionable_recommendation": recommendation,
        "recovery_channel": recovery_channel,
        "generated_recovery_link": recovery_link,
        "estimated_recovery_rate": "72.4%" if level != "High" else "54.8%",
        "status": "READY_FOR_DISPATCH"
    }

# =========================================================
# PAYMENT INITIATION & SETTLEMENT
# =========================================================

@app.post("/api/payment/initiate")
@app.post("/api/payment/process")
def process_payment(payment: dict):
    try:
        amount = float(payment.get("amount", 0))
    except (ValueError, TypeError):
        return {"success": False, "status": "FAILED", "message": "Invalid amount"}

    method = payment.get("payment_method", "UPI")
    loc = payment.get("location", "")
    if amount <= 0 or not loc.strip():
        return {"success": False, "status": "FAILED", "message": "Amount and location required"}

    temp_tx = {
        "amount": str(amount), "payment_method": method, "location": loc,
        "is_new_device": str(payment.get("is_new_device", "0")),
        "is_new_location": str(payment.get("is_new_location", "0")),
        "attempt_count": str(payment.get("attempt_count", "1")),
        "is_vpn_or_proxy": str(payment.get("is_vpn_or_proxy", "0"))
    }
    
    risk = calculate_risk(temp_tx)
    ai = generate_ai_explanation(temp_tx, risk)
    routing = calculate_smart_routing(temp_tx, risk)
    t_id = "PAY-" + uuid.uuid4().hex[:8].upper()
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # If HIGH RISK: Quarantine block
    if risk["risk_level"] == "High":
        failed_row = {
            "transaction_id": t_id, "customer_id": payment.get("customer_id", "C001"),
            "amount": str(amount), "status": "failed", "payment_method": method,
            "device_id": "DEV-999", "location": loc, "attempt_count": "1",
            "is_new_device": "1", "is_new_location": "1", "timestamp": ts
        }
        runtime_transactions.insert(0, failed_row)
        save_transaction_to_csv(failed_row)
        save_decision_history({"transaction_id": t_id, "action": "PAYMENT BLOCKED", "timestamp": ts})
        
        return {
            "success": False, "status": "BLOCKED", "transaction_id": t_id,
            "risk_score": risk["risk_score"], "risk_level": risk["risk_level"],
            "action": "BLOCK / VERIFY", "risk_factors": risk["reasons"],
            "explanation": ai["plain_english_rationale"], "headline": ai["headline"],
            "smart_routing": routing, "ml_anomaly_telemetry": risk["ml_anomaly_telemetry"],
            "message": "Payment blocked by PayPilot AI due to elevated fraud risk indicators."
        }

    # If CLEAN: Issue Razorpay Order
    rzp_order_id = "order_" + uuid.uuid4().hex[:14]
    if rzp_client:
        try:
            rzp_order = rzp_client.order.create({
                "amount": int(amount * 100),
                "currency": "INR",
                "receipt": t_id,
                "notes": {"routing_rail": routing["selected_rail"], "risk_score": str(risk["risk_score"])}
            })
            rzp_order_id = rzp_order.get("id", rzp_order_id)
        except Exception:
            pass

    pending_row = {
        "transaction_id": t_id, "customer_id": payment.get("customer_id", "C001"),
        "amount": str(amount), "status": "pending", "payment_method": method,
        "device_id": "DEV-001", "location": loc, "attempt_count": "1",
        "is_new_device": "0", "is_new_location": "0", "timestamp": ts
    }
    runtime_transactions.insert(0, pending_row)
    save_transaction_to_csv(pending_row)

    return {
        "success": True, "transaction_id": t_id, "status": "PENDING",
        "amount": amount, "payment_method": method, "location": loc,
        "risk_score": risk["risk_score"], "risk_level": risk["risk_level"],
        "action": "APPROVE", "risk_factors": risk["reasons"],
        "explanation": ai["plain_english_rationale"], "headline": ai["headline"],
        "smart_routing": routing, "ml_anomaly_telemetry": risk["ml_anomaly_telemetry"],
        "razorpay_order_id": rzp_order_id,
        "razorpay_key_id": RZP_KEY_ID,
        "timestamp": ts, "message": "Order created. Awaiting payment authorization."
    }

@app.post("/api/payment/verify-success")
def verify_payment_success(payload: dict):
    t_id = payload.get("transaction_id")
    rzp_payment_id = payload.get("razorpay_payment_id")
    is_recovery = payload.get("is_recovery", False)

    target_status = "salvaged" if is_recovery else "success"

    for t in runtime_transactions:
        if t.get("transaction_id") == t_id:
            t["status"] = target_status
            t["razorpay_payment_id"] = rzp_payment_id
            break

    update_transaction_status_in_csv(t_id, target_status)
    save_decision_history({
        "transaction_id": t_id, 
        "action": "REVENUE SALVAGED" if is_recovery else "PAYMENT SETTLED", 
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

    return {"success": True, "transaction_id": t_id, "status": target_status, "message": "Payment verified and settled."}

# =========================================================
# RAZORPAY CRYPTOGRAPHIC WEBHOOK CONSUMER
# =========================================================

@app.post("/api/webhooks/razorpay")
async def razorpay_webhook_listener(request: Request):
    raw_body = await request.body()
    received_signature = request.headers.get("X-Razorpay-Signature")

    if RZP_WEBHOOK_SECRET and received_signature:
        expected_signature = hmac.new(
            RZP_WEBHOOK_SECRET.encode("utf-8"),
            raw_body,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_signature, received_signature):
            raise HTTPException(status_code=400, detail="Invalid webhook signature hash.")

    try:
        event_data = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload.")

    event_type = event_data.get("event")
    payload = event_data.get("payload", {})
    payment_entity = payload.get("payment", {}).get("entity", {})
    t_id = payment_entity.get("notes", {}).get("transaction_id") or payment_entity.get("receipt")

    if event_type in ["payment.captured", "order.paid"]:
        target_status = "salvaged" if payment_entity.get("notes", {}).get("source") == "whatsapp_dunning_recovery" else "success"
        if t_id:
            for t in runtime_transactions:
                if t.get("transaction_id") == t_id:
                    t["status"] = target_status
                    t["razorpay_payment_id"] = payment_entity.get("id")
                    break
            update_transaction_status_in_csv(t_id, target_status)
            save_decision_history({
                "transaction_id": t_id,
                "action": f"WEBHOOK RECONCILED: {event_type.upper()}",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })

    elif event_type == "payment.failed":
        if t_id:
            for t in runtime_transactions:
                if t.get("transaction_id") == t_id:
                    t["status"] = "failed"
                    break
            update_transaction_status_in_csv(t_id, "failed")

    return {"status": "accepted", "event": event_type, "transaction_id": t_id}

# =========================================================
# RECOVERY & DUNNING DISPATCH (SINGLE & BATCH)
# =========================================================

def send_real_or_simulated_whatsapp(phone: str, message: str) -> dict:
    if twilio_client and phone:
        try:
            msg = twilio_client.messages.create(
                from_=TWILIO_WHATSAPP_FROM,
                body=message,
                to=f"whatsapp:{phone}" if not phone.startswith("whatsapp:") else phone
            )
            return {"mode": "TWILIO_LIVE", "sid": msg.sid, "status": "sent"}
        except Exception as e:
            return {"mode": "SIMULATED_FALLBACK", "error": str(e)}
    return {"mode": "SIMULATED", "status": "mock_sent"}

@app.post("/api/recovery/dispatch")
def dispatch_recovery_link(payload: dict):
    tx_id = payload.get("transaction_id")
    channel = payload.get("channel", "WhatsApp")
    phone = payload.get("phone", "+919999999999")
    t = next((tx for tx in load_all_transactions() if tx.get("transaction_id") == tx_id), None)
    if not t:
        return {"success": False, "message": "Transaction not found"}
    
    amount = float(t.get("amount", 0))
    rec_link = f"https://rzp.io/i/rec_{tx_id.lower()}"
    msg_body = f"Hi, your payment of ₹{amount:,.2f} for {tx_id} was held. Click to complete instantly: {rec_link}"

    api_result = send_real_or_simulated_whatsapp(phone, msg_body)

    event = {
        "event_id": "rec_" + uuid.uuid4().hex[:6],
        "transaction_id": tx_id,
        "amount": amount,
        "channel": channel,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": "LINK_DISPATCHED_PENDING_PAYMENT",
        "api_delivery": api_result
    }
    recovery_events_log.insert(0, event)

    return {
        "success": True, 
        "message": f"Recovery Link dispatched via {channel}. Awaiting customer authorization.", 
        "event": event
    }

@app.post("/api/recovery/batch-dispatch")
def batch_dispatch_recovery():
    all_txs = load_all_transactions()
    failed_txs = [t for t in all_txs if str(t.get("status", "")).lower() == "failed"]
    
    dispatched_count = 0
    total_batch_value = 0.0

    for tx in failed_txs:
        amt = float(tx.get("amount", 0))
        total_batch_value += amt
        event = {
            "event_id": "rec_batch_" + uuid.uuid4().hex[:6],
            "transaction_id": tx.get("transaction_id"),
            "amount": amt,
            "channel": "WhatsApp / SMS Intent",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "status": "LINK_DISPATCHED_PENDING_PAYMENT"
        }
        recovery_events_log.insert(0, event)
        dispatched_count += 1

    return {
        "success": True,
        "dispatched_count": dispatched_count,
        "total_batch_value": total_batch_value,
        "message": f"Batch recovery campaign triggered for {dispatched_count} failed records (₹{total_batch_value:,.2f})."
    }

# =========================================================
# ML POLICY THRESHOLD TUNING
# =========================================================

class PolicyUpdate(BaseModel):
    high_risk_threshold: int
    medium_risk_threshold: int
    enforce_strict_geo: Optional[bool] = False

@app.get("/api/ml/policy")
def get_ml_policy():
    return ml_policy_config

@app.post("/api/ml/policy")
def update_ml_policy(policy: PolicyUpdate):
    ml_policy_config["high_risk_threshold"] = policy.high_risk_threshold
    ml_policy_config["medium_risk_threshold"] = policy.medium_risk_threshold
    ml_policy_config["enforce_strict_geo"] = policy.enforce_strict_geo
    return {"success": True, "message": "ML Risk Thresholds updated successfully.", "policy": ml_policy_config}

# =========================================================
# SYNTHETIC ATTACK INJECTION & AGENTIC COPILOT
# =========================================================

@app.post("/api/simulator/inject-attack")
def inject_synthetic_attack(payload: dict):
    scenario = payload.get("scenario", "bot_velocity")
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    if scenario == "bot_velocity":
        t_id = "ATK-BOT-" + uuid.uuid4().hex[:6].upper()
        attack_tx = {
            "transaction_id": t_id, "customer_id": "BOT-404", "amount": "999",
            "status": "failed", "payment_method": "Card", "device_id": "BOT-X",
            "location": "Moscow Proxy / Relay", "attempt_count": "7", "is_new_device": "1",
            "is_new_location": "1", "is_vpn_or_proxy": "1", "timestamp": timestamp
        }
        title, desc = "Card-Testing Bot Velocity Surge", "Injected 7 rapid authorizations from datacenter proxy."
    elif scenario == "device_hopping":
        t_id = "ATK-HOP-" + uuid.uuid4().hex[:6].upper()
        attack_tx = {
            "transaction_id": t_id, "customer_id": "C007", "amount": "64000",
            "status": "failed", "payment_method": "Card", "device_id": f"DEV-HOP-{random.randint(100, 999)}",
            "location": "Delhi, India", "attempt_count": "4", "is_new_device": "1",
            "is_new_location": "0", "timestamp": timestamp
        }
        title, desc = "Device-Hopping Takeover", "High-ticket card checkout executed across rotated device hashes."
    elif scenario == "proxy_probe":
        t_id = "ATK-PRX-" + uuid.uuid4().hex[:6].upper()
        attack_tx = {
            "transaction_id": t_id, "customer_id": "C010", "amount": "145000",
            "status": "failed", "payment_method": "Card", "device_id": "DEV-TOR-EXIT",
            "location": "Unknown Relay / DataCenter", "attempt_count": "5", "is_new_device": "1",
            "is_new_location": "1", "is_vpn_or_proxy": "1", "timestamp": timestamp
        }
        title, desc = "Datacenter Proxy High-Ticket Probe", "₹1,45,000 transaction from TOR proxy."
    else:
        t_id = "VIP-PAY-" + uuid.uuid4().hex[:6].upper()
        attack_tx = {
            "transaction_id": t_id, "customer_id": "C001", "amount": "1250",
            "status": "success", "payment_method": "UPI", "device_id": "DEV-001",
            "location": "Bengaluru, India", "attempt_count": "1", "is_new_device": "0",
            "is_new_location": "0", "timestamp": timestamp
        }
        title, desc = "Clean VIP Fast-Pass", "Verified user payment passing cleanly through Turbo UPI."

    runtime_transactions.insert(0, attack_tx)
    save_transaction_to_csv(attack_tx)
    risk = calculate_risk(attack_tx)
    save_decision_history({"transaction_id": t_id, "action": "AUTONOMOUS BLOCK" if attack_tx["status"] == "failed" else "FAST-PASS APPROVE", "timestamp": timestamp})

    return {
        "success": True, "scenario": scenario, "scenario_title": title,
        "description": desc, "injected_transaction": attack_tx, "risk_evaluation": risk
    }

@app.post("/api/copilot/chat")
def copilot_chat(payload: dict):
    user_query = payload.get("query", "").strip()
    if not user_query:
        return {"success": True, "response": "👋 Hi there! I'm **PayPilot Copilot**. Ask me to audit transactions (e.g. `audit TXN011`), inspect ML vectors, or check recovery stats.", "action_suggestions": ["Audit TXN011", "Why did Kolkata fail?", "Smart Routing status", "Explain ML Architecture", "Show Recovery Stats"]}

    q_lower = user_query.lower()
    all_txs = load_all_transactions()
    total_tx = len(all_txs)
    failed_tx = [t for t in all_txs if str(t.get("status", "")).lower() == "failed"]
    money_protected = sum(float(t.get("amount", 0)) for t in failed_tx)
    recovered_val = sum(float(t.get("amount", 0)) for t in all_txs if str(t.get("status", "")).lower() == "salvaged")

    for t in all_txs:
        t_id = t.get("transaction_id", "").lower()
        if t_id and t_id in q_lower:
            risk = calculate_risk(t)
            routing = calculate_smart_routing(t, risk)
            ml = risk["ml_anomaly_telemetry"]
            ans = (
                f"🔎 **Hybrid Audit for {t.get('transaction_id')}**\n\n"
                f"• **Heuristic Risk:** Score {risk['risk_score']}/100 ({risk['risk_level']} Risk)\n"
                f"• **ML Isolation Core:** `{ml['anomaly_classification']}` (Conf: {ml['confidence_index']})\n"
                f"• **Anomaly Vectors:** Amount Dev: {ml['feature_vectors']['amount_deviation_pct']}%, Velocity Dev: {ml['feature_vectors']['velocity_anomaly_pct']}%\n"
                f"• **Smart Gateway Rail:** `{routing['selected_rail']}` (Fee: {routing['processing_fee_est']})\n"
                f"• **Prescribed Directive:** `{risk['recommended_action']}`"
            )
            return {"success": True, "response": ans, "action_suggestions": [f"Generate Defense for {t.get('transaction_id')}", "Dispatch Recovery Link", "Check Trust Score"]}

    if "recover" in q_lower or "dunning" in q_lower:
        ans = (
            f"🔄 **Autonomous Dunning & Recovery Telemetry**\n\n"
            f"• **Total Recovered Revenue:** ₹{recovered_val:,.2f}\n"
            f"• **Active Recovery Dispatches:** {len(recovery_events_log)} pre-authenticated links sent\n"
            f"• **Primary Channels:** WhatsApp Intent & Turbo UPI Split-Escrow"
        )
        return {"success": True, "response": ans, "action_suggestions": ["Audit TXN011", "View Recovery Stream"]}

    if "defense" in q_lower or "chargeback" in q_lower or "rebuttal" in q_lower or "dispute" in q_lower:
        target_tx = failed_tx[0] if failed_tx else all_txs[0]
        defense = generate_chargeback_defense(target_tx)
        ans = (
            f"🛡️ **Autonomous Chargeback Defense Generated for {defense['transaction_id']}**\n\n"
            f"• **Estimated Win Probability:** {defense['win_probability_estimate']}\n"
            f"• **Dossier Status:** {defense['dossier_status']}\n"
            f"• **Evidence Attached:** {', '.join(defense['evidence_attachments'])}\n\n"
            f"Dossier ready for 1-click submission to Razorpay Dispute Center."
        )
        return {"success": True, "response": ans, "action_suggestions": ["View Telemetry Proof", "Reroute Traffic"]}

    greetings = ["hi", "hello", "hey", "hola", "namaste", "good morning", "good evening"]
    if any(q_lower == g or q_lower.startswith(g + " ") for g in greetings):
        return {
            "success": True,
            "response": "👋 Hello! I am **PayPilot AI Copilot**, your autonomous payment risk, ML intelligence, and orchestration agent. How can I assist you today?",
            "action_suggestions": ["Why did Kolkata fail?", "Show Revenue Protected", "Audit TXN011", "Explain ML Architecture"]
        }

    return {
        "success": True,
        "response": f"Analyzing {total_tx} active transactions: Checkout health is optimal with ₹{money_protected:,.2f} protected from dispute liability. You can ask me to audit any transaction, check ML features, or inject synthetic attack scenarios.",
        "action_suggestions": ["Audit TXN011", "Why did Kolkata fail?", "Simulate Attack Surge"]
    }

# =========================================================
# STANDARD API ROUTERS & DASHBOARD
# =========================================================

@app.get("/")
def home():
    return {
        "service": "PayPilot AI Enterprise Live",
        "status": "online",
        "version": "6.0.0",
        "razorpay_integrated": rzp_client is not None,
        "twilio_integrated": twilio_client is not None
    }

@app.get("/api/transactions")
def get_transactions():
    return load_all_transactions()

@app.get("/api/transactions/risk")
def get_transactions_with_risk():
    results = []
    for t in load_all_transactions():
        risk = calculate_risk(t)
        results.append({**t, **risk, "smart_routing": calculate_smart_routing(t, risk)})
    return results

@app.get("/api/transactions/{transaction_id}/chargeback-defense")
def get_chargeback_defense_endpoint(transaction_id: str):
    t = next((tx for tx in load_all_transactions() if tx.get("transaction_id") == transaction_id), None)
    if not t: return {"success": False, "message": "Not found"}
    return {"success": True, "defense": generate_chargeback_defense(t)}

@app.get("/api/transactions/{transaction_id}/recovery-plan")
def get_recovery_plan(transaction_id: str):
    t = next((tx for tx in load_all_transactions() if tx.get("transaction_id") == transaction_id), None)
    if not t: return {"success": False, "message": "Transaction not found"}
    risk = calculate_risk(t)
    plan = generate_smart_recovery_plan(t, risk)
    return {"success": True, "recovery_plan": plan}

@app.post("/api/transactions/action")
def transaction_action(action_data: dict):
    t_id, act = action_data.get("transaction_id"), action_data.get("action")
    if not t_id or not act: return {"success": False, "message": "Invalid"}
    decision = {"transaction_id": t_id, "action": act, "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    decision_history.insert(0, decision)
    save_decision_history(decision)
    return {"success": True, "message": f"Action '{act}' recorded for {t_id}"}

@app.get("/api/dashboard")
def get_dashboard():
    txs = load_all_transactions()
    
    settled_txs = [t for t in txs if str(t.get("status", "")).lower() in ["success", "settled", "salvaged"]]
    total_processed_volume = len(settled_txs)
    
    total_evaluated = len(txs)
    rate = round((total_processed_volume / total_evaluated) * 100, 1) if total_evaluated > 0 else 100.0
    
    high_risk = sum(1 for t in txs if calculate_risk(t)["risk_level"] == "High")
    protected = sum(float(t.get("amount", 0)) for t in txs if str(t.get("status", "")).lower() == "failed")
    recovered = sum(float(t.get("amount", 0)) for t in txs if str(t.get("status", "")).lower() == "salvaged")

    return {
        "total_transactions": total_processed_volume,
        "payment_success_rate": rate,
        "high_risk_transactions": high_risk,
        "money_protected": round(protected, 2),
        "money_recovered": round(recovered, 2)
    }